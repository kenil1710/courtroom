/**
 * The demo docket: real small-claims disputes, written to land on different
 * points of the evidence scale.
 *
 * `expect` is what the BRACKET makes reachable, not what the jury is promised
 * to return. The jury chooses inside the window, and `seed.mjs` records what it
 * actually chose rather than what anyone hoped for — a demo that asserted its
 * own verdicts would be a demo of nothing.
 */

export const GEN = 10n ** 18n;

export const CASES = [
  {
    key: "unfinished-website",
    plaintiff: "plaintiff1",
    defendant: "defendant1",
    amount: 25n * GEN / 10n,
    expect: "PLAINTIFF_WINS",
    note: "One side documents everything; the other denies without detail.",
    claim:
      "On 2026-03-14 I paid the defendant 2.5 GEN in advance for a five-page " +
      "website, due 2026-04-30 under a written agreement. Nothing was ever " +
      "delivered. The defendant stopped answering email on 2026-05-02 and has " +
      "not responded since. I am claiming the full 2.5 GEN back under clause 4 " +
      "of that agreement, which requires a full refund if delivery is more " +
      "than 14 days late.",
    evidence:
      "Invoice INV-2026-0314, dated 2026-03-14, for 2.5 GEN, signed by both " +
      "parties. On-chain payment 0x9f21ac33bd7e4411 timestamped 2026-03-14, " +
      "amount 2.5 GEN, to the defendant's wallet. Email thread dated " +
      "2026-04-02, 2026-04-19 and 2026-05-02 in which the defendant writes " +
      "\"it will be with you by Friday\" on all three dates. The signed " +
      "agreement is attached at http://example.invalid/agreement-0314 and " +
      "clause 4 reads \"a full refund is due if delivery is more than 14 days " +
      "late\". Delivery was 20 days late as of 2026-05-20 and remains " +
      "outstanding. The staging URL http://example.invalid/staging returns 404 " +
      "and has done since 2026-03-14. No files, no repository access and no " +
      "handover of any kind were ever provided.",
    response:
      "I do not accept this claim and I think the amount asked for is unfair " +
      "in the circumstances of this particular matter.",
    counter:
      "The plaintiff is not telling the whole story here and I believe that " +
      "anyone looking at it fairly would agree with me about that.",
  },
  {
    key: "laptop-delivered",
    plaintiff: "plaintiff2",
    defendant: "defendant2",
    amount: 12n * GEN / 10n,
    expect: "DEFENDANT_WINS",
    note: "A bare assertion against a fully documented answer.",
    claim:
      "I bought something from this seller and it never turned up at all, so " +
      "I want all of my money back from them right now please.",
    evidence:
      "I know it never arrived because I was at home the whole week and I " +
      "would definitely have seen it if it had come to the door.",
    response:
      "The laptop was delivered on 2026-06-11 at 10:42 and signed for at the " +
      "plaintiff's own address. I have the courier record, the signature " +
      "image and the plaintiff's own message acknowledging receipt two days " +
      "later, on 2026-06-13.",
    counter:
      "Courier consignment 0x4b7711ca9920, dispatched 2026-06-09, delivered " +
      "2026-06-11 at 10:42, signed \"J. Okafor\" at the delivery address on " +
      "the order. Photograph attached at http://example.invalid/pod-0611 " +
      "showing the parcel at the plaintiff's door with the timestamp " +
      "2026-06-11T10:42:00Z. Invoice INV-2026-0609 for 1.2 GEN. Screenshot of " +
      "the plaintiff's message of 2026-06-13 reading \"got it, thanks\". The " +
      "plaintiff first raised a problem on 2026-07-28, 47 days after " +
      "delivery, and after the 30-day returns window in the signed terms at " +
      "http://example.invalid/terms had closed.",
  },
  {
    key: "kitchen-fitting",
    plaintiff: "plaintiff3",
    defendant: "defendant3",
    amount: 4n * GEN,
    expect: "PARTIAL",
    note: "Both sides document a real grievance. Neither is wholly right.",
    claim:
      "I paid 4 GEN on 2026-02-08 for a kitchen fit-out quoted at 11 working " +
      "days. The work stopped on 2026-02-27 with the worktops uninstalled and " +
      "two cupboard doors missing, and it has not resumed. I am claiming the " +
      "full 4 GEN because the kitchen is unusable in the state it was left in.",
    evidence:
      "Quotation QUO-2026-0208 dated 2026-02-08 for 4 GEN, listing 11 working " +
      "days and itemising worktops and 14 cupboard doors. Payment " +
      "0x77aa41bb2e90 of 4 GEN on 2026-02-08. Photographs taken 2026-02-27 " +
      "and 2026-03-15 at http://example.invalid/kitchen-0227 showing bare " +
      "worktop rails and two empty door frames. Text messages of 2026-03-02 " +
      "and 2026-03-09 asking when work would resume, both unanswered. An " +
      "independent quote of 2026-03-20 puts the cost of finishing the work at " +
      "1.1 GEN.",
    response:
      "I completed 12 of the 14 doors and all the units. The worktops were " +
      "delayed because the plaintiff changed the material on 2026-02-19, " +
      "which added three weeks to the supplier lead time, and I was told on " +
      "2026-02-27 not to return until the new worktops arrived.",
    counter:
      "Signed variation VAR-2026-0219 dated 2026-02-19 changing the worktop " +
      "from laminate to stone, with the plaintiff's signature. Supplier " +
      "confirmation 0x9c02bb17ee44 dated 2026-02-20 giving a 21-day lead " +
      "time, against 3 days for the original material. Photographs of " +
      "2026-02-27 at http://example.invalid/units-0227 showing 12 doors hung " +
      "and all base units fitted. Message from the plaintiff on 2026-02-27 " +
      "reading \"don't come back until the stone is here\". Labour record " +
      "showing 9 of the 11 quoted days worked between 2026-02-08 and " +
      "2026-02-27.",
  },
  {
    key: "verbal-loan",
    plaintiff: "plaintiff4",
    defendant: "defendant4",
    amount: 8n * GEN / 10n,
    expect: "DISMISSED",
    note: "A verbal arrangement with nothing on either side of the record.",
    claim:
      "I lent this person money a while back and they have never paid any of " +
      "it back to me since then even though they said that they would.",
    evidence:
      "There was no paperwork because we trusted each other, but I know what " +
      "was agreed and I am certain that I am remembering it correctly.",
    response:
      "That was not a loan and I never agreed to repay anything at all to " +
      "them at any point, so this claim should not stand.",
    counter:
      "I have nothing written down either because there was nothing to write " +
      "down, and I do not accept their version of what was said.",
  },
  {
    key: "conceded-deposit",
    plaintiff: "plaintiff5",
    defendant: "defendant5",
    amount: 6n * GEN / 10n,
    expect: "ACCEPTED",
    note: "The defendant concedes before any jury sits.",
    accept: true,
    claim:
      "The defendant held a 0.6 GEN deposit for a rehearsal room booking on " +
      "2026-08-02 that they cancelled on 2026-08-01. Their own terms say a " +
      "deposit is returned in full when the venue cancels, and it has not " +
      "been returned.",
    evidence:
      "Booking BKG-2026-0802 confirmed 2026-07-19 for 2026-08-02, deposit " +
      "0.6 GEN paid by 0x21cc40aa7731 on 2026-07-19. Cancellation email from " +
      "the venue timestamped 2026-08-01T16:05:00Z. The venue's own terms at " +
      "http://example.invalid/venue-terms, clause 7: \"where the venue " +
      "cancels, the deposit is refunded in full within 5 working days\". " +
      "Twelve days have passed with no refund and two chasers unanswered.",
    response: null,
    counter: null,
  },
];

