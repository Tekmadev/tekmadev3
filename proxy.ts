import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { isMarketingHost, isPassthroughPath, isPortalHost, portalOrigin } from "@/lib/portal-host";
import { portal } from "@/config/site";

/**
 * Next.js 16 proxy (formerly middleware).
 *
 * Three jobs:
 *  1. Portal subdomain. On `account.tekmadev.com` a bare path like
 *     `/onboarding` is rewritten to the internal `/portal/onboarding` route, so
 *     clients see clean URLs and the whole portal ships in this one app. The
 *     response is stamped noindex so the portal never enters search.
 *  2. Marketing host hygiene. `/portal/*` and `/login` on tekmadev.com
 *     redirect to the portal so there is exactly one canonical portal host
 *     (and therefore one cookie scope for client sessions).
 *  3. Session refresh. Supabase auth cookies are refreshed on the admin and
 *     portal surfaces only, so the marketing site keeps its static speed.
 */
export async function proxy(request: NextRequest) {
  const host = request.headers.get("host");
  const { pathname, search } = request.nextUrl;

  if (isPortalHost(host)) {
    // Bare portal paths map onto the internal /portal routes. Auth, API,
    // Next internals and static files pass through untouched.
    let response: NextResponse;
    if (isPassthroughPath(pathname)) {
      response = await updateSession(request);
    } else {
      const target = request.nextUrl.clone();
      target.pathname = pathname === "/" ? portal.internalPrefix : `${portal.internalPrefix}${pathname}`;
      response = await updateSession(request, target);
    }
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    return response;
  }

  // On the marketing domain the portal is reachable only via its subdomain.
  if (isMarketingHost(host)) {
    if (pathname === portal.internalPrefix || pathname.startsWith(`${portal.internalPrefix}/`)) {
      const stripped = pathname.slice(portal.internalPrefix.length) || "/";
      return NextResponse.redirect(`${portalOrigin()}${stripped}${search}`, 308);
    }
    if (pathname === "/login") {
      return NextResponse.redirect(`${portalOrigin()}/login`, 308);
    }
  }

  // Admin, portal (previews / localhost without the subdomain) and auth
  // callbacks need a fresh session. Everything else is untouched.
  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith(portal.internalPrefix) ||
    pathname.startsWith("/auth")
  ) {
    return updateSession(request);
  }

  return NextResponse.next();
}

export const config = {
  // Everything except Next internals and static assets. Host checks above keep
  // the marketing site on the fast path (no auth work). robots.txt and
  // sitemap.xml are matched explicitly so the portal host can serve its own
  // (Disallow all / no sitemap) instead of the marketing files.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|avif|ico|css|js|map|txt|xml|webmanifest|woff2?)$).*)",
    "/robots.txt",
    "/sitemap.xml",
  ],
};
