import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { PricingTiers } from "@/components/sections/PricingTiers";

/**
 * Private, unlisted plans + checkout page.
 *
 * Intentionally NOT in the sitemap, robots is set to noindex, and it is not
 * linked from the nav, footer, or any internal page. Reachable only via the
 * direct link the founder shares. No price schema is emitted here so the
 * numbers never enter any machine-readable / scrapable surface.
 */
export const metadata: Metadata = {
  title: "Your plan",
  description: "Private plans and checkout for Tekmadev growth partners.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
  // No canonical. This page should not be advertised as canonical anywhere.
  alternates: { canonical: undefined },
};

export default function StartPage() {
  return (
    <main className="relative min-h-screen bg-bg text-ink">
      <Nav />
      <PricingTiers />
      <Footer />
    </main>
  );
}