/** The fast-docket cases. Same court, short immutable deadlines, so the paths
 *  that only open when a deadline passes can be WATCHED rather than asserted. */
export const FAST_CASES = [
  {
    key: "silent-defendant",
    plaintiff: "plaintiff1",
    defendant: "defendant1",
    amount: 15n * GEN / 10n,
    expect: "DEFAULT",
    note: "The defendant never answers. Judgment is entered by default.",
    claim:
      "The defendant took 1.5 GEN on 2026-05-03 for a photography session on " +
      "2026-05-17 and did not attend. They have not replied to any message " +
      "since 2026-05-18 and have not refunded the booking.",
    evidence:
      "Booking confirmation PHO-2026-0503 dated 2026-05-03 for 1.5 GEN. " +
      "Payment 0x5a91cc22de70 on 2026-05-03. Venue sign-in sheet for " +
      "2026-05-17 at http://example.invalid/signin-0517 showing the " +
      "defendant did not attend. Four unanswered messages dated 2026-05-18, " +
      "2026-05-22, 2026-06-01 and 2026-06-14.",
  },
  {
    key: "withdrawn-claim",
    plaintiff: "plaintiff2",
    defendant: "defendant2",
    amount: 9n * GEN / 10n,
    expect: "WITHDRAWN",
    note: "The plaintiff settles privately and withdraws before any answer.",
    withdraw: true,
    claim:
      "The defendant was paid 0.9 GEN on 2026-07-02 for a bicycle service " +
      "that was never carried out, and the bicycle was returned in the same " +
      "condition it went in.",
    evidence:
      "Service order SRV-2026-0702 dated 2026-07-02 for 0.9 GEN. Payment " +
      "0x8834ffa21099 on 2026-07-02. Workshop photographs of 2026-07-02 and " +
      "2026-07-09 at http://example.invalid/bike-0709 showing the same worn " +
      "brake pads before and after. An independent inspection dated " +
      "2026-07-11 confirms no service work was performed.",
  },
];

/** The marketplace story: one order, disputed, taken to CourtRoom and enforced
 *  by ArbitrationConsumer. The buyer files in their own name — the marketplace
 *  never touches the money. */
export const MARKET_CASE = {
  order_id: "order-2026-0914",
  buyer: "buyer",
  seller: "seller",
  amount: 18n * GEN / 10n,
  description: "One reclaimed-oak dining table, 180cm, delivered assembled",
  claim:
    "I paid 1.8 GEN on 2026-09-01 for a 180cm reclaimed-oak dining table to " +
    "be delivered assembled by 2026-09-12. What arrived on 2026-09-13 was a " +
    "flat-pack of 140cm pine with a split along one edge. I am claiming the " +
    "full 1.8 GEN.",
  evidence:
    "Order ORD-2026-0901 dated 2026-09-01 for 1.8 GEN, specifying 180cm, " +
    "reclaimed oak, delivered assembled, by 2026-09-12. Payment " +
    "0x62aa17cc9931 on 2026-09-01. The listing as it stood on 2026-09-01 is " +
    "archived at http://example.invalid/listing-0901 and says \"180cm solid " +
    "reclaimed oak, delivered fully assembled\". Photographs taken " +
    "2026-09-13 at http://example.invalid/delivery-0913 show a flat-packed " +
    "140cm pine table with a 30cm split. An independent valuation dated " +
    "2026-09-15 puts what arrived at 0.4 GEN.",
  response:
    "The table sent matches what was ordered and any damage happened in " +
    "transit, which is not something I have any control over at all.",
  counter:
    "I packed it carefully and I do not accept that it was the wrong item " +
    "or the wrong size when it left here.",
};
