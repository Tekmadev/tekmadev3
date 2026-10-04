import { z } from "zod";
import { ApiError, dbError, instant, requireDb, type ApiContext } from "@/lib/admin-api";
import { saveClientCrmMapping } from "@/lib/client-sections-data";
import { findSectionClient, parseBody } from "./shared";

/**
 * The client's CRM sub-account (owners and managers): which account's appointments
 * come in for review, and which of its calendars count toward the guarantee.
 * GET and PUT /clients/:id/crm-location; the bundle carries it for owners and
 * leaves the key out for everyone else.
 */

export type ApiCrmLocation = {
  locationId: string | null;
  calendarIds: string[];
  pendingToApply: number;
  mappedAt: string | null;
};

const NOT_MAPPED: ApiCrmLocation = { locationId: null, calendarIds: [], pendingToApply: 0, mappedAt: null };

/** Inbox rows still waiting to land on this client (held while unmapped, or due on the next sync). */
const HELD_STATUSES = ["unmapped", "pending", "failed"];

export async function loadCrmLocation(clientId: string): Promise<ApiCrmLocation> {
  const db = requireDb();
  const { data, error } = await db
    .from("crm_locations")
    .select("ghl_location_id,qualifying_calendar_ids,updated_at")
    .eq("client_id", clientId)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) throw dbError("crm location read", error);
  const row = ((data ?? []) as { ghl_location_id: string; qualifying_calendar_ids: string[] | null; updated_at: string }[])[0];
  if (!row) return { ...NOT_MAPPED, calendarIds: [] };
  const { count, error: countError } = await db
    .from("crm_inbox")
    .select("id", { count: "exact", head: true })
    .eq("location_id", row.ghl_location_id)
    .in("status", HELD_STATUSES);
  if (countError) throw dbError("crm held appointments count", countError);
  return {
    locationId: row.ghl_location_id,
    calendarIds: Array.isArray(row.qualifying_calendar_ids) ? row.qualifying_calendar_ids : [],
    pendingToApply: count ?? 0,
    mappedAt: instant(row.updated_at),
  };
}

/** GET /clients/:id/crm-location (owner). */
export async function getCrmLocation(ctx: ApiContext, clientId: string | undefined): Promise<ApiCrmLocation> {
  const client = await findSectionClient(ctx, clientId);
  return loadCrmLocation(client.id);
}

/** CRM ids are 20 letters and numbers. */
const CRM_ID = /^[A-Za-z0-9]{20}$/;

const LOCATION_TEXT = "Send the CRM sub-account id as text.";
const LOCATION_FORMAT = "That sub-account id does not look right. Copy it from the CRM: it is 20 letters and numbers.";
const CALENDAR_LIST = "Send the calendar ids as a list, one id per line.";
const LOCATION_FIRST = "Add the sub-account id before its calendars.";
const OWN = "That is Tekmadev's own CRM account. Use the client's sub-account id.";
const DB_FAILED = "Could not save the CRM mapping. Nothing changed. Try again.";

const putBody = z.object({
  locationId: z.string({ error: LOCATION_TEXT }).nullable().optional(),
  calendarIds: z.array(z.string({ error: CALENDAR_LIST }), { error: CALENDAR_LIST }).nullable().optional(),
});

const badCalendar = (id: string) =>
  `"${id.length > 30 ? `${id.slice(0, 30)}...` : id}" is not a calendar id. Calendar ids are 20 letters and numbers, one per line.`;

/**
 * PUT /clients/:id/crm-location (owner) `{ locationId, calendarIds }`.
 * `locationId: null` (or blank) removes the mapping. Calendar ids are trimmed
 * and de-duplicated; an empty list counts every calendar. Re-saving the same
 * sub-account keeps what is waiting to apply; appointments held for a new one
 * are released to the next sync.
 */
export async function saveCrmLocation(ctx: ApiContext, clientId: string | undefined, raw: unknown): Promise<ApiCrmLocation> {
  const client = await findSectionClient(ctx, clientId);
  const body = parseBody(putBody, raw, { locationId: "crm_location", calendarIds: "crm_calendar" });

  const locationId = body.locationId?.trim() ? body.locationId.trim() : null;
  if (locationId && !CRM_ID.test(locationId)) throw new ApiError(400, "crm_location", LOCATION_FORMAT, { locationId: LOCATION_FORMAT });
  const calendarIds = Array.from(new Set((body.calendarIds ?? []).map((x) => x.trim()).filter(Boolean)));
  const bad = calendarIds.find((id) => !CRM_ID.test(id));
  if (bad) {
    const message = badCalendar(bad);
    throw new ApiError(400, "crm_calendar", message, { calendarIds: message });
  }
  if (!locationId && calendarIds.length) throw new ApiError(400, "crm_location", LOCATION_FIRST, { locationId: LOCATION_FIRST });

  const result = await saveClientCrmMapping({ clientId: client.id, locationId, calendarIds, by: ctx.email });
  if (!result.ok) {
    switch (result.reason) {
      case "own":
      case "agency":
        throw new ApiError(422, "crm_own", OWN, { locationId: OWN });
      case "taken": {
        const message = `That CRM sub-account is already mapped to ${await businessName(result.clientId)}.`;
        throw new ApiError(409, "crm_taken", message, { locationId: message });
      }
      case "db":
        throw new ApiError(500, "crm_db", DB_FAILED);
    }
  }
  return loadCrmLocation(client.id);
}

/** The other client's name for the crm_taken message ("another client" when it cannot be read). */
async function businessName(clientId: string): Promise<string> {
  const { data, error } = await requireDb().from("clients").select("business_name").eq("id", clientId).maybeSingle();
  if (error || !data) return "another client";
  const name = (data as { business_name: string | null }).business_name?.trim();
  return name || "another client";
}
