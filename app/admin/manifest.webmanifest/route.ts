import type { MetadataRoute } from "next";
import { theme } from "@/config/site";

/**
 * The home-screen app for the admin (iPhone "Add to Home Screen", Android
 * "Install app"), served at /admin/manifest.webmanifest.
 *
 * Next treats a manifest as a metadata file only at the app root (that one is
 * the public site's, app/manifest.ts), so this is a plain route handler. It
 * sits outside (dashboard), so fetching it needs no sign-in.
 *
 * - scope is "/admin", not "/admin/": with trailingSlash off, /admin itself
 *   (Overview, the "Tekmadev" brand link, the forbidden redirect) would fall
 *   outside "/admin/" and open in a Safari sheet. Nothing else on the site
 *   starts with /admin.
 * - start_url is /admin/leads: the home-screen app opens on Leads for every
 *   role (owners and managers reach Overview from the menu).
 * - The icons are opaque (iOS paints transparent pixels black), made from the
 *   mobile app's icon, with the mark inside the maskable safe zone.
 */
export const dynamic = "force-static";

const manifest: MetadataRoute.Manifest = {
  id: "/admin",
  name: "Tekmadev Admin",
  short_name: "Tekmadev",
  description: "Leads, follow-ups and clients for the Tekmadev team.",
  start_url: "/admin/leads",
  scope: "/admin",
  display: "standalone",
  theme_color: theme.bg,
  background_color: theme.bg,
  icons: [
    { src: "/admin-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/admin-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/admin-icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
  shortcuts: [
    { name: "Add lead", url: "/admin/leads/new" },
    { name: "Follow-ups", url: "/admin/leads?view=due" },
  ],
};

export function GET() {
  return new Response(JSON.stringify(manifest), {
    headers: {
      "content-type": "application/manifest+json; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
