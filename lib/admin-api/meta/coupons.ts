import { couponScopeOptions } from "../coupons/scopes";
import { defineMetaFragment } from "./types";

/**
 * The coupons slice of GET /meta (the app's src/api/schemas/coupons.ts
 * `metaFragment`, docs/api-requests/coupons.md section 5). Search reads
 * `couponScopes` and `couponStatuses` from here for its subtitles.
 */
export const metaFragment = defineMetaFragment(() => ({
  couponScopes: couponScopeOptions(),
  couponDurations: [
    { value: "once", label: "One charge", choice: null },
    { value: "first_month", label: "First month", choice: "First month only" },
    { value: "repeating", label: "A set number of months", choice: "A set number of months" },
    { value: "forever", label: "Forever", choice: "Forever" },
  ],
  couponStatuses: [
    { value: "active", label: "Active", tone: "gold" },
    { value: "disabled", label: "Disabled", tone: "muted" },
  ],
  couponDiscountTypes: [
    { value: "percent", label: "Percent off" },
    { value: "amount", label: "Fixed amount off" },
  ],
}));
