# v0.3.0
# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }
import genlayer as gl
from genlayer import *
from dataclasses import dataclass
import typing

# ArbitrationConsumer — a marketplace that outsources its disputes to CourtRoom.
#
# A seller lists an order. A buyer pays them off-chain or on-chain, as
# marketplaces do. When the buyer says the goods never arrived, the marketplace
# does not adjudicate: it opens a dispute, pins exactly what was alleged, points
# the buyer at CourtRoom, and then applies whatever CourtRoom rules — refund,
# release or split — without an opinion of its own.
#
# IT HOLDS NO MONEY. There is not a payable method in this file, not a storage
# field denominated in value, and not a transfer anywhere in it. That is a
# deliberate narrowing and it is worth saying why, because the obvious design
# does the opposite.
#
#   The obvious design has `request_arbitration` take the filing fee, forward it
#   to CourtRoom, and file the case in the MARKETPLACE'S name. Two things go
#   wrong with it and both are expensive.
#
#   First, a cross-contract write on this runner posts an internal message that
#   is applied on finalisation. It returns nothing. So the marketplace could
#   file a case and have no way of learning the case id it had just created —
#   it would be reduced to guessing, or to scanning the docket for something
#   that looked like its own filing.
#
#   Second, and much worse: a case filed in the marketplace's name pays out to
#   the marketplace. The buyer's award would land in a contract that then needs
#   its own custody ledger, its own withdraw, and its own correctness. An
#   earlier project in this series shipped exactly that shape — refunds on the
#   refusal path, no exit at all on the accepted path — and SUCCEEDING was the
#   way to lose your money. "Is there a withdraw method?" answered yes the whole
#   time.
#
#   So the buyer files in their own name and CourtRoom pays the buyer directly.
#   The marketplace never touches the money, which means it cannot lose it.
#
# What is left is the part that was always the point, and it is strictly
# stronger than fire-and-forget:
#
#   1. `request_arbitration` PINS THE ALLEGATION. It hashes the claim and the
#      evidence at the moment the dispute is opened and stores the digest. A
#      case can only be linked to this order later if its stored filing hashes
#      to the same digest — so nobody can open a dispute about one thing and
#      then attach a court case about another.
#
#   2. `link_case` IS FORGERY-PROOF AND PERMISSIONLESS. It reads the case back
#      out of CourtRoom and requires that the plaintiff is this order's buyer,
#      the defendant is this order's seller, the amount matches the order, and
#      the filing digest matches what `request_arbitration` pinned. Four
#      independent facts, all read from the court rather than asserted by the
#      caller. A stranger can link a genuine case; nobody can link a fake one.
#
#   3. IT TREATS THE COURT AS UNTRUSTED-BY-DEFAULT. `get_ruling` never raises
#      over there, so the happy path here never runs through an exception
#      handler, and every field it returns is checked here before it is used. A
#      consumer that assumed `decided` was true would treat "nobody has heard
#      this case yet" as a dismissal — and then release the seller's goods.
#
#   4. ONE POLICY, EVALUATED IN ONE PLACE. `preview_resolution` (a view) and
#      `resolve_order` (a write) both call `_apply`, so what a reader previews
#      and what the chain records cannot drift apart.

ERR_EXPECTED = "[EXPECTED]"

# --- order lifecycle
O_OPEN = "OPEN"
O_DISPUTED = "DISPUTED"          # arbitration requested, no case linked yet
O_IN_COURT = "IN_COURT"          # a verified case is linked and undecided
O_RESOLVED = "RESOLVED"
ORDER_STATUSES = (O_OPEN, O_DISPUTED, O_IN_COURT, O_RESOLVED)

# --- what the marketplace did about it
A_REFUND = "REFUND_BUYER"
A_RELEASE = "RELEASE_SELLER"
A_SPLIT = "SPLIT"
A_NONE = "NO_ACTION"
ACTIONS = (A_REFUND, A_RELEASE, A_SPLIT, A_NONE)

BPS = 10000
MAX_ORDERS = 1000
MAX_ID = 64
MAX_TEXT = 400
SCAN_CAP = 200
ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"


