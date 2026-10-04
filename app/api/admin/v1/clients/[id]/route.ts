import { route } from "@/lib/admin-api";
import { findClient, jsonObject, loadBundle, patchClient, trashByStaff } from "@/lib/admin-api/clients/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /clients/:id -> the detail bundle: { client, billing, onboarding, intake,
 * accessGrants, assets, approvals, agreements, calls, guarantee, crmLocation?,
 * members, activity }. `billing` is null without `clients.billing` (staff);
 * `crmLocation` is left out without `clients.crm` (owners and managers). 404 for a
 * deleted client, and for a test client to anyone without `testdata.view`.
 */
export const GET = route({ method: "GET", capability: "clients.view" }, async (ctx, { params }) => {
  const client = await findClient(ctx, params.id);
  return loadBundle(ctx, client);
});

/**
 * PATCH /clients/:id (account fields and guarantee terms) -> the full Client.
 * Only what is sent changes; null clears. 400 `required` for a blank business
 * name or a bad email, 409 `email_taken`.
 */
export const PATCH = route({ method: "PATCH", capability: "clients.edit", body: jsonObject }, async (ctx, { params, body }) => {
  const client = await findClient(ctx, params.id);
  return patchClient(ctx, client, body);
});

/** DELETE /clients/:id (owner): moves the client to the trash -> the Client with `deletedAt` set. */
export const DELETE = route({ method: "DELETE", capability: "clients.trash" }, async (ctx, { params }) => {
  const client = await findClient(ctx, params.id);
  return trashByStaff(ctx, client);
});
