import { after, type NextRequest } from "next/server";
import { logEmailEvent } from "@/lib/email-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 1x1 transparent GIF. The classic email open-tracking pixel.
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

const q = (v: string | null, max: number) => (v && v.length > 0 ? v.slice(0, max) : null);

/**
 * Email open-tracking pixel. Embed as <img src="https://tekmadev.com/api/e/o?c=CAMPAIGN">
 * at the end of a template. `s` (our subscriber public_id) is optional and only
 * present for per-recipient attribution. Always returns the pixel, never caches.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const ua = req.headers.get("user-agent") || "";
  const device = /mobile/i.test(ua) ? "mobile" : /tablet|ipad/i.test(ua) ? "tablet" : "desktop";

  // Log after the response flushes so a slow Supabase never delays the pixel.
  after(
    logEmailEvent({
      type: "open",
      campaignKey: q(url.searchParams.get("c"), 64),
      subscriberPublicId: q(url.searchParams.get("s"), 64),
      device,
      country: q(req.headers.get("x-vercel-ip-country"), 8),
      referrer: q(req.headers.get("referer"), 1024),
    }),
  );

  return new Response(PIXEL, {
    status: 200,
    headers: {
      "content-type": "image/gif",
      "content-length": String(PIXEL.length),
      "cache-control": "no-store, no-cache, must-revalidate, private",
      pragma: "no-cache",
      expires: "0",
    },
  });
}
