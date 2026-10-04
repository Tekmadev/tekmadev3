import { route } from "@/lib/admin-api";
import { ordersPage, ordersQuery } from "@/lib/admin-api/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /billing/orders?status=&cursor=&limit=: live one-time orders, newest
 * first, plus the subtitle `summary`. Owner and manager.
 * Unknown status: 400 `status` "Unknown order status.".
 */
export const GET = route({ method: "GET", capability: "billing.view", query: ordersQuery }, async (_ctx, { query }) =>
  ordersPage({ status: query.status, cursor: query.cursor, limit: query.limit }),
);
