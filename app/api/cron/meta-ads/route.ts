import { NextResponse, type NextRequest } from "next/server";
import { syncMetaInsights } from "@/lib/meta-ads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily pull of Meta's ad report, scheduled in vercel.json. Vercel calls it
 * with `Authorization: Bearer <CRON_SECRET>`; anything else is a 401, so a
 * stranger cannot make the site hammer Meta's API.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const result = await syncMetaInsights({ trigger: "cron" });
  return NextResponse.json(result, { status: result.ok ? 200 : 502, headers: { "cache-control": "no-store" } });
}
