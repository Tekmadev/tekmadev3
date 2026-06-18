import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { PricingTiers } from "@/components/sections/PricingTiers";
import { getDisplayTiers } from "@/lib/pricing-data";
import { getCoupons, type CouponRow } from "@/lib/coupon-data";

/** Human-readable summary of what a startup deal link gives (free setup + the code). */
function describeDeal(c: CouponRow | undefined): string {
  if (!c) return "Your setup fee is waived at checkout.";
  const amount =
    c.discount_type === "percent"
      ? `${c.percent_off}% off`
      : `${new Intl.NumberFormat("en-CA", {
          style: "currency",
          currency: c.currency || "CAD",
          maximumFractionDigits: 0,
        }).format((c.amount_off || 0) / 100)} off`;
  const span =
    c.duration === "forever"
      ? ""
      : c.duration === "repeating"
        ? ` for ${c.duration_in_months} months`
        : " on your first month";
  return `Setup fee waived, plus ${amount} your monthly${span}.`;
}

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

export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<{ deal?: string }>;
}) {
  const [tiers, params] = await Promise.all([getDisplayTiers(), searchParams]);
  const dealCode = (params.deal || "").trim().toUpperCase() || null;

  let dealInfo: string | null = null;
  if (dealCode) {
    const coupons = await getCoupons();
    const match = coupons.find((c) => c.code.toUpperCase() === dealCode && c.active);
    dealInfo = describeDeal(match);
  }

  return (
    <main className="relative min-h-screen bg-bg text-ink">
      <Nav />
      <PricingTiers tiers={tiers} deal={dealCode} dealInfo={dealInfo} />
      <Footer />
    </main>
  );
}
