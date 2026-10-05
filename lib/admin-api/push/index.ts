import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PAUSED, resolveRole, type AdminRole, type RoleResolution } from "@/lib/admin";
import { listAdminDevices } from "@/lib/admin-devices";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { AdminPushTarget } from "@/lib/admin-notify";
import { ApiError, MESSAGES } from "../errors";
import { requireDb } from "../data";
import { can, readsOwnerAudience } from "../permissions";
import { isNotificationCategory, roleReadsCategory } from "../notifications/catalog";
import {
  ExpoRequestError,
  MAX_MESSAGES_PER_REQUEST,
  MAX_RECEIPTS_PER_REQUEST,
  errorCodeOf,
  getExpoReceipts,
  sendExpoMessages,
  type ExpoMessage,
  type ExpoTicket,
} from "./expo";
import { TEST_NOTIFICATION_ID, rowMessage, shortRowMessage, testMessage, type PushRow } from "./messages";

/**
 * Phone notifications for the Inbox, through the Expo push service.
 *
 * When lib/admin-notify.ts writes a new row or bumps one, `queueAdminPush`
 * schedules a push (after the response, with Next's `after`) to every phone of
 * every staff member who may see the row:
 *
 *   - the role reads the row's category (`inbox.<category>` in
 *     lib/admin-api/permissions.ts: owners and managers read all seven, staff
 *     Leads and Clients only);
 *   - owner-audience rows go to owners and managers (readsOwnerAudience),
 *     never to staff, whatever the category ("Client deleted" sits in Clients);
 *   - test rows go to whoever holds `testdata.view` (owners and managers);
 *   - the person has Push on for that category and the category is not Quiet
 *     for them (admin_notification_prefs; defaults: push on, not quiet);
 *   - when the writer narrowed the push (notifyAdmins `push`), the person is
 *     in `only` and not in `except`. Inbox rows are shared, so this is the one
 *     way to ring a single person ("Demo ready" rings the salesperson who
 *     asked for it); the row itself stays readable by everyone allowed it.
 *
 * A bump pushes again with the same tag and collapseId (the row id), so the
 * phone replaces the earlier entry instead of piling up.
 *
 * Tickets are kept in admin_push_tickets and their receipts read about 15
 * minutes later (`checkPushReceipts`, run after pushes and on Inbox summary
 * polls, at most every 5 minutes per server instance). DeviceNotRegistered
 * deletes the phone's admin_devices row; MessageTooBig is resent once with a
 * shorter body; anything else is written to admin_devices.last_push_error.
 *
 * Nothing here ever throws into lib/admin-notify.ts: a push is never worth
 * breaking the webhook or action that wrote the notification.
 */

type DeviceRef = { id: string; user_id: string; user_email: string; token: string };

type NotificationRecord = PushRow & { audience: string; is_test: boolean };

type Target = { deviceId: string; token: string; message: ExpoMessage };

type TicketRow = { id: string; device_id: string; notification_id: string; attempt: number; created_at: string };

export type DeliveryReport = {
  /** Messages the push service accepted. */
  sent: number;
  /** Phones the push service says are gone (their rows were deleted). */
  unregistered: number;
  /** Other per-message errors, by code. */
  failed: Record<string, number>;
  /** At least one request failed as a whole (network, outage, credentials). */
  requestFailed: boolean;
};

const log = (what: string, err: unknown) =>
  console.error(`[admin-push] ${what}`, err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err));

/** PostgREST puts filter values in the URL: keep `in` lists short. */
const URL_CHUNK = 100;

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/* ------------------------------------------------------------------ */
/* Delivery                                                            */
/* ------------------------------------------------------------------ */

