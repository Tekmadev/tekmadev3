import { z } from "zod";
import { ApiError, businessRule, notConfigured, notFound, route, validationError } from "@/lib/admin-api";
import { isCrmSwitchSurface, setCrmSwitch } from "@/lib/crm/admin-ops";
import { CRM_MESSAGES } from "@/lib/admin-api/crm/copy";
import { loadCrmSwitch } from "@/lib/admin-api/crm/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Turning Outbound on queues every contact never pushed (a backfill of up to a few thousand rows).
export const maxDuration = 60;

const objectOrEmpty = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

/** `{ on }`: a boolean, nothing else (400 `on`). */
const switchBody = z.preprocess(objectOrEmpty, z.object({ on: z.boolean({ error: CRM_MESSAGES.on }) }));

/**
 * PUT /crm/switches/:surface { on } -> { switch, queued? }. Owners and managers (crm.write).
 *
 * An unknown surface is 404 before the body is looked at (as the mock does),
 * so the zod check runs in the handler. Turning off always works. Turning on
 * needs a token (503 `not_configured`) and a passed Verify (422 `unverified`).
 * Turning Outbound on also queues, once, every contact that was never pushed;
 * `queued` says how many (it is left out when that backfill could not run;
 * the switch is on either way). The web admin's own switch path
 * (lib/crm/admin-ops.ts), so the inbox hears who flipped it.
 */
export const PUT = route({ method: "PUT", capability: "crm.write", body: z.unknown() }, async (ctx, { params, body }) => {
  const surface = params.surface;
  if (!isCrmSwitchSurface(surface)) throw notFound("That switch");
  const parsed = switchBody.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error);
  const { on } = parsed.data;

  const result = await setCrmSwitch(surface, on, ctx.email);
  if (!result.ok) {
    if (result.reason === "not_configured") throw notConfigured(CRM_MESSAGES.notConfigured);
    if (result.reason === "unverified") throw businessRule("unverified", CRM_MESSAGES.unverified);
    throw new ApiError(500, "unavailable", CRM_MESSAGES.switchSave);
  }

  const card = await loadCrmSwitch(surface);
  return surface === "outbound" && on && result.queued !== null ? { switch: card, queued: result.queued } : { switch: card };
});
