import { z } from "zod";
import type { AdminCategory, AdminSeverity } from "@/lib/admin-notify";
import { setCategoryPref } from "@/lib/admin-notifications-data";
import type { ApiContext } from "../auth";
import { decodeCursor, type CursorPart } from "../cursor";
import { dbError, instant, isUuid, requireDb } from "../data";
import { ApiError, MESSAGES } from "../errors";
import { can, inboxCategories, readsOwnerAudience } from "../permissions";
import { scrubVendor, scrubVendorDeep } from "../crm/copy";
import { categoryLabel, eventLabel, type NotificationFilter } from "./catalog";

/**
 * The Inbox for the admin API (GET/POST /notifications/**), per caller.
 *
 * The database decides what is read, quiet, open and visible
 * (supabase/migrations/20261003000201_admin_api_inbox.sql), with the same
 * definitions the web admin uses, so the bell on the website and the badge on
 * the phone always agree. This module adds what the API needs on top: the
 * caller's categories from the permission matrix (owners and managers read all
 * seven, staff Leads and Clients only), owner-audience rows for owners and
 * managers only, the app's item shape, and the copy.
 *
 * Read state and quiet categories are per person; "needs action" resolution is
 * shared. A bumped row keeps its id, moves to the top and is unread again for
 * everyone.
 */

export type NotificationItem = {
  id: string;
  last_occurred_at: string;
  occurrences: number;
  event_key: string;
  category: AdminCategory;
  severity: AdminSeverity;
  title: string;
  body: string | null;
  action_url: string | null;
  entity_type: string | null;
  entity_id: string | null;
  client_id: string | null;
  actor_type: string | null;
  actor_label: string | null;
  needs_action: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
  is_test: boolean;
  data: Record<string, unknown>;
  is_read: boolean;
  is_muted: boolean;
  label: string;
};

export type NotificationSummary = { unread: number; needsAction: number; criticalUnread: number };

export type NotificationPref = { category: AdminCategory; label: string; muted: boolean; push: boolean };

/** Who is reading the Inbox, with what the permission matrix lets them read. */
export type InboxViewer = {
  userId: string;
  isOwner: boolean;
  email: string;
  name: string | null;
  /** The categories this role may read (`inbox.<category>`), in catalogue order. */
  categories: AdminCategory[];
  /**
   * Owner-audience rows (`audience: "owner"`): owners and managers, never
   * staff (readsOwnerAudience). Sent to the database as `p_is_owner`, which
   * also lets test rows through when they are asked for: `includeTest` is
   * only ever true with `seesTest`, and both roles that read owner-audience
   * rows hold `testdata.view`.
   */
  ownerAudience: boolean;
  /** Test rows: `testdata.view` (owners and managers; opt-in in lists, always by id). */
  seesTest: boolean;
};

export function inboxViewer(ctx: ApiContext): InboxViewer {
  return {
    userId: ctx.userId,
    isOwner: ctx.isOwner,
    email: ctx.email,
    name: ctx.name,
    categories: inboxCategories(ctx),
    ownerAudience: readsOwnerAudience(ctx),
    seesTest: can(ctx, "testdata.view"),
  };
}

/** A row as admin_api_notification_list returns it (timestamps exactly as Postgres sent them). */
export type InboxRow = {
  id: string;
  created_at: string;
  last_occurred_at: string;
  occurrences: number | null;
  event_key: string;
  category: AdminCategory;
  severity: AdminSeverity;
  title: string;
  body: string | null;
  action_url: string | null;
  entity_type: string | null;
  entity_id: string | null;
  client_id: string | null;
  actor_type: string | null;
  actor_label: string | null;
  needs_action: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
  is_test: boolean;
  data: unknown;
  is_read: boolean;
  is_muted: boolean;
};

/* ------------------------------------------------------------------ */
/* Copy and errors                                                     */
/* ------------------------------------------------------------------ */

export const INBOX_MESSAGES = {
  filter: "Unknown filter. Use all, unread or action.",
  category: "Unknown notification category.",
  cursor: "That page of the inbox is out of date. Pull to refresh.",
  idsMin: "Pick at least one notification.",
  idsMax: "Pick at most 500 notifications at a time.",
  seen: "That watermark is not a valid time. Pull to refresh, then try again.",
  resolved: "Send resolved as true or false.",
  notFound: "That notification no longer exists.",
  notActionable: "This notification does not need action.",
  prefInput: "Send quiet and push as true or false.",
  prefField: "Send true or false.",
  prefNotFound: "That notification category does not exist.",
} as const;

