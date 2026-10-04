import { defineMetaFragment } from "./types";

/**
 * The pricing slice of GET /meta (the app's src/api/schemas/pricing.ts
 * `metaFragment`, docs/api-requests/pricing.md section 6): the sales tax badge
 * and the product status badge.
 */
export const metaFragment = defineMetaFragment(() => ({
  salesTaxStates: [
    { value: "charging", label: "Charging", tone: "ok" },
    { value: "on_not_charging", label: "On, not charging", tone: "warn" },
    { value: "off", label: "Off", tone: "muted" },
  ],
  pricingProductStatuses: [
    { value: "selling", label: "Selling", tone: "ok" },
    { value: "paused", label: "Paused", tone: "warn" },
    { value: "not_in_stripe", label: "Not yet in Stripe", tone: "signal" },
  ],
}));
