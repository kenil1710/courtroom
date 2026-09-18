import { NextResponse } from "next/server";
import { payoutOf } from "@/lib/court";

/** What the court owes an address. Proxied so a page that polls it does not
 *  spend the visitor's own share of Studio Dev's 30-requests-a-minute limit. */
export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get("address") ?? "";
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: "not an address" }, { status: 400 });
  }
  try {
    return NextResponse.json(await payoutOf(address));
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message ?? e) }, { status: 502 });
  }
}
