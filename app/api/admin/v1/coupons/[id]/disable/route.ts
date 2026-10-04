import { requireDb, route } from "@/lib/admin-api";
import { disableCouponFromApp } from "@/lib/admin-api/coupons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /coupons/:id/disable -> the full Coupon (status "disabled", no dealUrl). Owner.
 * Disabling a disabled coupon answers 200 with the same coupon. No re-enable.
 */
export const POST = route({ method: "POST", capability: "coupons.write" }, async (ctx, { params }) =>
  disableCouponFromApp(requireDb(), params.id ?? "", { share: ctx.can("coupons.share") }),
);
