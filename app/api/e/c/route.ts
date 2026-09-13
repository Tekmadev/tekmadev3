import { NextResponse, after, type NextRequest } from "next/server";
import { logEmailEvent, safeEmailDestination } from "@/lib/email-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const q = (v: string | null, max: number) => (v && v.length > 0 ? v.slice(0, max) : null);

/**
 * Tracked email click. CTAs link to
 *   https://tekmadev.com/api/e/c?c=CAMPAIGN&l=LABEL&u=DESTINATION
 * We log the click first-party, then 302 to the destination. `u` is validated
 * against an allowlist in safeEmailDestination so this can never be used as an
 * open redirect. `s` (subscriber public_id) is optional per-recipient attribution.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const destination = safeEmailDestination(url.searchParams.get("u"));

  const ua = req.headers.get("user-agent") || "";
  const device = /mobile/i.test(ua) ? "mobile" : /tablet|ipad/i.test(ua) ? "tablet" : "desktop";

  // Log after the response so a slow Supabase never delays the user's redirect.
  after(
    logEmailEvent({
      type: "click",
      campaignKey: q(url.searchParams.get("c"), 64),
      subscriberPublicId: q(url.searchParams.get("s"), 64),
      url: destination,
      linkLabel: q(url.searchParams.get("l"), 64),
      device,
      country: q(req.headers.get("x-vercel-ip-country"), 8),
      referrer: q(req.headers.get("referer"), 1024),
    }),
  );

  // 302 + no-store so the click is never cached and every open re-logs.
  return NextResponse.redirect(destination, {
    status: 302,
    headers: { "cache-control": "no-store" },
  });
}
