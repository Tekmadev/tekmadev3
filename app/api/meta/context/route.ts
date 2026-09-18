import { NextResponse, type NextRequest } from "next/server";
import { createAdContext } from "@/lib/ad-context-data";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const str = (v: unknown, max: number) =>
  typeof v === "string" && v.trim().length > 0 ? v.trim().slice(0, max) : null;

/**
 * Registers the browser context of a visitor who just accepted advertising
 * cookies, and returns the id that later conversions carry. The browser only
 * calls this after consent, and must say so: a request without `consent: true`
 * is refused rather than trusted.
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  const limit = rateLimit(`meta-context:${ip}`, 12, 10 * 60 * 1000);
  if (!limit.ok) return NextResponse.json({ ok: false }, { status: 429 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (body.consent !== true) return NextResponse.json({ ok: false, error: "consent_required" }, { status: 403 });

  const country = req.headers.get("x-vercel-ip-country");
  const id = await createAdContext({
    fbp: str(body.fbp, 200),
    fbc: str(body.fbc, 500),
    clientIp: ip && ip !== "unknown" ? ip : null,
    clientUserAgent: str(req.headers.get("user-agent"), 512),
    landingUrl: str(body.url, 1024),
    country: country ? country.slice(0, 2) : null,
    consentVersion: str(body.consent_version, 32),
  });

  return NextResponse.json({ ok: Boolean(id), id });
}
