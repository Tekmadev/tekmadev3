import { z } from "zod";
import {
  ApiError,
  MESSAGES,
  dbError,
  decodeCursor,
  instant,
  keysetFilter,
  requireDb,
  toPage,
  type ApiContext,
  type Page,
} from "@/lib/admin-api";
import { postClientNote } from "@/lib/client-sections-data";
import type { ClientActivity } from "@/lib/clients-data";
import { COPY, FieldErrors, findSectionClient, humanize, isUrl, loadPeople, memberNames, noVendor, parseBody, shorten, zText, type People } from "./shared";

/**
 * The client's activity trail: the first page in the bundle, older pages
 * (GET /clients/:id/activity?cursor=&limit=), and an internal note or an
 * update shown in the client's portal (POST /clients/:id/activity).
 *
 * Rows are the website's client_activity. A note is event "note"; an update
 * is stored as "update.sent" and answered as kind and event "update". Their
 * full text is the row's summary (what the web admin shows); an update also
 * keeps its subject and link in `data`.
 */

export type ApiActivity = {
  id: string;
  clientId: string;
  kind: "note" | "update" | "event";
  event: string;
  summary: string;
  subject: string | null;
  text: string | null;
  actionUrl: string | null;
  visibleToClient: boolean;
  actor: { kind: "staff" | "client" | "system"; name: string | null; email: string | null };
  createdAt: string;
};

/** Labels for the events the client sections write (for GET /meta activityEvents). */
export const SECTION_ACTIVITY_EVENTS: { value: string; label: string }[] = [
  { value: "access.requested", label: "Access requested" },
  { value: "access.pending_client", label: "Access sent back to the client" },
  { value: "access.client_says_done", label: "Client says access is done" },
  { value: "access.client_marked_done", label: "Client says access is done" },
  { value: "access.granted", label: "Access granted" },
  { value: "access.verified", label: "Access verified" },
  { value: "access.revoked", label: "Access revoked" },
  { value: "access.not_applicable", label: "Access not needed" },
  { value: "approval.requested", label: "Approval requested" },
  { value: "approval.approved", label: "Approved" },
  { value: "approval.changes_requested", label: "Changes requested" },
  { value: "agreement.signed", label: "Agreement signed" },
  { value: "asset.uploaded", label: "File uploaded" },
  { value: "asset.deleted", label: "File removed" },
  { value: "call.added", label: "Call logged" },
  { value: "call.updated", label: "Call updated" },
  { value: "call.reviewed", label: "Call reviewed" },
  { value: "guarantee.met", label: "Guarantee met" },
  { value: "crm.location_mapped", label: "CRM mapping saved" },
  { value: "member.invited", label: "Invite sent" },
  { value: "member.invite_resent", label: "Invite sent again" },
  { value: "member.reset_sent", label: "Reset link sent" },
  { value: "member.invite_failed", label: "Invite failed" },
  { value: "member.activated", label: "Portal login" },
  { value: "member.updated", label: "Person updated" },
  { value: "member.disabled", label: "Person turned off" },
  { value: "note", label: "Internal note" },
  { value: "update", label: "Update to client" },
  { value: "credits.created", label: "Credits set from the lead" },
  { value: "credits.updated", label: "Credits changed" },
].filter((option, i, all) => all.findIndex((o) => o.value === option.value) === i);

const ACTOR_KIND: Record<ClientActivity["actor_type"], ApiActivity["actor"]["kind"]> = { admin: "staff", client: "client", system: "system" };

const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);

export function activityView(row: ClientActivity, people: People): ApiActivity {
  const kind: ApiActivity["kind"] = row.event === "note" ? "note" : row.event === "update.sent" ? "update" : "event";
  const data = row.data ?? {};
  const fullText = noVendor(row.summary ?? "");
  const subject = kind === "update" ? str(data.subject) : null;
  const summary =
    kind === "note" ? shorten(fullText) : kind === "update" ? subject ?? shorten(fullText) : fullText || humanize(row.event);
  const actorKind = ACTOR_KIND[row.actor_type] ?? "system";
  return {
    id: row.id,
    clientId: row.client_id,
    kind,
    event: kind === "update" ? "update" : row.event,
    summary,
    subject,
    text: kind === "event" ? null : fullText,
    actionUrl: kind === "update" ? str(data.action_url) : null,
    visibleToClient: row.visibility === "client",
    actor:
      actorKind === "system"
        ? { kind: "system", name: "System", email: null }
        : { kind: actorKind, name: people.name(row.actor_email), email: row.actor_email },
    createdAt: instant(row.created_at),
  };
}

