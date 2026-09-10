import { portal } from "@/config/site";

/**
 * Host helpers shared by the proxy (edge-safe, no Node APIs) and server code.
 * The portal lives on its own subdomain; these decide whether a request is
 * for the portal and build absolute portal URLs for emails and redirects.
 */

/** True for the production portal host and the local dev alias (any port). */
export function isPortalHost(hostHeader: string | null | undefined): boolean {
  if (!hostHeader) return false;
  const host = hostHeader.toLowerCase().split(":")[0];
  return host === portal.host || host === portal.devHost || host.endsWith(`.${portal.devHost}`);
}

/** Canonical marketing hosts. `/portal/*` and `/login` on these redirect to the portal. */
export function isMarketingHost(hostHeader: string | null | undefined): boolean {
  if (!hostHeader) return false;
  const host = hostHeader.toLowerCase().split(":")[0];
  return host === "tekmadev.com" || host === "www.tekmadev.com";
}

/**
 * Absolute portal origin. Production uses the configured subdomain; local dev
 * uses account.localhost on the dev port. NEXT_PUBLIC_PORTAL_URL overrides
 * both (useful for preview deployments).
 */
export function portalOrigin(): string {
  const env = process.env.NEXT_PUBLIC_PORTAL_URL;
  if (env) return env.replace(/\/$/, "");
  if (process.env.NODE_ENV !== "production") {
    const port = process.env.PORT || "3000";
    return `http://${portal.devHost}:${port}`;
  }
  return portal.url;
}

/** Absolute portal URL for a bare portal path (e.g. "/set-password"). */
export function portalUrl(path = "/"): string {
  return `${portalOrigin()}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Paths that must never be rewritten under /portal on the portal host. */
const PASSTHROUGH_PREFIXES = ["/portal", "/auth", "/api", "/_next", "/_vercel", "/images", "/fonts"];

export function isPassthroughPath(pathname: string): boolean {
  if (PASSTHROUGH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true;
  // Static files in /public (favicon.ico, manifest, icons, etc.)
  return /\.[a-z0-9]+$/i.test(pathname) && pathname !== "/robots.txt" && pathname !== "/sitemap.xml";
}
