import { route } from "@/lib/admin-api";
import { commissionBody, readCommission, saveCommission } from "@/lib/admin-api/staff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /settings/commission -> { finder, booker }: the default credit split. Needs `clients.credits.view` (owners and managers). */
export const GET = route({ method: "GET", capability: "clients.credits.view" }, async () => readCommission());

/**
 * PUT /settings/commission { finder, booker } -> the saved split. Needs
 * `commission.settings` (owners only: managers get 403 `owner_only`). Each
 * from 0 to 100 with at most two decimals (400 `finder` / `booker`), adding up
 * to exactly 100 (400 `split`). Applies to clients created from now on.
 */
export const PUT = route({ method: "PUT", capability: "commission.settings", body: commissionBody }, async (ctx, { body }) =>
  saveCommission(ctx, body),
);
