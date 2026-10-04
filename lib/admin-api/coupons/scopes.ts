import { INSTALL_NAME } from "@/config/pricing";
import { getProductMeta } from "@/config/products";
import type { CouponScope as StoredScope } from "@/lib/coupon-scopes";

/**
 * The app's coupon scopes and how they map to the scopes stored in `coupons`
 * (lib/coupon-scopes.ts). Each chargeable thing has its own Stripe product, so
 * a scope limits a code to exactly one of them, except Anything.
 *
 *   growth_monthly  monthly           the growth plans' monthly fee
 *   growth_setup    setup             the growth plans' Build & Install fee
 *   webline         product:webline   Webline's one-time fee
 *   webline_care    care:webline      Webline Care's monthly fee
 *   anything        order             no product limit
 */

export const COUPON_SCOPES = ["growth_monthly", "growth_setup", "webline", "webline_care", "anything"] as const;
export type CouponScope = (typeof COUPON_SCOPES)[number];

/** `once` for one-time scopes; monthly scopes pick one of MONTHLY_DURATIONS. */
export const MONTHLY_DURATIONS = ["first_month", "repeating", "forever"] as const;
export type CouponDuration = "once" | (typeof MONTHLY_DURATIONS)[number];

const STORED: Record<CouponScope, StoredScope> = {
  growth_monthly: "monthly",
  growth_setup: "setup",
  webline: "product:webline",
  webline_care: "care:webline",
  anything: "order",
};

export const storedScope = (scope: CouponScope): StoredScope => STORED[scope];

/** The app scope for a stored one, or null for a product that no longer exists. */
export function appScope(stored: string): CouponScope | null {
  for (const scope of COUPON_SCOPES) if (STORED[scope] === stored) return scope;
  return null;
}

/** Scopes whose discount comes off a one-time charge: the duration is always "once". */
export const isOneTime = (scope: CouponScope) => scope === "growth_setup" || scope === "webline";

/** Scopes whose active coupons get a shareable deal link (the /start page applies the code). */
export const isDealScope = (scope: CouponScope) => scope === "growth_monthly" || scope === "anything";

export type CouponScopeOption = { value: CouponScope; label: string; help: string; oneTime: boolean };

/** Labels and help for the New coupon sheet and the list (GET /meta `couponScopes`). */
export function couponScopeOptions(): CouponScopeOption[] {
  const webline = getProductMeta("webline");
  const product = webline?.name ?? "Webline";
  const care = webline?.care?.name ?? "Webline Care";
  return [
    {
      value: "growth_monthly",
      label: "Growth plans, monthly",
      help: "Takes money off the monthly fee of the growth plans, nothing else. Pick how long it lasts.",
      oneTime: false,
    },
    {
      value: "growth_setup",
      label: `${INSTALL_NAME} fee`,
      help: `Takes money off the one-time ${INSTALL_NAME} fee of the growth plans, nothing else. Applies once.`,
      oneTime: true,
    },
    {
      value: "webline",
      label: product,
      help: `Takes money off the one-time ${product} fee. Only works on a ${product} checkout. Applies once.`,
      oneTime: true,
    },
    {
      value: "webline_care",
      label: `${care}, monthly`,
      help: `Takes money off the monthly ${care} plan, nothing else. Pick how long it lasts.`,
      oneTime: false,
    },
    {
      value: "anything",
      label: "Anything",
      help: `No product limit: it comes off whatever is in the checkout, growth plans, ${INSTALL_NAME}, ${product} and ${care}. Only use it for a deal you would honour on all of them.`,
      oneTime: false,
    },
  ];
}

export function scopeLabel(scope: CouponScope): string {
  return couponScopeOptions().find((o) => o.value === scope)?.label ?? scope;
}