/** Writes what a send learned: tickets to check later, healthy phones, dead phones, errors. */
async function recordDelivery(
  db: SupabaseClient,
  result: { tickets: Omit<TicketRow, "created_at">[]; okDevices: string[]; deadDevices: string[]; errors: Map<string, string> },
): Promise<void> {
  const now = new Date().toISOString();
  try {
    for (const part of chunks(result.tickets, 500)) {
      const { error } = await db.from("admin_push_tickets").insert(part);
      if (error) log("saving tickets failed", error.message);
    }
    for (const part of chunks([...new Set(result.okDevices)], URL_CHUNK)) {
      const { error } = await db.from("admin_devices").update({ last_push_at: now, last_push_error: null }).in("id", part);
      if (error) log("marking phones healthy failed", error.message);
    }
    for (const part of chunks([...new Set(result.deadDevices)], URL_CHUNK)) {
      const { error } = await db.from("admin_devices").delete().in("id", part);
      if (error) log("removing unregistered phones failed", error.message);
    }
    const byCode = new Map<string, string[]>();
    for (const [deviceId, code] of result.errors) byCode.set(code, [...(byCode.get(code) ?? []), deviceId]);
    for (const [code, ids] of byCode) {
      for (const part of chunks(ids, URL_CHUNK)) {
        const { error } = await db.from("admin_devices").update({ last_push_at: now, last_push_error: code.slice(0, 200) }).in("id", part);
        if (error) log("recording push errors failed", error.message);
      }
    }
  } catch (err) {
    log("recording the delivery threw", err);
  }
}

/**
 * Sends one message per target (100 per request), records the outcome, and
 * resends MessageTooBig once with `shrink` (a shorter body).
 */
async function deliver(
  db: SupabaseClient,
  notificationId: string,
  targets: readonly Target[],
  attempt: 1 | 2,
  shrink?: (target: Target) => ExpoMessage,
): Promise<DeliveryReport> {
  const report: DeliveryReport = { sent: 0, unregistered: 0, failed: {}, requestFailed: false };
  const tickets: Omit<TicketRow, "created_at">[] = [];
  const okDevices: string[] = [];
  const deadDevices: string[] = [];
  const errors = new Map<string, string>();
  const tooBig: Target[] = [];

  for (const chunk of chunks(targets, MAX_MESSAGES_PER_REQUEST)) {
    let results: ExpoTicket[];
    try {
      results = await sendExpoMessages(chunk.map((t) => t.message));
    } catch (err) {
      report.requestFailed = true;
      const code = err instanceof ExpoRequestError && err.code ? err.code : "request_failed";
      log(`send failed (${code})`, err);
      for (const t of chunk) errors.set(t.deviceId, code);
      continue;
    }
    results.forEach((ticket, i) => {
      const target = chunk[i];
      if (ticket.status === "ok") {
        report.sent += 1;
        okDevices.push(target.deviceId);
        tickets.push({ id: ticket.id, device_id: target.deviceId, notification_id: notificationId, attempt });
        return;
      }
      const code = errorCodeOf(ticket) ?? "unknown";
      if (code === "DeviceNotRegistered") {
        report.unregistered += 1;
        deadDevices.push(target.deviceId);
      } else if (code === "MessageTooBig" && attempt === 1 && shrink) {
        tooBig.push({ ...target, message: shrink(target) });
      } else {
        report.failed[code] = (report.failed[code] ?? 0) + 1;
        errors.set(target.deviceId, code);
      }
    });
  }

  await recordDelivery(db, { tickets, okDevices, deadDevices, errors });

  if (tooBig.length > 0) {
    const again = await deliver(db, notificationId, tooBig, 2);
    report.sent += again.sent;
    report.unregistered += again.unregistered;
    report.requestFailed ||= again.requestFailed;
    for (const [code, n] of Object.entries(again.failed)) report.failed[code] = (report.failed[code] ?? 0) + n;
  }
  return report;
}

/* ------------------------------------------------------------------ */
/* Who gets a row                                                      */
/* ------------------------------------------------------------------ */

/**
 * Whether a role may see a row, by the same rules as the Inbox lists: its
 * category (`inbox.<category>`), owner audience (owners and managers only,
 * never staff) and test rows (`testdata.view`). An unknown audience counts as
 * owner audience, so a row nobody classified never reaches staff.
 */
export function mayReceive(role: AdminRole, row: Pick<NotificationRecord, "category" | "audience" | "is_test">): boolean {
  if (!isNotificationCategory(row.category) || !roleReadsCategory(role, row.category)) return false;
  if (row.audience !== "staff" && !readsOwnerAudience(role)) return false;
  if (row.is_test && !can(role, "testdata.view")) return false;
  return true;
}