# --- helpers. Duplicated from CourtRoom rather than imported: GenVM deploys one
# file with no module path between contracts, so a shared import would simply
# fail to resolve at deploy time.

def _as_int(v: typing.Any, default: int = 0) -> int:
    if isinstance(v, bool):
        return default
    if isinstance(v, int):
        return v
    if isinstance(v, float):
        return int(v)
    if isinstance(v, str):
        t = v.strip()
        neg = t.startswith("-")
        if neg:
            t = t[1:]
        if t == "" or not t.isdigit():
            return default
        return -int(t) if neg else int(t)
    return default


def _clamp(v: int, lo: int, hi: int) -> int:
    return lo if v < lo else (hi if v > hi else v)


def _flat(s: typing.Any) -> str:
    return " ".join(str(s).split())


def _clean(s: typing.Any, n: int) -> str:
    out = []
    for ch in _flat(s):
        o = ord(ch)
        if o < 32 or o == 127:
            continue
        out.append(ch)
        if len(out) >= n:
            break
    return "".join(out)


def _fnv(s: str) -> str:
    """FNV-1a 64, length-prefixed. The SAME function CourtRoom uses, so a digest
    computed here and a digest computed there are comparable."""
    h = 0xCBF29CE484222325
    for b in str(s).encode("utf-8"):
        h = h ^ b
        h = (h * 0x100000001B3) & 0xFFFFFFFFFFFFFFFF
    return str(len(s)) + ":" + format(h, "016x")


def _filing_digest(claim_text: str, evidence_text: str) -> str:
    """What `request_arbitration` pins and `link_case` re-checks.

    Over the CLEANED text, because CourtRoom cleans a filing before it stores it
    and a digest taken over the raw input would never match the stored one. That
    mismatch would not fail loudly — it would just make every honest link
    impossible, which is the worst kind of bug to ship."""
    return _fnv(_clean(claim_text, 2000) + "|#|"
                + _clean(evidence_text, 5000))


def _days_from_civil(y: int, m: int, d: int) -> int:
    y -= 1 if m <= 2 else 0
    era = (y if y >= 0 else y - 399) // 400
    yoe = y - era * 400
    doy = (153 * (m + (-3 if m > 2 else 9)) + 2) // 5 + d - 1
    doe = yoe * 365 + yoe // 4 - yoe // 100 + doy
    return era * 146097 + doe - 719468


def _epoch_from_iso(value: typing.Any) -> int:
    if not isinstance(value, str) or len(value) < 19:
        return 0
    try:
        year = int(value[0:4])
        month = int(value[5:7])
        day = int(value[8:10])
        hour = int(value[11:13])
        minute = int(value[14:16])
        second = int(value[17:19])
    except Exception:
        return 0
    if month < 1 or month > 12 or day < 1 or day > 31:
        return 0
    if hour > 23 or minute > 59 or second > 60:
        return 0
    return (_days_from_civil(year, month, day) * 86400
            + hour * 3600 + minute * 60 + second)


def _norm_id(raw: typing.Any) -> str:
    """An order id: lower case, alphanumeric plus dash and underscore.

    Narrow on purpose. The id is a TreeMap key and it is echoed back into every
    view, so anything that can carry a control character or a separator into it
    is something that can make two different orders look like one."""
    out = []
    for ch in str(raw).strip().lower():
        if ch.isalnum() or ch == "-" or ch == "_":
            out.append(ch)
        if len(out) >= MAX_ID:
            break
    return "".join(out)


@gl.contract.interface
class ICourtRoom:
    """The read surface this consumer depends on.

    DELIBERATELY READ-ONLY. There are no write methods here, and that is a
    design statement rather than an omission: a consumer that could make the
    court write would be a consumer that could spend somebody else's filing fee,
    open a case in their name, or burn their once-an-hour filing slot."""

    class View:
        def get_ruling(self, case_id: typing.Any) -> typing.Any:
            pass

        def get_case(self, case_id: typing.Any) -> typing.Any:
            pass

        def get_config(self) -> typing.Any:
            pass

    class Write:
        pass


