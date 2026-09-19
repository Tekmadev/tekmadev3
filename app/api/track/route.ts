import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

const str = (v: unknown, max: number) =>
  typeof v === "string" && v.length > 0 ? v.slice(0, max) : null;

/**
 * Cookieless first-party pageview capture. Stores path, referrer, UTM, coarse
 * country (from the edge header, no raw IP), and device class. No persistent
 * device id, so no consent is required. Best-effort: never throws at the client.
 *
 * Production only. Local development and preview deployments share the live
 * database, and until 2026-09-19 every page opened while building the site was
 * counted as a visitor: about a quarter of a month's "traffic" was us.
 */
export async function POST(req: NextRequest) {
  if (process.env.VERCEL_ENV !== "production") return NextResponse.json({ ok: true, recorded: false });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const ua = req.headers.get("user-agent") || "";
  const device = /mobile/i.test(ua) ? "mobile" : /tablet|ipad/i.test(ua) ? "tablet" : "desktop";
  const country = req.headers.get("x-vercel-ip-country");

  try {
    await supabase.from("events").insert({
      type: str(body.type, 32) || "pageview",
      path: str(body.path, 512),
      referrer: str(body.referrer, 1024),
      utm_source: str(body.utm_source, 128),
      utm_medium: str(body.utm_medium, 128),
      utm_campaign: str(body.utm_campaign, 128),
      utm_term: str(body.utm_term, 128),
      utm_content: str(body.utm_content, 128),
      // Never null: the analytics read a null country as "recorded off Vercel",
      // which is how the old development rows are told apart and left out.
      country: country ? country.slice(0, 8) : "unknown",
      device,
      session_id: str(body.session_id, 64),
    });
  } catch (err) {
    console.error("[track] insert error", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