const lowerEmail = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

/** Whether a phone's owner is in the writer's narrowed audience (none given: everyone). */
export function inPushTarget(email: string, target?: AdminPushTarget): boolean {
  const e = lowerEmail(email);
  if (target?.except?.some((x) => lowerEmail(x) === e)) return false;
  if (target?.only && !target.only.some((x) => lowerEmail(x) === e)) return false;
  return true;
}

/** The phones that should ring for this row. Empty on any doubt (never push past a Quiet we could not read). */
async function recipientsFor(db: SupabaseClient, row: NotificationRecord, target?: AdminPushTarget): Promise<DeviceRef[]> {
  if (target?.only && target.only.length === 0) return [];
  const { data, error } = await db.from("admin_devices").select("id,user_id,user_email,token");
  if (error) {
    log("reading phones failed", error.message);
    return [];
  }
  const devices = ((data ?? []) as DeviceRef[]).filter((d) => inPushTarget(d.user_email, target));
  if (devices.length === 0) return [];

  // One role per person, resolved like every sign-in (env owners, then the admins table).
  // A paused person gets no pushes: their phones stay registered and ring again once resumed.
  const people = new Map<string, string>();
  for (const d of devices) if (!people.has(d.user_id)) people.set(d.user_id, d.user_email);
  const roles = new Map<string, RoleResolution>();
  await Promise.all(
    [...people].map(async ([userId, email]) => {
      try {
        roles.set(userId, await resolveRole(email));
      } catch (err) {
        log("resolving a role failed", err);
        roles.set(userId, null);
      }
    }),
  );
  const allowed = [...people.keys()].filter((userId) => {
    const role = roles.get(userId);
    return !!role && role !== PAUSED && mayReceive(role, row);
  });
  if (allowed.length === 0) return [];

  const { data: prefRows, error: prefError } = await db
    .from("admin_notification_prefs")
    .select("user_id,muted,push")
    .eq("category", row.category)
    .in("user_id", allowed);
  if (prefError) {
    log("reading push preferences failed", prefError.message);
    return [];
  }
  const prefs = new Map(((prefRows ?? []) as { user_id: string; muted: boolean; push: boolean }[]).map((p) => [p.user_id, p]));
  const wants = new Set(
    allowed.filter((userId) => {
      const pref = prefs.get(userId);
      return (pref?.push ?? true) && !(pref?.muted ?? false);
    }),
  );
  return devices.filter((d) => wants.has(d.user_id));
}

/* ------------------------------------------------------------------ */
/* Public entry points                                                 */
/* ------------------------------------------------------------------ */

const ROW_COLUMNS = "id,event_key,category,severity,audience,is_test,title,body,action_url";

/** Push one Inbox row (new or bumped) to every phone that should ring (narrowed by `target`). Never throws. */
export async function pushNotificationRow(notificationId: string, target?: AdminPushTarget): Promise<DeliveryReport | null> {
  try {
    const db = getSupabaseAdmin();
    if (!db) return null;
    const { data, error } = await db.from("admin_notifications").select(ROW_COLUMNS).eq("id", notificationId).maybeSingle();
    if (error) {
      log("reading the notification failed", error.message);
      return null;
    }
    if (!data) return null;
    const row = data as NotificationRecord;
    const devices = await recipientsFor(db, row, target);
    if (devices.length === 0) return null;
    const report = await deliver(
      db,
      row.id,
      devices.map((d) => ({ deviceId: d.id, token: d.token, message: rowMessage(row, d.token) })),
      1,
      (target) => shortRowMessage(row, target.token),
    );
    if (report.requestFailed || Object.keys(report.failed).length > 0) {
      log(`push for ${row.event_key} incomplete`, { sent: report.sent, failed: report.failed, requestFailed: report.requestFailed });
    }
    return report;
  } catch (err) {
    log("push threw", err);
    return null;
  }
}

/** Run a task after the response; outside a request (a script), start it now in the background. */
function inBackground(task: () => Promise<void>): void {
  const safe = async () => {
    try {
      await task();
    } catch (err) {
      log("background task threw", err);
    }
  };
  try {
    after(safe);
  } catch {
    void safe();
  }
}