/**
 * Activity events a caller may not see, as event-name prefixes. Billing and
 * care plan events carry amounts, refunds and subscription states
 * ("Order partially refunded (12.00 CAD)", "Webline Care set up. First charge
 * ..."), so they need `clients.billing`; CRM plumbing ("CRM account set to
 * ...") needs `clients.crm`, like the bundle's crmLocation. Credit changes
 * name everyone's shares, so they need `clients.credits.view` (staff only
 * ever see their own credit rows, never anyone else's).
 */
export function hiddenActivityPrefixes(ctx: Pick<ApiContext, "can">): string[] {
  const hidden: string[] = [];
  if (!ctx.can("clients.billing")) hidden.push("billing.", "care.");
  if (!ctx.can("clients.crm")) hidden.push("crm.");
  if (!ctx.can("clients.credits.view")) hidden.push("credits.");
  return hidden;
}

/** One page of a client's activity, newest first (keyset on created_at, id), without the `hide` event prefixes. */
export async function activityPage(
  clientId: string,
  opts: { cursor?: string | null; limit: number; hide?: readonly string[] },
  people: People,
): Promise<Page<ApiActivity>> {
  const after = decodeCursor(opts.cursor, z.tuple([z.string(), z.string()]));
  let query = requireDb()
    .from("client_activity")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(opts.limit + 1);
  // Prefixes are fixed lowercase words ending in a dot: no LIKE wildcards to escape.
  for (const prefix of opts.hide ?? []) query = query.not("event", "like", `${prefix}%`);
  if (after) query = query.or(keysetFilter(["created_at", "id"], after, "desc"));
  const { data, error } = await query;
  if (error) throw dbError("client activity page", error);
  return toPage((data ?? []) as ClientActivity[], opts.limit, (row) => [row.created_at, row.id], (row) => activityView(row, people));
}

/** GET /clients/:id/activity. */
export async function listActivity(ctx: ApiContext, clientId: string | undefined, query: { cursor?: string; limit: number }): Promise<Page<ApiActivity>> {
  const client = await findSectionClient(ctx, clientId);
  const people = await loadPeople(ctx, await memberNames(client.id));
  return activityPage(client.id, { cursor: query.cursor, limit: query.limit, hide: hiddenActivityPrefixes(ctx) }, people);
}

/* ------------------------------------------------------------------ */
/* POST /clients/:id/activity                                          */
/* ------------------------------------------------------------------ */

const WRITE = "Write something first.";

const postBody = z.object({
  kind: z.enum(["note", "update"], { error: "Pick an internal note or an update to the client." }),
  text: z.string({ error: WRITE }).trim().min(1, WRITE).max(5000, "Keep it under 5000 characters."),
  // Updates only; checked below so a note never fails on them.
  subject: z.unknown().optional(),
  actionUrl: z.unknown().optional(),
});

const updateExtras = z.object({ subject: zText(200), actionUrl: zText(2048) });

/**
 * An internal note (staff only) or an update that appears in the client's
 * portal (no email is sent). 201 with the new entry.
 */
export async function postActivity(ctx: ApiContext, clientId: string | undefined, raw: unknown): Promise<ApiActivity> {
  const client = await findSectionClient(ctx, clientId);
  const body = parseBody(postBody, raw, { kind: "kind", text: "text" });
  let subject: string | null = null;
  let actionUrl: string | null = null;
  if (body.kind === "update") {
    const extras = parseBody(updateExtras, { subject: body.subject, actionUrl: body.actionUrl });
    const errors = new FieldErrors();
    if (extras.actionUrl && !isUrl(extras.actionUrl)) errors.add("actionUrl", "url", COPY.link);
    errors.throwIfAny();
    subject = extras.subject ?? null;
    actionUrl = extras.actionUrl ?? null;
  }
  const row = await postClientNote({ clientId: client.id, kind: body.kind, text: body.text, subject, actionUrl, by: ctx.email });
  if (!row) throw new ApiError(500, "unavailable", MESSAGES.unavailable);
  return activityView(row, await loadPeople(ctx));
}
