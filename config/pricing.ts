/**
 * Private pricing tiers — rendered ONLY on the unlisted /start page.
 *
 * ⚠️  Pricing is private. The /start page is noindex, is not linked from the
 *     nav / footer / sitemap / any internal link, and carries no price schema.
 *     It is reachable only via the direct link you share (e.g. tekmadev.com/start).
 *
 * 👉  FOUNDER TO-DO before you share the link:
 *      1. Set the real `setupFee` and `monthly` numbers below (these are PLACEHOLDERS).
 *      2. Confirm the feature lines per tier (edit the `features` arrays).
 *      3. Create matching prices in Stripe, then add their IDs to env:
 *           STRIPE_PRICE_CONVERT / STRIPE_PRICE_GROW   → monthly recurring price IDs
 *           STRIPE_SETUP_CONVERT / STRIPE_SETUP_GROW   → one-time setup price IDs (optional)
 *         Plus STRIPE_SECRET_KEY. Online checkout activates automatically once these exist;
 *         until then the buttons fall back to a "contact us" message.
 */

export type TierId = "convert" | "grow" | "lets-talk";

/** Tiers that bill through Stripe Checkout (have env-mapped price IDs). */
export type PaidTierId = "convert" | "grow";

export type PricingTier = {
  id: TierId;
  name: string;
  blurb: string;
  /** One-time setup fee in whole USD. PLACEHOLDER — set the real number. `null` = custom/quote. */
  setupFee: number | null;
  /** Monthly subscription in whole USD. PLACEHOLDER — set the real number. `null` = custom/quote. */
  monthly: number | null;
  /** Short line under the price (e.g. cadence note). */
  priceNote?: string;
  /** Visually featured column. */
  highlighted?: boolean;
  /** Small badge on the card (e.g. "Most popular"). */
  badge?: string;
  /** Performance guarantee applies to this tier's monthly (top tiers only). */
  guarantee: boolean;
  /** What's included. First tier's list is the base; higher tiers say "Everything in X, plus:". */
  features: string[];
  /** How the primary button behaves. */
  cta:
    | { type: "checkout"; label: string }
    | { type: "contact"; label: string; href: string };
};

export const CURRENCY = "USD";

/**
 * Optional promo banner (the "free website on every tier" launch offer).
 * Flip `active` to false to hide it.
 */
export const PROMO = {
  active: true,
  text: "Launch offer — a free professional website (built for SEO/GEO) is included on every plan.",
};

export const pricingTiers: PricingTier[] = [
  {
    id: "convert",
    name: "Convert",
    blurb:
      "The capture-and-convert system. Stop losing leads to missed calls and slow replies — every inquiry answered, qualified, and booked, automatically.",
    setupFee: 1500, // PLACEHOLDER
    monthly: 997, // PLACEHOLDER
    priceNote: "setup, then monthly",
    guarantee: false,
    features: [
      "24/7 AI receptionist — answers every call, day or night",
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
      "The full done-for-you growth engine. Everything that captures and converts, plus the marketing that fills the top of the funnel — we run all of it.",
    setupFee: 2500, // PLACEHOLDER
    monthly: 1997, // PLACEHOLDER
    priceNote: "setup, then monthly",
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
      "Custom, enterprise-grade growth for multi-location brands and teams that need the best of everything — scoped one-to-one.",
    setupFee: null,
    monthly: null,
    priceNote: "custom scope",
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

/**
 * Maps each paid tier to the env var names holding its Stripe price IDs.
 * Read SERVER-SIDE only (in /api/checkout) — never expose these values to the client.
 */
export const STRIPE_PRICE_ENV: Record<PaidTierId, { monthly: string; setup: string }> = {
  convert: { monthly: "STRIPE_PRICE_CONVERT", setup: "STRIPE_SETUP_CONVERT" },
  grow: { monthly: "STRIPE_PRICE_GROW", setup: "STRIPE_SETUP_GROW" },
};

export function getTier(id: string): PricingTier | undefined {
  return pricingTiers.find((t) => t.id === id);
}