/**
 * Called by lib/admin-notify.ts after it writes or bumps a row. Returns at
 * once: the push goes out after the response. Never throws. `target` narrows
 * who rings (notifyAdmins `push`).
 */
export function queueAdminPush(notificationId: string, target?: AdminPushTarget): void {
  try {
    inBackground(async () => {
      await pushNotificationRow(notificationId, target);
      await checkPushReceipts();
    });
  } catch (err) {
    log("queueing a push threw", err);
  }
}

/** Read due push receipts after the response (throttled). For routes the app polls. */
export function schedulePushMaintenance(): void {
  try {
    inBackground(() => checkPushReceipts());
  } catch (err) {
    log("scheduling receipts threw", err);
  }
}

/* ------------------------------------------------------------------ */
/* Test push                                                           */
/* ------------------------------------------------------------------ */

export const TEST_PUSH_MESSAGES = {
  noDevices: "This phone is not set up for notifications yet. Allow notifications, then try again.",
  unreachable: "Could not reach the push service. Try again in a moment.",
  refused: "The push service did not accept the test notification. Try again in a moment.",
} as const;

/**
 * "Send a test notification": one push to the given phone of the caller, or to
 * every phone they registered. No Inbox row behind it. Answers how many phones
 * the push service accepted it for.
 */
export async function sendTestPush(userId: string, deviceId: string | null): Promise<{ sent: number }> {
  const db = requireDb();
  const devices = await listAdminDevices([userId]);
  if (!devices) throw new ApiError(500, "unavailable", MESSAGES.unavailable);
  const wanted = deviceId?.trim().toLowerCase() ?? null;
  const targets = wanted ? devices.filter((d) => d.id.toLowerCase() === wanted) : devices;
  if (targets.length === 0) throw new ApiError(422, "no_devices", TEST_PUSH_MESSAGES.noDevices);

  const report = await deliver(
    db,
    TEST_NOTIFICATION_ID,
    targets.map((d) => ({ deviceId: d.id, token: d.token, message: testMessage(d.token) })),
    1,
  );
  schedulePushMaintenance();
  if (report.sent > 0) return { sent: report.sent };
  // Every token was dead: those rows are gone, and the phone has to register again.
  if (report.unregistered === targets.length) throw new ApiError(422, "no_devices", TEST_PUSH_MESSAGES.noDevices);
  if (report.requestFailed) throw new ApiError(502, "push", TEST_PUSH_MESSAGES.unreachable);
  throw new ApiError(502, "push", TEST_PUSH_MESSAGES.refused);
}

/* ------------------------------------------------------------------ */
/* Receipts and phone housekeeping                                     */
/* ------------------------------------------------------------------ */

/** Expo: check receipts about 15 minutes after sending; they are gone after 24 hours. */
const RECEIPT_DELAY_MS = 15 * 60_000;
const RECEIPT_EXPIRY_MS = 24 * 60 * 60_000;
/** At most one receipt pass per server instance in this window. */
const CHECK_EVERY_MS = 5 * 60_000;
/** The app registers at least weekly; a phone silent this long is gone. */
const DEVICE_STALE_MS = 60 * 24 * 60 * 60_000;

let lastCheckAt = 0;
let running: Promise<void> | null = null;

/**
 * Reads the receipts of tickets that are due, then forgets them. Throttled per
 * server instance unless `force`. Never throws.
 */
export function checkPushReceipts(opts: { force?: boolean } = {}): Promise<void> {
  const now = Date.now();
  if (running) return running;
  if (!opts.force && now - lastCheckAt < CHECK_EVERY_MS) return Promise.resolve();
  lastCheckAt = now;
  running = runReceiptCheck()
    .catch((err) => log("receipt check threw", err))
    .finally(() => {
      running = null;
    });
  return running;
}