/** The most ids one read or unread call may send. */
export const MAX_IDS = 500;

export const notificationNotFound = () => new ApiError(404, "not_found", INBOX_MESSAGES.notFound);

/* ------------------------------------------------------------------ */
/* Cursor: "after this row" in the newest-first order                  */
/* ------------------------------------------------------------------ */

/** A Postgres timestamptz as PostgREST sends it (or the ISO form). */
const PG_INSTANT = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}(:?\d{2})?)$/i;

const cursorShape = z.tuple([z.string().regex(PG_INSTANT), z.string().refine((v) => isUuid(v))]);

/** The row a page starts after, or null for the first page. 400 `cursor` when it is stale or not ours. */
export function decodeInboxCursor(raw: string | null | undefined): { at: string; id: string } | null {
  try {
    const tuple = decodeCursor(raw, cursorShape);
    return tuple ? { at: tuple[0], id: tuple[1] } : null;
  } catch {
    throw new ApiError(400, "cursor", INBOX_MESSAGES.cursor);
  }
}

/** The cursor tuple of a row: last_occurred_at exactly as Postgres sent it, then the id. */
export const inboxCursorOf = (row: InboxRow): readonly CursorPart[] => [row.last_occurred_at, row.id];

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

type ListArgs = {
  filter?: NotificationFilter;
  category?: AdminCategory | null;
  includeTest?: boolean;
  after?: { at: string; id: string } | null;
  limit: number;
  ids?: string[] | null;
};

async function listRows(viewer: InboxViewer, args: ListArgs): Promise<InboxRow[]> {
  const { data, error } = await requireDb().rpc("admin_api_notification_list", {
    p_user: viewer.userId,
    p_is_owner: viewer.ownerAudience,
    p_categories: viewer.categories,
    p_filter: args.filter ?? "all",
    p_category: args.category ?? null,
    p_include_test: Boolean(args.includeTest && viewer.seesTest),
    p_before: args.after?.at ?? null,
    p_before_id: args.after?.id ?? null,
    p_limit: args.limit,
    p_ids: args.ids ?? null,
  });
  if (error) throw dbError("inbox list", error);
  return (data ?? []) as InboxRow[];
}

/**
 * One page of the Inbox, newest first by last_occurred_at (ties by id). Fetches
 * `limit + 1` rows so the caller can tell whether there is a next page
 * (toPage). A category the caller may not read simply has no rows.
 */
export async function listInboxRows(
  viewer: InboxViewer,
  opts: { filter: NotificationFilter; category: AdminCategory | null; includeTest: boolean; after: { at: string; id: string } | null; limit: number },
): Promise<InboxRow[]> {
  if (opts.category && !viewer.categories.includes(opts.category)) return [];
  return listRows(viewer, { ...opts, limit: opts.limit + 1 });
}

/**
 * The rows with these ids that the caller may see (test rows included with
 * `testdata.view`), in the order the ids were given. Unknown and hidden ids are left out.
 */
export async function inboxRowsByIds(viewer: InboxViewer, ids: readonly string[]): Promise<InboxRow[]> {
  const wanted = [...new Set(ids.filter((id) => isUuid(id)).map((id) => id.toLowerCase()))];
  if (wanted.length === 0) return [];
  const rows = await listRows(viewer, { ids: wanted, includeTest: true, limit: wanted.length });
  const byId = new Map(rows.map((row) => [row.id.toLowerCase(), row]));
  return wanted.map((id) => byId.get(id)).filter((row): row is InboxRow => !!row);
}

/** One row the caller may see, or the 404. */
export async function inboxRowOrNotFound(viewer: InboxViewer, id: string): Promise<InboxRow> {
  if (!isUuid(id)) throw notificationNotFound();
  const [row] = await inboxRowsByIds(viewer, [id]);
  if (!row) throw notificationNotFound();
  return row;
}

const zSummary = z.object({
  unread: z.coerce.number().int().nonnegative(),
  needs_action: z.coerce.number().int().nonnegative(),
  critical_unread: z.coerce.number().int().nonnegative(),
});

