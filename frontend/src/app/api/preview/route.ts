import { NextResponse } from "next/server";
import { previewCase } from "@/lib/court";

/**
 * The court's own scoring of a filing, before it is filed.
 *
 * Proxied through the server rather than read from the browser because Studio
 * Dev meters 30 requests a minute PER IP, and this endpoint is called while
 * somebody types. From the browser that would rate-limit the visitor out of
 * their own filing.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const claim = String(body?.claim ?? "").slice(0, 2000);
    const evidence = String(body?.evidence ?? "").slice(0, 5000);
    const response = String(body?.response ?? "").slice(0, 2000);
    const counter = String(body?.counter ?? "").slice(0, 5000);
    if (claim.length < 20 && evidence.length < 20 && response.length < 20) {
      return NextResponse.json({ error: "too short to score" }, { status: 400 });
    }
    return NextResponse.json(await previewCase(claim, evidence, response, counter));
  } catch (e) {
    // A preview that cannot be computed is not an error a person needs to act
    // on — the form simply shows nothing rather than a red box.
    return NextResponse.json({ error: String((e as Error)?.message ?? e) }, { status: 502 });
  }
}
