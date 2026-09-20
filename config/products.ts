/**
 * Fixed-scope products (a one-time fee at checkout, plus an optional required
 * monthly care plan), as opposed to the subscription tiers in
 * config/pricing.ts. Like tiers, this file holds METADATA only: the live
 * prices live in the `products` table and are edited from the admin
 * dashboard, which also keeps Stripe in sync.
 *
 * The one-time fee and the care plan are two separate checkouts on purpose.
 * Afterpay and Affirm cannot pay for subscriptions, and Klarna in Canada only
 * offers pay in 4 on one-time payments, so putting the monthly line in the
 * first checkout would remove pay-in-4 from the offer.
 *
 * A product id doubles as a `clients.plan_id`, so onboarding templates,
 * the portal, and the admin all treat "webline" the same way they treat
 * "grow": one string that says what the client bought.
 */
import { tierMeta } from "@/config/pricing";

export type ProductId = "webline";

export type ProductMeta = {
  id: ProductId;
  name: string;
  /** Public sales page. */
  path: string;
  /** One line for admin lists, portal headers, and the Stripe product. */
  tagline: string;
  stripe: {
    name: string;
    description: string;
    /** Up to 22 characters; what the buyer sees on their statement. */
    statementDescriptor: string;
  };
  /** Cents. Seeds the `products` row; after that the DB is the source of truth. */
  defaultAmount: number;
  currency: "cad";
  /** No booked-call guarantee on one-time products. */
  guarantee: false;
  onboarding: {
    /** Whether the checklist includes a kickoff call the client must book. */
    kickoffCall: boolean;
    targetLiveDays: number;
  };
  checkout: {
    successPath: string;
    cancelPath: string;
    /** Shown under the pay button on the Stripe page. */
    submitMessage: string;
  };
  /**
   * The required monthly plan that comes with the product. Its amount and
   * start delay live in the DB (`monthly_amount`, `monthly_trial_days`).
   */
  care?: {
    name: string;
    /** Shown on the Stripe page and in the Stripe customer portal. */
    description: string;
    statementDescriptor: string;
    /** What the plan covers, in the order the sales page lists it. */
    includes: readonly string[];
    /** Cents. Seeds `monthly_amount`; after that the DB is the source of truth. */
    defaultMonthlyAmount: number;
    defaultTrialDays: number;
    /** Onboarding task completed when the plan is set up. */
    taskKey: string;
    /**
     * Appended to the one-time checkout's submit message, so the recurring
     * charge is disclosed on the payment page itself. {monthly} and {days}
     * are filled from the DB.
     */
    checkoutNote: string;
  };
};

export const productMeta: ProductMeta[] = [
  {
    id: "webline",
    name: "Webline",
    path: "/webline",
    tagline: "Startup website, built and live in 14 days. SEO, GEO, and AEO ready.",
    stripe: {
      name: "Webline",
      description:
        "Custom-designed startup website with the SEO, GEO, and AEO foundation built in. Up to 5 pages, copy written for you, live on your domain in 14 days. You own everything.",
      statementDescriptor: "TEKMADEV WEBLINE",
    },
    // Only shown if the products table cannot be read. Keep it equal to the live price (Admin, Pricing).
    defaultAmount: 99700,
    currency: "cad",
    guarantee: false,
    onboarding: { kickoffCall: false, targetLiveDays: 14 },
    checkout: {
      successPath: "/webline?checkout=success",
      cancelPath: "/webline?checkout=cancelled",
      submitMessage:
        "Your build starts the moment payment clears. Your client portal invite lands in your inbox within minutes.",
    },
    care: {
      name: "Webline Care",
      description:
        "Hosting and maintenance for your Webline site: fast hosting with SSL, security updates, uptime monitoring, backups, and small content edits. Cancel anytime.",
      statementDescriptor: "TEKMADEV CARE",
      includes: [
        "Fast, secure hosting with SSL",
        "Security and software updates",
        "Uptime monitoring and backups",
        "Small text and image edits, on request",
        "SEO, GEO, and AEO foundation kept current",
      ],
      defaultMonthlyAmount: 7700,
      defaultTrialDays: 30,
      taskKey: "webline.welcome.care_plan",
      checkoutNote:
        "Includes Webline Care, hosting and maintenance at {monthly}/month starting {days} days from today. You add a card for it in your portal; nothing more is charged today. Cancel anytime.",
    },
  },
];

export function getProductMeta(id: string | null | undefined): ProductMeta | undefined {
  if (!id) return undefined;
  return productMeta.find((p) => p.id === id);
}

export function isProductPlan(id: string | null | undefined): boolean {
  return Boolean(getProductMeta(id));
}

/** Display name for any plan id: subscription tier or one-time product. */
export function offerName(id: string | null | undefined): string | null {
  if (!id) return null;
  return tierMeta.find((t) => t.id === id)?.name ?? getProductMeta(id)?.name ?? null;
}

/** Pay-in-4 instalment (cents). Afterpay and Klarna split the total into four equal payments. */
export function installmentAmount(totalCents: number): number {
  return Math.ceil(totalCents / 4);
}