@gl.storage.allow
@dataclass
class Order:
    """One marketplace order and everything that happened to it.

    NO VALUE FIELDS. This record says what was ordered, what was alleged and
    what the court decided; it does not say that this contract is holding
    anything, because it never is."""
    order_id: str
    buyer: Address
    seller: Address
    amount_wei: u256
    description: str
    status: str

    # --- the dispute
    dispute_claim: str
    dispute_evidence: str
    filing_digest: str
    disputed_at: u64
    disputed_by: Address

    # --- the court case, once one has been verified against this order
    case_id: u32
    linked_at: u64
    linked_by: Address

    # --- the ruling, as read back from CourtRoom
    action: str
    outcome: str
    award_bps: u32
    buyer_share_wei: u256
    seller_share_wei: u256
    ruling_hash: str
    resolved_at: u64
    rationale: str

    created_at: u64


class ArbitrationConsumer(gl.contract.Contract):
    owner: Address
    court: Address
    paused: bool

    orders: gl.storage.TreeMap[str, Order]
    order_ids: gl.storage.DynArray[str]
    case_to_order: gl.storage.TreeMap[str, str]

    order_count: u32
    dispute_count: u32
    linked_count: u32
    resolved_count: u32
    refund_count: u32
    release_count: u32
    split_count: u32

    def __init__(self, court: str):
        self.owner = gl.message.sender_address
        # An unusable court address is fatal HERE and only here. A marketplace
        # deployed against a contract that cannot answer is a marketplace whose
        # every dispute would dead-end, which is worse than a failed deploy.
        self.court = Address(court)
        self.paused = False
        self.order_count = u32(0)
        self.dispute_count = u32(0)
        self.linked_count = u32(0)
        self.resolved_count = u32(0)
        self.refund_count = u32(0)
        self.release_count = u32(0)
        self.split_count = u32(0)

    # --- internals ---------------------------------------------------------

    def _now(self) -> int:
        return _epoch_from_iso(gl.message.raw.get("datetime", ""))

    def _is_owner(self) -> bool:
        return gl.message.sender_address == self.owner

    def _refuse(self, reason: str, extra: typing.Any = None) -> dict:
        """Same rule as CourtRoom: NOTHING HERE RAISES.

        This contract takes no value, so a revert would strand nothing — but a
        uniform refusal shape across both contracts means an integrator reads
        `status` in one place instead of catching exceptions from one contract
        and reading statuses from the other."""
        out = {"status": "REJECTED", "reason": str(reason)}
        if isinstance(extra, dict):
            for k in extra:
                out[k] = extra[k]
        return out

    def _ruling(self, case_id: typing.Any) -> typing.Any:
        """One cross-contract read. Never raises over there, so the happy path
        here never runs through an error handler."""
        return ICourtRoom(self.court).view().get_ruling(case_id)

    def _filing(self, case_id: typing.Any) -> typing.Any:
        """The full case, for the one check that needs the stored filing text."""
        return ICourtRoom(self.court).view().get_case(case_id)

    def _apply(self, amount: int, ruling: typing.Any) -> dict:
        """THE WHOLE POLICY, IN ONE PLACE.

        Both the preview and the write go through here, so what a reader sees
        and what the chain records are produced by the same code rather than by
        two copies of four rules that drift apart on the fifth edit.

        Never raises. A court that is down, absent or nonsensical is NO_ACTION
        with a reason, not an exception thrown at the caller."""
        out = {"action": A_NONE, "outcome": "", "award_bps": 0,
               "buyer_share_wei": 0, "seller_share_wei": amount,
               "rationale": "", "ok": False, "ruling_hash": ""}
        if not isinstance(ruling, dict):
            out["rationale"] = ("the court did not answer; the order is left "
                                "exactly as it was")
            return out
        if not ruling.get("found"):
            out["rationale"] = "the court has no case with that id"
            return out
        if not ruling.get("decided"):
            out["rationale"] = ("that case is " + str(ruling.get("status", "?"))
                                + " and has not been decided; nothing is "
                                "released and nothing is refunded")
            return out

        outcome = str(ruling.get("outcome", ""))
        bps = _clamp(_as_int(ruling.get("award_bps"), 0), 0, BPS)
        out["outcome"] = outcome
        out["award_bps"] = bps
        out["ruling_hash"] = str(ruling.get("content_hash", ""))

        # The award is expressed as a fraction of the amount claimed, and this
        # marketplace applies that same fraction to ITS OWN order value rather
        # than to the court's wei figure. The two are equal whenever the buyer
        # claimed the order value, which `link_case` enforces — the fraction is
        # used anyway, because a marketplace that trusted a wei figure it had
        # not itself checked would be a marketplace with an oracle it did not
        # verify.
        buyer = (amount * bps) // BPS
        seller = amount - buyer
        out["buyer_share_wei"] = buyer
        out["seller_share_wei"] = seller
        out["ok"] = True

        if outcome == "PLAINTIFF_WINS":
            out["action"] = A_REFUND
            out["rationale"] = ("the court found for the buyer in full; the "
                               "order is refunded")
        elif outcome == "DEFENDANT_WINS":
            out["action"] = A_RELEASE
            out["buyer_share_wei"] = 0
            out["seller_share_wei"] = amount
            out["rationale"] = ("the court found for the seller; the order "
                                "value is released to them")
        elif outcome == "PARTIAL":
            out["action"] = A_SPLIT
            out["rationale"] = ("the court split it " + str(bps // 100)
                                + "/" + str(100 - bps // 100)
                                + " in the buyer's favour")
        elif outcome == "DISMISSED":
            # NOT a seller win. "Neither side proved anything" is a different
            # statement from "the seller is in the right", and a marketplace
            # that treated them the same would be using an absence of evidence
            # as evidence — against whichever party happened to be the
            # defendant.
            out["action"] = A_NONE
            out["ok"] = False
            out["buyer_share_wei"] = 0
            out["seller_share_wei"] = amount
            out["rationale"] = ("the court dismissed it: neither side put "
                                "enough on the record. This marketplace makes "
                                "no automatic finding on a dismissal.")
        else:
            out["action"] = A_NONE
            out["ok"] = False
            out["rationale"] = ("the court returned an outcome this policy "
                                "does not recognise: " + outcome)
        return out

    def _order_view(self, order: Order) -> dict:
        return {
            "found": True,
            "order_id": str(order.order_id),
            "buyer": order.buyer.as_hex,
            "seller": order.seller.as_hex,
            "amount_wei": str(int(order.amount_wei)),
            "description": str(order.description),
            "status": str(order.status),
            "dispute_claim": str(order.dispute_claim),
            "dispute_evidence": str(order.dispute_evidence),
            "filing_digest": str(order.filing_digest),
            "disputed_at": int(order.disputed_at),
            "disputed_by": order.disputed_by.as_hex,
            "case_id": int(order.case_id),
            "linked_at": int(order.linked_at),
            "linked_by": order.linked_by.as_hex,
            "action": str(order.action),
            "outcome": str(order.outcome),
            "award_bps": int(order.award_bps),
            "award_pct": int(order.award_bps) // 100,
            "buyer_share_wei": str(int(order.buyer_share_wei)),
            "seller_share_wei": str(int(order.seller_share_wei)),
            "ruling_hash": str(order.ruling_hash),
            "resolved_at": int(order.resolved_at),
            "rationale": str(order.rationale),
            "created_at": int(order.created_at),
        }

    # --- writes ------------------------------------------------------------

    @gl.public.write
    def register_order(self, order_id: str, buyer: str, seller: str,
                       amount_wei: typing.Any, description: str
                       ) -> typing.Any:
        """Record a marketplace order. No value changes hands here or anywhere
        else in this contract."""
        oid = _norm_id(order_id)
        if not oid:
            return self._refuse("order_id must contain letters or digits")
        if oid in self.orders:
            return self._refuse("order " + oid + " already exists")
        if self.paused:
            return self._refuse("new orders are paused; disputes, links and "
                                "resolutions all still work")
        if len(self.order_ids) >= MAX_ORDERS:
            return self._refuse("order book is full (" + str(MAX_ORDERS) + ")")
        try:
            b = Address(str(buyer))
            s = Address(str(seller))
        except Exception:
            return self._refuse("buyer and seller must both be wallet "
                                "addresses")
        if b == s:
            return self._refuse("buyer and seller cannot be the same wallet")
        if b.as_hex == ZERO_ADDRESS or s.as_hex == ZERO_ADDRESS:
            return self._refuse("the zero address cannot be a party")
        amount = _as_int(amount_wei, -1)
        if amount <= 0:
            return self._refuse("amount_wei must be greater than zero")

        now = self._now()
        order = self.orders.get_or_insert_default(oid)
        order.order_id = oid
        order.buyer = b
        order.seller = s
        order.amount_wei = u256(amount)
        order.description = _clean(description, MAX_TEXT)
        order.status = O_OPEN
        order.dispute_claim = ""
        order.dispute_evidence = ""
        order.filing_digest = ""
        order.disputed_at = u64(0)
        order.disputed_by = Address(ZERO_ADDRESS)
        order.case_id = u32(0)
        order.linked_at = u64(0)
        order.linked_by = Address(ZERO_ADDRESS)
        order.action = ""
        order.outcome = ""
        order.award_bps = u32(0)
        order.buyer_share_wei = u256(0)
        order.seller_share_wei = u256(0)
        order.ruling_hash = ""
        order.resolved_at = u64(0)
        order.rationale = ""
        order.created_at = u64(now)
        self.order_ids.append(oid)
        self.order_count = u32(int(self.order_count) + 1)
        return {"status": "OK", "order_id": oid, "order_status": O_OPEN,
                "buyer": b.as_hex, "seller": s.as_hex,
                "amount_wei": str(amount)}

    @gl.public.write
    def request_arbitration(self, order_id: str, claim_text: str,
                            evidence_text: str) -> typing.Any:
        """Open a dispute and PIN what is being alleged.

        Buyer only. It hashes the claim and the evidence and stores the digest,
        which is what makes `link_case` meaningful later: a case can only be
        attached to this order if the filing CourtRoom actually stored hashes to
        this same digest. Without the pin, a buyer could dispute one thing and
        then link a court case about another, and the marketplace would enforce
        a ruling nobody in the order had ever seen.

        It returns the exact filing the buyer should send to CourtRoom. The
        buyer signs that filing THEMSELVES — see the header for why this
        contract deliberately does not file on their behalf and does not touch
        the money."""
        oid = _norm_id(order_id)
        if oid not in self.orders:
            return self._refuse("no order " + str(oid))
        order = self.orders[oid]
        if str(order.status) != O_OPEN:
            return self._refuse("order " + oid + " is " + str(order.status).lower()
                                + "; only an open order can be disputed")
        if gl.message.sender_address != order.buyer:
            return self._refuse("only the buyer (" + order.buyer.as_hex
                                + ") may open a dispute on this order")
        claim = _clean(claim_text, 2000)
        evidence = _clean(evidence_text, 5000)
        if len(claim) < 20:
            return self._refuse("describe the dispute in at least 20 "
                                "characters")
        if len(evidence) < 20:
            return self._refuse("submit at least 20 characters of evidence")

        now = self._now()
        order.status = O_DISPUTED
        order.dispute_claim = claim
        order.dispute_evidence = evidence
        order.filing_digest = _filing_digest(claim, evidence)
        order.disputed_at = u64(now)
        order.disputed_by = gl.message.sender_address
        self.dispute_count = u32(int(self.dispute_count) + 1)
        return {
            "status": "OK",
            "order_id": oid,
            "order_status": O_DISPUTED,
            "filing_digest": str(order.filing_digest),
            "file_at": self.court.as_hex,
            "file_with": {
                "method": "file_case",
                "defendant": order.seller.as_hex,
                "claim_text": claim,
                "evidence_text": evidence,
                "amount_wei": str(int(order.amount_wei)),
            },
            "then": "link_case(\"" + oid + "\", <case_id>) — anyone may call "
                    "it, and it is refused unless the court's own record of "
                    "the case matches this order on all four of buyer, seller, "
                    "amount and filing digest",
        }

    @gl.public.write
    def link_case(self, order_id: str, case_id: typing.Any) -> typing.Any:
        """Attach a CourtRoom case to this order. PERMISSIONLESS AND VERIFIED.

        Four facts are read out of the court and checked here — plaintiff is the
        buyer, defendant is the seller, the amount matches the order, and the
        stored filing hashes to the digest pinned at dispute time. Not one of
        them is taken from the caller. So a stranger can link a genuine case
        (which is useful: anybody can finish the job) and nobody can link a fake
        one (which is the point)."""
        oid = _norm_id(order_id)
        if oid not in self.orders:
            return self._refuse("no order " + str(oid))
        order = self.orders[oid]
        if str(order.status) == O_RESOLVED:
            return self._refuse("order " + oid + " is already resolved")
        if str(order.status) != O_DISPUTED:
            return self._refuse("order " + oid + " is " + str(order.status).lower()
                                + "; request_arbitration first")
        cid = _as_int(case_id, 0)
        if cid < 1:
            return self._refuse("case_id must be a positive integer")
        key = str(cid)
        if key in self.case_to_order and str(self.case_to_order[key]) != oid:
            return self._refuse("case " + key + " is already linked to order "
                                + str(self.case_to_order[key]))

        try:
            ruling = self._ruling(cid)
        except Exception as e:
            return self._refuse("the court did not answer: " + str(e)[:120])
        if not isinstance(ruling, dict) or not ruling.get("found"):
            return self._refuse("the court has no case " + key)

        try:
            plaintiff = Address(str(ruling.get("plaintiff", ZERO_ADDRESS)))
            defendant = Address(str(ruling.get("defendant", ZERO_ADDRESS)))
        except Exception:
            return self._refuse("the court returned an unreadable party "
                                "address for case " + key)
        if plaintiff != order.buyer:
            return self._refuse("case " + key + " was filed by "
                                + plaintiff.as_hex + ", not by this order's "
                                "buyer " + order.buyer.as_hex)
        if defendant != order.seller:
            return self._refuse("case " + key + " names " + defendant.as_hex
                                + " as defendant, not this order's seller "
                                + order.seller.as_hex)
        if _as_int(ruling.get("amount_claimed_wei"), -1) != int(order.amount_wei):
            return self._refuse("case " + key + " claims "
                                + str(ruling.get("amount_claimed_wei"))
                                + " wei; this order is for "
                                + str(int(order.amount_wei)) + " wei")

        try:
            filing = self._filing(cid)
        except Exception as e:
            return self._refuse("the court did not return the filing: "
                                + str(e)[:120])
        if not isinstance(filing, dict) or not filing.get("found"):
            return self._refuse("the court did not return the filing for case "
                                + key)
        digest = _filing_digest(str(filing.get("claim_text", "")),
                                str(filing.get("evidence_text", "")))
        if digest != str(order.filing_digest):
            return self._refuse(
                "case " + key + " is about something else: its filing hashes "
                "to " + digest + ", and this dispute pinned "
                + str(order.filing_digest))

        order.case_id = u32(cid)
        order.linked_at = u64(self._now())
        order.linked_by = gl.message.sender_address
        order.status = O_IN_COURT
        self.case_to_order[key] = oid
        self.linked_count = u32(int(self.linked_count) + 1)
        return {"status": "OK", "order_id": oid, "case_id": cid,
                "order_status": O_IN_COURT,
                "verified": ["plaintiff_is_buyer", "defendant_is_seller",
                             "amount_matches", "filing_digest_matches"],
                "then": "resolve_order(\"" + oid + "\") once the court has "
                        "decided"}

    @gl.public.write
    def resolve_order(self, order_id: str) -> typing.Any:
        """Apply the court's ruling to the order. PERMISSIONLESS.

        Permissionless because neither party should be able to sit on a ruling
        they dislike. It refuses on a case that is not decided, and it refuses
        on a dismissal — see `_apply` for why a dismissal is not a seller win."""
        oid = _norm_id(order_id)
        if oid not in self.orders:
            return self._refuse("no order " + str(oid))
        order = self.orders[oid]
        if str(order.status) == O_RESOLVED:
            return self._refuse("order " + oid + " was resolved at "
                                + str(int(order.resolved_at)))
        if str(order.status) != O_IN_COURT:
            return self._refuse("order " + oid + " has no verified court case; "
                                "link_case first")
        try:
            ruling = self._ruling(int(order.case_id))
        except Exception as e:
            return self._refuse("the court did not answer: " + str(e)[:120])
        decided = self._apply(int(order.amount_wei), ruling)
        if not decided.get("ok"):
            return self._refuse(str(decided.get("rationale", "no action")),
                                {"order_id": oid,
                                 "case_id": int(order.case_id),
                                 "outcome": str(decided.get("outcome", "")),
                                 "action": A_NONE})

        order.action = str(decided["action"])
        order.outcome = str(decided["outcome"])
        order.award_bps = u32(_as_int(decided["award_bps"], 0))
        order.buyer_share_wei = u256(_as_int(decided["buyer_share_wei"], 0))
        order.seller_share_wei = u256(_as_int(decided["seller_share_wei"], 0))
        order.ruling_hash = str(decided.get("ruling_hash", ""))
        order.rationale = _clean(decided.get("rationale", ""), MAX_TEXT)
        order.resolved_at = u64(self._now())
        order.status = O_RESOLVED
        self.resolved_count = u32(int(self.resolved_count) + 1)
        if order.action == A_REFUND:
            self.refund_count = u32(int(self.refund_count) + 1)
        elif order.action == A_RELEASE:
            self.release_count = u32(int(self.release_count) + 1)
        elif order.action == A_SPLIT:
            self.split_count = u32(int(self.split_count) + 1)
        return {"status": "OK", "order_id": oid, "order_status": O_RESOLVED,
                "case_id": int(order.case_id),
                "action": str(order.action), "outcome": str(order.outcome),
                "award_bps": int(order.award_bps),
                "buyer_share_wei": str(int(order.buyer_share_wei)),
                "seller_share_wei": str(int(order.seller_share_wei)),
                "rationale": str(order.rationale)}

    @gl.public.write
    def set_paused(self, paused: typing.Any) -> typing.Any:
        """Owner: stop NEW orders. Nothing else — a dispute already open can
        always be pursued to a resolution."""
        if not self._is_owner():
            return self._refuse("owner only")
        self.paused = bool(paused)
        return {"status": "OK", "paused": bool(self.paused),
                "still_works": ["request_arbitration", "link_case",
                                "resolve_order", "every view"]}

    @gl.public.write
    def transfer_ownership(self, new_owner: str) -> typing.Any:
        """Owner: hand over the two powers there are — pausing new orders, and
        this."""
        if not self._is_owner():
            return self._refuse("owner only")
        try:
            target = Address(str(new_owner))
        except Exception:
            return self._refuse("that is not a wallet address")
        if target.as_hex == ZERO_ADDRESS:
            return self._refuse("ownership cannot go to the zero address")
        was = self.owner.as_hex
        self.owner = target
        return {"status": "OK", "owner": target.as_hex, "was": was}

    # --- reads -------------------------------------------------------------

    @gl.public.view
    def get_order(self, order_id: str) -> typing.Any:
        """One order, with its dispute, its linked case and its resolution."""
        oid = _norm_id(order_id)
        if oid not in self.orders:
            return {"found": False, "order_id": oid}
        return self._order_view(self.orders[oid])

    @gl.public.view
    def get_orders(self, offset: typing.Any, count: typing.Any) -> typing.Any:
        """A page of the order book, oldest first."""
        total = len(self.order_ids)
        start = _clamp(_as_int(offset, 0), 0, total)
        want = _clamp(_as_int(count, 20), 1, 50)
        out = []
        i = start
        while i < total and len(out) < want:
            oid = str(self.order_ids[i])
            if oid in self.orders:
                out.append(self._order_view(self.orders[oid]))
            i += 1
        return {"offset": start, "count": len(out), "total": total,
                "orders": out}

    @gl.public.view
    def get_ruling(self, case_id: typing.Any) -> typing.Any:
        """Read a CourtRoom verdict through this contract.

        The passthrough the brief asks for, plus the one thing a passthrough
        owes its caller: `linked_order` says whether this marketplace has
        actually verified that case against an order of its own. A ruling that
        is real but unlinked is a ruling about somebody else's dispute."""
        cid = _as_int(case_id, 0)
        try:
            ruling = self._ruling(cid)
        except Exception as e:
            return {"case_id": cid, "found": False, "decided": False,
                    "reason": "the court did not answer: " + str(e)[:120]}
        if not isinstance(ruling, dict):
            return {"case_id": cid, "found": False, "decided": False,
                    "reason": "the court returned something unreadable"}
        key = str(cid)
        linked = str(self.case_to_order[key]) if key in self.case_to_order else ""
        out = {}
        for k in ruling:
            out[k] = ruling[k]
        out["linked_order"] = linked
        out["verified_by_this_marketplace"] = bool(linked)
        return out

    @gl.public.view
    def preview_resolution(self, order_id: str) -> typing.Any:
        """What `resolve_order` would do right now, without doing it.

        The same `_apply` the write uses, so a preview and a resolution cannot
        disagree."""
        oid = _norm_id(order_id)
        if oid not in self.orders:
            return {"found": False, "order_id": oid}
        order = self.orders[oid]
        if int(order.case_id) < 1:
            return {"found": True, "order_id": oid, "ok": False,
                    "action": A_NONE, "case_id": 0,
                    "rationale": "no court case is linked to this order yet"}
        try:
            ruling = self._ruling(int(order.case_id))
        except Exception as e:
            return {"found": True, "order_id": oid, "ok": False,
                    "action": A_NONE, "case_id": int(order.case_id),
                    "rationale": "the court did not answer: " + str(e)[:120]}
        decided = self._apply(int(order.amount_wei), ruling)
        return {
            "found": True,
            "order_id": oid,
            "case_id": int(order.case_id),
            "ok": bool(decided.get("ok")),
            "action": str(decided.get("action", A_NONE)),
            "outcome": str(decided.get("outcome", "")),
            "award_bps": _as_int(decided.get("award_bps"), 0),
            "buyer_share_wei": str(_as_int(decided.get("buyer_share_wei"), 0)),
            "seller_share_wei": str(_as_int(decided.get("seller_share_wei"), 0)),
            "rationale": str(decided.get("rationale", "")),
        }

    @gl.public.view
    def get_stats(self) -> typing.Any:
        """Order-book totals, and the two facts an integrator most needs to
        know about this contract: it holds no value and takes no custody."""
        return {
            "orders": int(self.order_count),
            "disputes": int(self.dispute_count),
            "linked": int(self.linked_count),
            "resolved": int(self.resolved_count),
            "refunds": int(self.refund_count),
            "releases": int(self.release_count),
            "splits": int(self.split_count),
            "paused": bool(self.paused),
            "holds_value": False,
            "custody": False,
        }

    @gl.public.view
    def get_config(self) -> typing.Any:
        """The court this marketplace defers to, the policy it applies to each
        outcome, and the four facts `link_case` verifies before it will attach a
        case to an order."""
        return {
            "owner": self.owner.as_hex,
            "court": self.court.as_hex,
            "paused": bool(self.paused),
            "max_orders": MAX_ORDERS,
            "order_statuses": list(ORDER_STATUSES),
            "actions": list(ACTIONS),
            "custody": False,
            "holds_value": False,
            "payable_methods": [],
            "writes_never_raise": True,
            "court_surface_used": ["get_ruling", "get_case"],
            "link_checks": ["plaintiff_is_buyer", "defendant_is_seller",
                            "amount_matches", "filing_digest_matches"],
            "policy": {
                "PLAINTIFF_WINS": A_REFUND,
                "PARTIAL": A_SPLIT,
                "DEFENDANT_WINS": A_RELEASE,
                "DISMISSED": A_NONE,
            },
            "note": "the buyer files at CourtRoom in their own name and is "
                    "paid by CourtRoom directly; this contract never holds a "
                    "wei of anybody's money",
        }
