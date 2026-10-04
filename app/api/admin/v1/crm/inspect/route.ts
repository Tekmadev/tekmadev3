import { route } from "@/lib/admin-api";
import { inspectForApi, inspectQuery, requireCrmConnection } from "@/lib/admin-api/crm/inspect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /crm/inspect?email= -> "This site" beside "CRM" for one address, plus
 * its consent history. Owners and managers (crm.view). 400 `email` for an invalid
 * address, 503 `not_configured` without a token, 422 `unverified` while the
 * CRM rejects the token. Each lookup calls the CRM live (once the connection
 * is verified); an address unknown on both sides still answers 200.
 */
export const GET = route({ method: "GET", capability: "crm.view", query: inspectQuery }, async (_ctx, { query }) => {
  await requireCrmConnection({ verified: false });
  const { result } = await inspectForApi(query.email);
  return result;
});
