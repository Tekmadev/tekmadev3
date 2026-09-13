import { NextResponse, type NextRequest } from "next/server";
import { addSubscriber, normalizeEmail } from "@/lib/subscribers-data";
import { pushSubscriberToGHL } from "@/lib/ghl";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { business } from "@/config/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const str = (v: unknown, max: number) =>
  typeof v === "string" && v.trim().length > 0 ? v.trim().slice(0, max) : null;

/**
 * Newsletter signup (single opt-in + consent log). Stores the subscriber
 * first-party in Supabase, then best-effort pushes to GHL. Cookieless: coarse
 * country from the edge header and device class from the UA, no raw IP.
 */
export async function POST(req: NextRequest) {
  // Best-effort throttle so the open endpoint can't be trivially flooded to
  // list-bomb third parties. Generous enough that a real person never hits it.
  const limit = rateLimit(`subscribe:${clientIp(req.headers)}`, 8, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "retry-after": String(limit.retryAfter) } },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  // Honeypot: real users leave this empty. Bots fill every field. Pretend success.
  if (str(body.website, 200) || str(body.company_url, 200)) {
    return NextResponse.json({ ok: true, status: "subscribed" });
  }

  const email = normalizeEmail(body.email);
  if (!email) {
    return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 422 });
  }

  const ua = req.headers.get("user-agent") || "";
  const device = /mobile/i.test(ua) ? "mobile" : /tablet|ipad/i.test(ua) ? "tablet" : "desktop";
  const country = req.headers.get("x-vercel-ip-country");

  const result = await addSubscriber({
    email,
    name: str(body.name, 120),
    source: str(body.source, 64) || "footer",
    path: str(body.path, 512),
    referrer: str(body.referrer, 1024),
    utm_source: str(body.utm_source, 128),
    utm_medium: str(body.utm_medium, 128),
    utm_campaign: str(body.utm_campaign, 128),
    utm_term: str(body.utm_term, 128),
    utm_content: str(body.utm_content, 128),
    country: country ? country.slice(0, 8) : null,
    device,
    consentPolicyVersion: business.legalDates.lastUpdated,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }

  // Only ping GHL for a genuinely new or re-activated subscriber, never on a
  // repeat submit of an already-active address.
  if (result.created || result.reactivated) {
    await pushSubscriberToGHL(result.subscriber);
  }

  return NextResponse.json({
    ok: true,
    status: result.created || result.reactivated ? "subscribed" : "already_subscribed",
  });
}
