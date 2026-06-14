/**
 * Tier METADATA only (names, blurbs, feature lists, CTA behavior). The actual
 * prices live in the `plans` table in Supabase and are edited from the admin
 * dashboard, so changing a number never requires a code change. See
 * lib/pricing-data.ts (display) and lib/plan-sync.ts (Stripe sync).
 *
 * Pricing stays private: the /start page is noindex and unlisted.
 */

export type TierId = "convert" | "grow" | "lets-talk";
export type PaidTierId = "convert" | "grow";

export type TierMeta = {
  id: TierId;
  name: string;
  blurb: string;
  highlighted?: boolean;
  badge?: string;
  guarantee: boolean;
  features: string[];
  cta: { type: "checkout"; label: string } | { type: "contact"; label: string; href: string };
};

/** Optional promo banner (the "free website on every tier" launch offer). */
export const PROMO = {
  active: true,
  text: "Launch offer: a free professional website (built for SEO/GEO) is included on every plan.",
};

export const tierMeta: TierMeta[] = [
  {
    id: "convert",
    name: "Convert",
    blurb:
      "The capture-and-convert system. Stop losing leads to missed calls and slow replies. Every inquiry answered, qualified, and booked, automatically.",
    guarantee: false,
    features: [
      "24/7 AI receptionist that answers every call, day or night",
      "Missed-call text-back so no lead goes cold",
      "Unified inbox: calls, SMS, email & web chat in one place",
      "Online booking wired straight to your calendar",
      "12-touch automated lead follow-up",
      "CRM + visual sales pipeline",
      "Automated review & reputation requests",
      "Reporting dashboard with traffic-source attribution",
      "Free professional website (launch offer)",
    ],
    cta: { type: "checkout", label: "Get started" },
  },
  {
    id: "grow",
    name: "Grow",
    blurb:
      "The full done-for-you growth engine. Everything that captures and converts, plus the marketing that fills the top of the funnel. We run all of it.",
    highlighted: true,
    badge: "Most popular",
    guarantee: true,
    features: [
      "Everything in Convert, plus:",
      "Free professional website built for SEO / GEO / AEO",
      "Paid ads managed for you (Google + Meta)",
      "Social media management & posting",
      "Advanced automations, funnels & landing pages",
      "Full reputation management",
      "Email & SMS marketing campaigns",
      "Online payments & invoicing",
      "Dedicated strategist + priority support",
    ],
    cta: { type: "checkout", label: "Get started" },
  },
  {
    id: "lets-talk",
    name: "Let's Talk",
    blurb:
      "Custom, enterprise-grade growth for multi-location brands and teams that need the best of everything, scoped one-to-one.",
    guarantee: true,
    features: [
      "Everything in Grow, plus:",
      "Multi-location / multi-brand rollout",
      "Custom AI agents & deep integrations",
      "Memberships, communities & courses",
      "A dedicated growth team",
      "Custom SLAs & reporting",
      "Performance guarantee, scoped to your goals",
    ],
    cta: { type: "contact", label: "Book a call", href: "/#book" },
  },
];

export function getTierMeta(id: string): TierMeta | undefined {
  return tierMeta.find((t) => t.id === id);
}
