import { z } from "zod";
import { requireDb, route } from "@/lib/admin-api";
import { createCouponFromApp, listCoupons } from "@/lib/admin-api/coupons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A create makes a Stripe coupon and a promotion code.
export const maxDuration = 60;

/**
 * GET /coupons -> Coupon[]: every coupon, newest first (not paged), with
 * Stripe's live redemption counts. Owner and staff. `dealUrl` only on active
 * coupons scoped to growth plans monthly or Anything, for roles that may share.
 */
export const GET = route({ method: "GET", capability: "coupons.view" }, async (ctx) =>
  listCoupons(requireDb(), { share: ctx.can("coupons.share") }),
);

/**
 * POST /coupons (Idempotency-Key) -> 201 Coupon. Owner.
 * Codes, in order: 503 nostripe, 400 code | label | type | percent | amount |
 * scope | duration | months | max | expires | expirespast (with `fields`),
 * 409 dupe, 422 noproducts, 502 stripe.
 */
export const POST = route(
  { method: "POST", capability: "coupons.write", body: z.unknown(), idempotent: true, status: 201 },
  async (ctx, { body }) => createCouponFromApp(requireDb(), body, { share: ctx.can("coupons.share") }),
);
