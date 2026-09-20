import { getSupabaseAdmin } from "@/lib/supabase";
import { ADMIN_CATEGORIES, type AdminCategory, type AdminSeverity } from "@/lib/admin-notify";

/**
 * Reading the admin notification center, per viewer.
 *
 * Every function takes the viewer's Supabase auth user id and whether they are
 * an owner. The database decides what is unread (a watermark plus per-row reads
 * plus muted categories) and what a manager may not see, so the web admin, the
 * JSON API and a future mobile app all get the same answer.
 *
 * Reads return null when they FAIL, which is not the same as empty. An inbox
 * that quietly shows "nothing new" while the database is down is worse than one
 * that says it could not load.
 */

export type NotificationFilter = "all" | "unread" | "action";

export type AdminNotification = {
  id: string;
  created_at: string;
  /** When it last happened. Differs from created_at once a burst repeats. Sort and page by this. */
  last_occurred_at: string;
  /** Above 1: the same problem happened again inside its window. */
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
  actor_type: string;
  actor_label: string | null;
  needs_action: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
  is_test: boolean;
  data: Record<string, unknown>;
  is_read: boolean;
  is_muted: boolean;
};

export type NotificationSummary = { unread: number; needsAction: number; criticalUnread: number };

export type Viewer = { userId: string; isOwner: boolean };

/** Where the next page starts. Both halves, so rows sharing a timestamp are never skipped. */
export type NotificationCursor = { before: string; beforeId: string };

export const EMPTY_SUMMARY: NotificationSummary = { unread: 0, needsAction: 0, criticalUnread: 0 };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isCategory(v: string | null | undefined): v is AdminCategory {
  return ADMIN_CATEGORIES.some((c) => c.key === v);
}

/** Opaque, URL-safe cursor. Clients hand it back untouched. */
export function encodeCursor(n: Pick<AdminNotification, "last_occurred_at" | "id">): string {
  return Buffer.from(`${n.last_occurred_at}|${n.id}`).toString("base64url");
}

export function decodeCursor(raw: string | null | undefined): NotificationCursor | null {
  if (!raw) return null;
  try {
    const [before, beforeId] = Buffer.from(raw, "base64url").toString("utf8").split("|");
    if (!before || Number.isNaN(Date.parse(before)) || !UUID_RE.test(beforeId ?? "")) return null;
    return { before, beforeId };
  } catch {
    return null;
  }
}

/** A brand new viewer starts at "now", not at a year of unread history. Idempotent. */
export async function seedViewer(viewer: Viewer): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const { error } = await supabase.rpc("admin_notification_seed_viewer", { p_user: viewer.userId });
  if (error) console.error("[admin-notifications] seed failed", error.message);
}

export async function getNotificationSummary(viewer: Viewer): Promise<NotificationSummary | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("admin_notification_summary", {
    p_user: viewer.userId,
    p_is_owner: viewer.isOwner,
  });
  if (error || !data) {
    console.error("[admin-notifications] summary failed", error?.message);
    return null;
  }
  const d = data as { unread?: number; needs_action?: number; critical_unread?: number };
  return { unread: d.unread ?? 0, needsAction: d.needs_action ?? 0, criticalUnread: d.critical_unread ?? 0 };
}

export async function listNotifications(
  viewer: Viewer,
  opts: {
    filter?: NotificationFilter;
    category?: AdminCategory | null;
    /** Owners only. The database ignores it for a manager. */
    includeTest?: boolean;
    cursor?: NotificationCursor | null;
    limit?: number;
  } = {},
): Promise<AdminNotification[] | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const limit = Math.min(Math.max(Math.floor(opts.limit ?? 30) || 30, 1), 100);
  const { data, error } = await supabase.rpc("admin_notification_list", {
    p_user: viewer.userId,
    p_is_owner: viewer.isOwner,
    p_filter: opts.filter ?? "all",
    p_category: opts.category ?? null,
    p_include_test: Boolean(opts.includeTest && viewer.isOwner),
    p_before: opts.cursor?.before ?? null,
    p_before_id: opts.cursor?.beforeId ?? null,
    p_limit: limit,
  });
  if (error) {
    console.error("[admin-notifications] list failed", error.message);
    return null;
  }
  return (data ?? []) as AdminNotification[];
}

/** Mark rows read for this viewer. Only rows they may see; unknown ids are skipped, not fatal. */
export async function markNotificationsRead(viewer: Viewer, ids: string[]): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const clean = [...new Set(ids.filter((id) => UUID_RE.test(id)))].slice(0, 200);
  if (!supabase || clean.length === 0) return false;
  const { error } = await supabase.rpc("admin_notification_mark_read", {
    p_user: viewer.userId,
    p_is_owner: viewer.isOwner,
    p_ids: clean,
  });
  if (error) console.error("[admin-notifications] mark read failed", error.message);
  return !error;
}

/**
 * One write, however many are unread. `seen` is the newest row the viewer was
 * actually shown: something that arrived after their last poll must not be
 * marked read by a click that never displayed it. The database clock caps it.
 */
export async function markAllNotificationsRead(viewer: Viewer, seen?: string | null): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  const { error } = await supabase.rpc("admin_notification_mark_all_read", {
    p_user: viewer.userId,
    p_seen: seen && !Number.isNaN(Date.parse(seen)) ? seen : null,
  });
  if (error) console.error("[admin-notifications] mark all read failed", error.message);
  return !error;
}

/**
 * Close, or reopen, a "needs action" item. Resolution is shared: when one person
 * deals with a failed payment, it leaves everyone's list. False when nothing
 * changed, including when the viewer is not allowed to see that row.
 */
export async function setNotificationResolved(viewer: Viewer, id: string, resolved: boolean, by: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !UUID_RE.test(id)) return false;
  const { data, error } = await supabase.rpc("admin_notification_resolve", {
    p_id: id,
    p_is_owner: viewer.isOwner,
    p_resolved: resolved,
    p_by: by,
  });
  if (error) console.error("[admin-notifications] resolve failed", error.message);
  return !error && Number(data) > 0;
}

export type CategoryPref = { category: AdminCategory; label: string; muted: boolean; push: boolean };

export async function getNotificationPrefs(viewer: Viewer): Promise<CategoryPref[]> {
  const supabase = getSupabaseAdmin();
  const rows = new Map<string, { muted: boolean; push: boolean }>();
  if (supabase) {
    const { data } = await supabase
      .from("admin_notification_prefs")
      .select("category,muted,push")
      .eq("user_id", viewer.userId);
    for (const r of (data ?? []) as { category: string; muted: boolean; push: boolean }[]) rows.set(r.category, r);
  }
  // Team and Audience only ever hold owner-only rows, so a manager never sees the switch.
  return ADMIN_CATEGORIES.filter((c) => viewer.isOwner || (c.key !== "team" && c.key !== "audience")).map((c) => ({
    category: c.key,
    label: c.label,
    muted: rows.get(c.key)?.muted ?? false,
    push: rows.get(c.key)?.push ?? true,
  }));
}

export async function setCategoryPref(
  viewer: Viewer,
  category: AdminCategory,
  patch: { muted?: boolean; push?: boolean },
): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  const { error } = await supabase
    .from("admin_notification_prefs")
    .upsert(
      { user_id: viewer.userId, category, ...patch, updated_at: new Date().toISOString() },
      { onConflict: "user_id,category" },
    );
  if (error) console.error("[admin-notifications] pref save failed", error.message);
  return !error;
}
