import { route } from "@/lib/admin-api";
import { jsonObject } from "@/lib/admin-api/clients/core";
import { getClientCredits, putClientCredits } from "@/lib/admin-api/staff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /clients/:id/credits -> ClientCredits. Owners and managers
 * (`clients.credits.view`) get every row (scope "all"); staff (`activity.own`)
 * get only their own rows (scope "own"). 404 for a deleted client, and for a
 * test client without `testdata.view`. docs/admin-api/staff.md.
 */
export const GET = route({ method: "GET", anyCapability: ["clients.credits.view", "activity.own"] }, async (ctx, { params }) =>
  getClientCredits(ctx, params.id),
);

/**
 * PUT /clients/:id/credits { credits: [{ email, role, share }], note } ->
 * ClientCredits. Needs `clients.credits.edit` (owners and managers). Replaces
 * every row: people on the team, roles finder | booker | other, shares adding
 * up to exactly 100 (or an empty list: nobody), a required note. 400
 * `credits` | `total` | `note`. Logged as the activity entry "credits.updated".
 */
export const PUT = route({ method: "PUT", capability: "clients.credits.edit", body: jsonObject }, async (ctx, { params, body }) =>
  putClientCredits(ctx, params.id, body),
);
