import { defineMetaFragment } from "./types";

/**
 * The billing slice of GET /meta: the keys of `metaFragment` in the app's
 * src/api/schemas/billing.ts (see docs/api-requests/billing.md). Prefixed with
 * `billing` so they never collide with Test mode's purchase statuses. Labels
 * only, so every role gets them (the app's meta schema needs every key).
 */
export const metaFragment = defineMetaFragment(() => ({
  billingOrderStatuses: [
    { value: "pending", label: "Pending", tone: "neutral" },
    { value: "paid", label: "Paid", tone: "ok" },
    { value: "failed", label: "Failed", tone: "signal" },
    { value: "refunded", label: "Refunded", tone: "muted" },
    { value: "partially_refunded", label: "Partially refunded", tone: "warn" },
    { value: "disputed", label: "Disputed", tone: "signal" },
  ],
  billingSubscriptionStatuses: [
    { value: "active", label: "Active", tone: "ok" },
    { value: "trialing", label: "Trialing", tone: "gold" },
    { value: "past_due", label: "Past due", tone: "warn" },
    { value: "unpaid", label: "Unpaid", tone: "signal" },
    { value: "incomplete", label: "Incomplete", tone: "warn" },
    { value: "incomplete_expired", label: "Expired", tone: "muted" },
    { value: "paused", label: "Paused", tone: "muted" },
    { value: "canceled", label: "Cancelled", tone: "muted" },
  ],
  billingSubscriptionKinds: [
    { value: "plan", label: "Growth plans" },
    { value: "care", label: "Webline Care" },
  ],
  billingPaymentMethods: [
    { value: "card", label: "Card", bnpl: false },
    { value: "klarna", label: "Klarna", bnpl: true },
    { value: "afterpay", label: "Afterpay", bnpl: true },
    { value: "affirm", label: "Affirm", bnpl: true },
    { value: "link", label: "Link", bnpl: false },
  ],
}));
