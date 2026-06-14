import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { PricingTiers } from "@/components/sections/PricingTiers";
import { getDisplayTiers } from "@/lib/pricing-data";

/**
 * Private, unlisted plans + checkout page. noindex, not in the sitemap or any
 * internal link, no price schema. Prices are read live from the `plans` table
 * (editable in the admin dashboard), so this renders dynamically.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your plan",
  description: "Private plans and checkout for Tekmadev growth partners.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
  alternates: { canonical: undefined },
};

export default async function StartPage() {
  const tiers = await getDisplayTiers();
  return (
    <main className="relative min-h-screen bg-bg text-ink">
      <Nav />
      <PricingTiers tiers={tiers} />
      <Footer />
    </main>
  );
}
