import type { Metadata, Viewport } from "next";
import { theme } from "@/config/site";

/**
 * Everything under /admin, signed in or not. It also makes the admin a
 * home-screen app (iPhone "Add to Home Screen", Android "Install app"): the
 * manifest, the Apple tags and the icon all live here, so adding the icon
 * from any /admin page gives "Tekmadev", opening on Leads.
 */
export const metadata: Metadata = {
  title: "Admin",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
  applicationName: "Tekmadev Admin",
  manifest: "/admin/manifest.webmanifest",
  // "default", never "black-translucent": that draws white status text over the cream page.
  appleWebApp: { capable: true, title: "Tekmadev", statusBarStyle: "default" },
  // Next 16 prints only mobile-web-app-capable; iOS before 16.4 needs the Apple name.
  other: { "apple-mobile-web-app-capable": "yes" },
  // A nested icons list replaces the root's, so the favicons are listed again.
  // The admin icons sit in public/, never in app/admin/, where Next's icon
  // file conventions would pick them up.
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/admin-apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

/**
 * Merged with the root viewport. viewport-fit=cover turns on the safe-area
 * insets (notch, home indicator, landscape edges) the shell pads against.
 * The admin is light, so its status bar is the cream page colour. Never add
 * maximum-scale or user-scalable: people must be able to zoom.
 */
export const viewport: Viewport = { viewportFit: "cover", themeColor: theme.bg };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // dvh, not vh: on iOS 100vh is taller than what you can see.
  return <div className="min-h-dvh bg-bg text-ink">{children}</div>;
}
