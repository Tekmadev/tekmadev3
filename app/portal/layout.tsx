import type { Metadata } from "next";
import { business } from "@/config/site";

/**
 * Client portal root. Served on account.tekmadev.com (the proxy rewrites bare
 * paths to /portal/*). Private: never indexed, no canonical, no OG.
 */
export const metadata: Metadata = {
  title: { default: "Client portal", template: `%s · ${business.name} portal` },
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
  alternates: { canonical: undefined },
  openGraph: undefined,
  twitter: undefined,
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-bg text-ink">{children}</div>;
}
