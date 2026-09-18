import { NextResponse } from "next/server";
import { verifyVerdict } from "@/lib/court";

/** Recompute a verdict from the stored evidence. Server-side because it is a
 *  contract read and the browser's request budget is small. */
export async function GET(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("id") ?? 0);
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ error: "bad case id" }, { status: 400 });
  }
  try {
    return NextResponse.json(await verifyVerdict(id));
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message ?? e) }, { status: 502 });
  }
}
