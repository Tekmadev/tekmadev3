import { route } from "@/lib/admin-api";
import { subscriptionsPage, subscriptionsQuery } from "@/lib/admin-api/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /billing/subscriptions?status=&kind=plan|care&cursor=&limit=: live
 * Stripe subscriptions (growth plans and Webline Care), newest first, plus the
 * subtitle `summary`. Owner and manager.
 * Unknown status: 400 `status`; unknown kind: 400 `kind`.
 */
export const GET = route({ method: "GET", capability: "billing.view", query: subscriptionsQuery }, async (_ctx, { query }) =>
  subscriptionsPage({ status: query.status, kind: query.kind, cursor: query.cursor, limit: query.limit }),
);
