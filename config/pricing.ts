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
  /** Higher-tier items this plan does NOT get. Shown as a "what you give up" list
   *  to make the next tier up feel like the better deal (loss aversion). */
  missing?: string[];
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
      "Every call answered in seconds, 24/7, so no job ever goes to voicemail",
      "Missed calls get an instant text back, before they try your competitor",
      "Calls, texts, emails, and web chat in one inbox, nothing slips through",
      "Leads book themselves onto your calendar, no phone tag",
      "12 automatic follow-ups chase every lead so none go cold on you",
      "Every lead and deal on one pipeline board, nothing forgotten",
      "Reviews asked for automatically after every happy customer",
      "One dashboard shows exactly where each booked appointment came from",
      "A professional website, built for you free (launch offer)",
    ],
    missing: [
      "The 30 booked appointments in 60 days guarantee, on Convert the risk stays on you",
      "Google and Meta ads filling the top of your funnel with new leads",
      "Funnels and landing pages that turn clicks into booked appointments",
      "Email and SMS campaigns that turn old leads into new revenue",
      "A dedicated strategist on your account, plus front-of-line support",
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
      "A website built to get you found on Google and AI search, free",
      "Google and Meta ads built and run for you to fill the top of your funnel",
      "Funnels and landing pages that turn clicks into booked appointments",
      "Your reviews and reputation actively managed, not just requested",
      "Email and SMS campaigns that turn old leads into new revenue",
      "Payments and invoicing built in, get paid without the back-and-forth",
      "A dedicated strategist on your account, plus front-of-line support",
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
