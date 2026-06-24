import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  buildLinkDestination,
  getActiveLinkBySlug,
  isReservedSlug,
  logLinkClick,
  normalizeSlug,
} from "@/lib/links-data";

// Root vanity/tracking links (e.g. /qr, /ig). Real routes (/start, /privacy,
// /guides, ...) resolve before this segment; unknown slugs that are not active
// links fall through to a 404. Always dynamic so every visit is logged.
export const dynamic = "force-dynamic";

export default async function SlugRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: raw } = await params;
  const slug = normalizeSlug(raw);
  if (!slug || isReservedSlug(slug)) notFound();

  const link = await getActiveLinkBySlug(slug);
  if (!link) notFound();

  // Same coarse, cookieless signals as /api/track: device class from the UA and
  // country from the edge header. No raw IP is stored.
  const h = await headers();
  const ua = h.get("user-agent") || "";
  const device = /mobile/i.test(ua) ? "mobile" : /tablet|ipad/i.test(ua) ? "tablet" : "desktop";
  const country = h.get("x-vercel-ip-country");
  const referrer = h.get("referer");

  await logLinkClick({ link, referrer, device, country });

  // 307 (redirect default) so the link is never cached and every scan re-logs.
  redirect(buildLinkDestination(link));
}
