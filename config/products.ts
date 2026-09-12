/**
 * One-time products (fixed scope, paid once at checkout), as opposed to the
 * subscription tiers in config/pricing.ts. Like tiers, this file holds
 * METADATA only: the live price lives in the `products` table and is edited
 * from the admin dashboard, which also keeps Stripe in sync.
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
    defaultAmount: 79700,
    currency: "cad",
    guarantee: false,
    onboarding: { kickoffCall: false, targetLiveDays: 14 },
    checkout: {
      successPath: "/webline?checkout=success",
      cancelPath: "/webline?checkout=cancelled",
      submitMessage:
        "Your build starts the moment payment clears. Your client portal invite lands in your inbox within minutes.",
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
