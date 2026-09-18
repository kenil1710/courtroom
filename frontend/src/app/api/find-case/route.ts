import { NextResponse } from "next/server";
import { getCasesByPlaintiff } from "@/lib/court";

/**
 * The case id a filing produced, read from the contract's own state.
 *
 * Needed because a transaction can settle ACCEPTED with `consensus_data`
 * unpopulated, in which case the RETURN VALUE — which is where `case_id` lives
 * — simply cannot be read. That is a property of the transport, not of the
 * contract: the case really was filed. A UI that gave up there would tell
 * somebody their filing failed while it sat on the docket.
 *
 * Matched on the plaintiff plus the amount plus the opening of the claim, which
 * together identify the filing that was just made.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const address = url.searchParams.get("address") ?? "";
  const amount = url.searchParams.get("amount") ?? "";
  const head = (url.searchParams.get("head") ?? "").slice(0, 60);
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: "not an address" }, { status: 400 });
  }
  try {
    const mine = await getCasesByPlaintiff(address);
    for (const row of mine.cases ?? []) {
      if (amount && String(row.amount_claimed_wei) !== amount) continue;
      if (head && !String(row.summary).startsWith(head.slice(0, 40))) continue;
      return NextResponse.json({ case_id: row.case_id });
    }
    return NextResponse.json({ case_id: 0 });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message ?? e) }, { status: 502 });
  }
}