/**
 * The badge summary: unread and critical unread leave out quiet categories,
 * needs action counts open rows whether quiet or not. Test rows only when a
 * list asked for them with `testdata.view` (so the header matches the rows on screen).
 */
export async function inboxSummary(viewer: InboxViewer, includeTest = false): Promise<NotificationSummary> {
  const { data, error } = await requireDb().rpc("admin_api_notification_summary", {
    p_user: viewer.userId,
    p_is_owner: viewer.ownerAudience,
    p_categories: viewer.categories,
    p_include_test: Boolean(includeTest && viewer.seesTest),
  });
  if (error) throw dbError("inbox summary", error);
  const parsed = zSummary.safeParse(data);
  if (!parsed.success) throw dbError("inbox summary shape", { message: parsed.error.message });
  return { unread: parsed.data.unread, needsAction: parsed.data.needs_action, criticalUnread: parsed.data.critical_unread };
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

const uuids = (ids: readonly string[]) => [...new Set(ids.filter((id) => isUuid(id)))];

/** Mark rows read for the caller (only rows they may see). */
export async function markInboxRead(viewer: InboxViewer, ids: readonly string[]): Promise<void> {
  const list = uuids(ids);
  if (list.length === 0) return;
  const { error } = await requireDb().rpc("admin_api_notification_mark_read", {
    p_user: viewer.userId,
    p_is_owner: viewer.ownerAudience,
    p_categories: viewer.categories,
    p_ids: list,
  });
  if (error) throw dbError("inbox mark read", error);
}

/** Mark rows unread for the caller (only rows they may see). */
export async function markInboxUnread(viewer: InboxViewer, ids: readonly string[]): Promise<void> {
  const list = uuids(ids);
  if (list.length === 0) return;
  const { error } = await requireDb().rpc("admin_api_notification_mark_unread", {
    p_user: viewer.userId,
    p_is_owner: viewer.ownerAudience,
    p_categories: viewer.categories,
    p_ids: list,
  });
  if (error) throw dbError("inbox mark unread", error);
}

/**
 * Mark read everything the caller can see up to `seen` (the newest
 * last_occurred_at they were shown, exactly as received), or everything when
 * absent. The database clock caps it. Returns how many rows became read.
 */
export async function markInboxReadAll(viewer: InboxViewer, seen: string | null): Promise<number> {
  const { data, error } = await requireDb().rpc("admin_api_notification_read_all", {
    p_user: viewer.userId,
    p_is_owner: viewer.ownerAudience,
    p_categories: viewer.categories,
    p_seen: seen,
  });
  if (error) throw dbError("inbox read all", error);
  const count = Number(data);
  return Number.isFinite(count) ? count : 0;
}

/**
 * Close or reopen a needs-action row (shared by all staff) and mark it read for
 * the caller. Throws the 404 or the 422 the contract names.
 */
export async function resolveInboxRow(viewer: InboxViewer, id: string, resolved: boolean): Promise<void> {
  if (!isUuid(id)) throw notificationNotFound();
  const { data, error } = await requireDb().rpc("admin_api_notification_resolve", {
    p_user: viewer.userId,
    p_is_owner: viewer.ownerAudience,
    p_categories: viewer.categories,
    p_id: id,
    p_resolved: resolved,
    // Shown as "Resolved by {who}": their name, or their email when they have none.
    p_by: viewer.name ?? viewer.email,
  });
  if (error) throw dbError("inbox resolve", error);
  if (data === "missing") throw notificationNotFound();
  if (data === "not_actionable") throw new ApiError(422, "not_actionable", INBOX_MESSAGES.notActionable);
  if (data !== "ok") throw dbError("inbox resolve answer", { message: String(data) });
}

/* ------------------------------------------------------------------ */
/* The app's item shape                                                */
/* ------------------------------------------------------------------ */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Resolvers that are not a person (lib/admin-notify.ts resolveAdminNotifications callers). */
const AUTOMATIC_RESOLVERS: Record<string, string> = {
  system: "System",
  "crm outbox": "CRM sync",
};

/**
 * Display names for the staff emails stored in resolved_by (the web admin
 * stores the email): the admins row name, or the caller's own name. A lookup
 * that fails falls back to the email, which is still the right person.
 */
async function resolverNames(viewer: InboxViewer, rows: readonly InboxRow[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (viewer.name) names.set(viewer.email.toLowerCase(), viewer.name);
  const emails = [
    ...new Set(
      rows
        .map((row) => (row.resolved_at && row.resolved_by ? row.resolved_by.trim().toLowerCase() : ""))
        .filter((value) => EMAIL_RE.test(value) && !names.has(value)),
    ),
  ];
  if (emails.length === 0) return names;
  const { data, error } = await requireDb().from("admins").select("email,name").in("email", emails);
  if (error) {
    console.error("[admin-api] inbox resolver names failed", error.code ?? "", error.message);
    return names;
  }
  for (const admin of (data ?? []) as { email: string | null; name: string | null }[]) {
    const name = admin.name?.trim();
    if (admin.email && name) names.set(admin.email.toLowerCase(), name);
  }
  return names;
}

function displayResolver(value: string | null, names: Map<string, string>): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const key = raw.toLowerCase();
  return names.get(key) ?? AUTOMATIC_RESOLVERS[key] ?? raw;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function toItem(row: InboxRow, names: Map<string, string>): NotificationItem {
  return {
    id: row.id,
    last_occurred_at: instant(row.last_occurred_at),
    occurrences: typeof row.occurrences === "number" && row.occurrences > 0 ? row.occurrences : 1,
    event_key: row.event_key,
    category: row.category,
    severity: row.severity,
    // Rows written by lib/crm can name the CRM vendor, its hosts and its env
    // settings (a token error tells the owner where to make a new one): never sent.
    title: scrubVendor(row.title),
    body: row.body === null ? null : scrubVendor(row.body),
    action_url: row.action_url,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    client_id: row.client_id,
    actor_type: row.actor_type,
    actor_label: row.actor_label === null ? null : scrubVendor(row.actor_label),
    needs_action: row.needs_action,
    resolved_at: instant(row.resolved_at),
    resolved_by: row.resolved_at ? displayResolver(row.resolved_by, names) : null,
    is_test: row.is_test,
    // Always an object, never null.
    data: isRecord(row.data) ? (scrubVendorDeep(row.data) as Record<string, unknown>) : {},
    is_read: row.is_read,
    is_muted: row.is_muted,
    label: eventLabel(row.event_key),
  };
}

/** Rows as the app's NotificationItem (src/api/schemas/notifications.ts). */
export async function toNotificationItems(viewer: InboxViewer, rows: readonly InboxRow[]): Promise<NotificationItem[]> {
  const names = await resolverNames(viewer, rows);
  return rows.map((row) => toItem(row, names));
}

/* ------------------------------------------------------------------ */
/* Preferences: Quiet (muted) and Push, per person and category        */
/* ------------------------------------------------------------------ */

/** One row per category the caller may read, in catalogue order. Defaults: not quiet, push on. */
export async function loadInboxPrefs(viewer: InboxViewer): Promise<NotificationPref[]> {
  const { data, error } = await requireDb()
    .from("admin_notification_prefs")
    .select("category,muted,push")
    .eq("user_id", viewer.userId);
  if (error) throw dbError("inbox prefs", error);
  const stored = new Map<string, { muted: boolean; push: boolean }>();
  for (const row of (data ?? []) as { category: string; muted: boolean; push: boolean }[]) stored.set(row.category, row);
  return viewer.categories.map((category) => ({
    category,
    label: categoryLabel(category),
    muted: stored.get(category)?.muted ?? false,
    push: stored.get(category)?.push ?? true,
  }));
}

/** Save Quiet and/or Push for one category the caller may read, and answer the full row. */
export async function saveInboxPref(
  viewer: InboxViewer,
  category: AdminCategory,
  patch: { muted?: boolean; push?: boolean },
): Promise<NotificationPref> {
  if (patch.muted !== undefined || patch.push !== undefined) {
    const saved = await setCategoryPref({ userId: viewer.userId, isOwner: viewer.isOwner }, category, patch);
    if (!saved) throw new ApiError(500, "unavailable", MESSAGES.unavailable);
  }
  const pref = (await loadInboxPrefs(viewer)).find((p) => p.category === category);
  if (!pref) throw new ApiError(500, "unavailable", MESSAGES.unavailable);
  return pref;
}