async function runReceiptCheck(): Promise<void> {
  const db = getSupabaseAdmin();
  if (!db) return;

  const dueBefore = new Date(Date.now() - RECEIPT_DELAY_MS).toISOString();
  const { data, error } = await db
    .from("admin_push_tickets")
    .select("id,device_id,notification_id,attempt,created_at")
    .lt("created_at", dueBefore)
    .order("created_at", { ascending: true })
    .limit(MAX_RECEIPTS_PER_REQUEST);
  if (error) {
    log("reading tickets failed", error.message);
    return;
  }
  const tickets = (data ?? []) as TicketRow[];

  if (tickets.length > 0) {
    let receipts: Awaited<ReturnType<typeof getExpoReceipts>>;
    try {
      receipts = await getExpoReceipts(tickets.map((t) => t.id));
    } catch (err) {
      log("reading receipts failed", err);
      return;
    }

    const expiredBefore = Date.now() - RECEIPT_EXPIRY_MS;
    const done: string[] = [];
    const deadDevices = new Set<string>();
    const errors = new Map<string, string>();
    const resend: TicketRow[] = [];
    for (const ticket of tickets) {
      const receipt = receipts[ticket.id];
      if (!receipt) {
        // Not ready yet, or gone for good after a day.
        if (Date.parse(ticket.created_at) < expiredBefore) done.push(ticket.id);
        continue;
      }
      done.push(ticket.id);
      const code = errorCodeOf(receipt);
      if (!code) continue;
      if (code === "DeviceNotRegistered") deadDevices.add(ticket.device_id);
      else if (code === "MessageTooBig" && ticket.attempt === 1) resend.push(ticket);
      else errors.set(ticket.device_id, code);
    }

    for (const part of chunks(done, URL_CHUNK)) {
      const { error: delError } = await db.from("admin_push_tickets").delete().in("id", part);
      if (delError) log("forgetting tickets failed", delError.message);
    }
    for (const id of errors.keys()) if (deadDevices.has(id)) errors.delete(id);
    await recordDelivery(db, { tickets: [], okDevices: [], deadDevices: [...deadDevices], errors });
    await resendShorter(db, resend.filter((t) => !deadDevices.has(t.device_id)));
  }

  // Phones that signed out offline keep their row; one not seen for 60 days is pruned.
  const staleBefore = new Date(Date.now() - DEVICE_STALE_MS).toISOString();
  const { error: pruneError } = await db.from("admin_devices").delete().lt("last_seen_at", staleBefore);
  if (pruneError) log("pruning stale phones failed", pruneError.message);
}

/** MessageTooBig from a receipt: send the same notification once more with a shorter body. */
async function resendShorter(db: SupabaseClient, tickets: readonly TicketRow[]): Promise<void> {
  if (tickets.length === 0) return;
  const deviceIds = [...new Set(tickets.map((t) => t.device_id))];
  const tokens = new Map<string, string>();
  for (const part of chunks(deviceIds, URL_CHUNK)) {
    const { data, error } = await db.from("admin_devices").select("id,token").in("id", part);
    if (error) {
      log("reading phones for a resend failed", error.message);
      return;
    }
    for (const d of (data ?? []) as { id: string; token: string }[]) tokens.set(d.id, d.token);
  }

  const byNotification = new Map<string, TicketRow[]>();
  for (const t of tickets) byNotification.set(t.notification_id, [...(byNotification.get(t.notification_id) ?? []), t]);

  for (const [notificationId, sent] of byNotification) {
    let group = sent;
    let build: (token: string) => ExpoMessage;
    if (notificationId === TEST_NOTIFICATION_ID) {
      build = testMessage;
    } else {
      const { data, error } = await db.from("admin_notifications").select(ROW_COLUMNS).eq("id", notificationId).maybeSingle();
      if (error || !data) continue;
      const row = data as NotificationRecord;
      // The first send was minutes ago: a role change, a pause or Quiet since then wins.
      const still = new Set((await recipientsFor(db, row)).map((d) => d.id));
      group = group.filter((t) => still.has(t.device_id));
      build = (token) => shortRowMessage(row, token);
    }
    const targets = group
      .map((t) => tokens.get(t.device_id))
      .map((token, i) => (token ? { deviceId: group[i].device_id, token, message: build(token) } : null))
      .filter((t): t is Target => t !== null);
    if (targets.length > 0) await deliver(db, notificationId, targets, 2);
  }
}
