import { defineMetaFragment } from "./types";

/**
 * The testMode slice of GET /meta (the app's src/api/schemas/testMode.ts
 * `metaFragment`, docs/api-requests/testMode.md): the test purchase badge.
 */
export const metaFragment = defineMetaFragment(() => ({
  testPurchaseStatuses: [
    { value: "paid", label: "Paid", tone: "ok" },
    { value: "pending", label: "Pending", tone: "warn" },
    { value: "failed", label: "Failed", tone: "signal" },
    { value: "refunded", label: "Refunded", tone: "muted" },
  ],
}));
