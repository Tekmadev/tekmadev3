import { notifyAdmins } from "@/lib/admin-notify";
import { lookupContactByEmail, upsertContact, type CrmError, type CrmRateLimit, type GhlContact } from "@/lib/crm/client";
import type { CrmConfig } from "@/lib/crm/config";
import { readEmailDnd, type CrmDndState } from "@/lib/crm/dnd";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * The identity spine: one email key, one row, one contact id.
 *
 * Email is the identity because it is the only field both sides always have,
 * so it is normalised exactly once, here, and every other module asks this
 * file rather than lowercasing a string of its own. The SQL triggers normalise
 * with `lower(btrim(...))`; `emailKey` is the same function in TypeScript, and
 * a key that disagreed with the triggers' would quietly split one person into
 * two queues.
 *
 * public.crm_contacts deliberately has no foreign key to public.subscribers.
 * deleteSubscriberAction hard-deletes and public.subscriber_events cascades
 * with it, and this row has to OUTLIVE that: without it, a contact that
 * survived on their side recreates, on the next inbound event, someone who
 * asked to be forgotten. `erased_at` is the tombstone, and every writer here
 * refuses to touch a row that carries one.
 *
 * Nothing in this file throws. It is driven by the outbox worker, the inbound
 * webhook and the reconciler, where a thrown error takes down a whole pass
 * instead of failing one job, so every failure comes back as a value and every
 * supabase-js `error` is checked: that client reports a failed query in the
 * returned error and does not throw, which is the bug class this repo has
 * already been bitten by (see app/api/webhooks/cal/route.ts:126).
 */

/** The four states the mirror column accepts. Anything else reads as unknown. */
const DND_STATES: readonly CrmDndState[] = ["unknown", "inactive", "active", "permanent"];

const COLUMNS =
  "id, email_key, email, ghl_contact_id, ghl_location_id, ghl_dnd_email, ghl_dnd_code, ghl_dnd_at, ghl_tags, synced_at, reconciled_at, last_trace_id, erased_at, created_at, updated_at";

/**
 * A contact we refuse to push to, recorded in `last_trace_id` behind this
 * prefix.
 *
 * The spine has no column of its own for "do not touch this contact", and the
 * mismatch has to survive a redeploy or the next job simply corrupts the same
 * stranger again. `last_trace_id` is the diagnostics column the admin already
 * shows beside a contact, so the marker lands in front of the one person who
 * can resolve it, and it carries the foreign contact id that caused it. A
 * dedicated column would be cleaner and belongs in a later migration.
 */
const MISMATCH_PREFIX = "mismatch:";

/**
 * lower + btrim, the one identity function.
 *
 * `String.prototype.trim` removes every kind of whitespace while `btrim`
 * removes only spaces, so a stored address with a tab in it would key
 * differently on the two sides. Nothing we write can contain one (every
 * writer normalises an address first), and trimming more is the safer half of
 * the difference, so the wider version is the one that lives here.
 */
export function emailKey(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export type CrmContactRow = {
  id: string;
  email_key: string;
  email: string;
  ghl_contact_id: string | null;
  ghl_location_id: string | null;
  /** 'active' means DND is ON, that is suppressed. See lib/crm/dnd.ts. */
  ghl_dnd_email: CrmDndState;
  ghl_dnd_code: string | null;
  ghl_dnd_at: string | null;
  ghl_tags: string[];
  synced_at: string | null;
  reconciled_at: string | null;
  last_trace_id: string | null;
  erased_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * What a caller may write. `email_key` and `erased_at` are missing on purpose:
 * re-keying and erasure each have their own function because each has a rule
 * the generic writer cannot enforce.
 */
export type CrmContactPatch = {
  email?: string;
  ghl_contact_id?: string | null;
  ghl_location_id?: string | null;
  ghl_dnd_email?: CrmDndState;
  ghl_dnd_code?: string | null;
  ghl_dnd_at?: string | null;
  ghl_tags?: string[];
  synced_at?: string | null;
  reconciled_at?: string | null;
  last_trace_id?: string | null;
};

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

const dndState = (v: unknown): CrmDndState =>
  typeof v === "string" && (DND_STATES as readonly string[]).includes(v) ? (v as CrmDndState) : "unknown";

function toRow(raw: unknown): CrmContactRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id);
  const key = str(r.email_key);
  if (!id || !key) return null;
  return {
    id,
    email_key: key,
    email: str(r.email) ?? key,
    ghl_contact_id: str(r.ghl_contact_id),
    ghl_location_id: str(r.ghl_location_id),
    ghl_dnd_email: dndState(r.ghl_dnd_email),
    ghl_dnd_code: str(r.ghl_dnd_code),
    ghl_dnd_at: str(r.ghl_dnd_at),
    ghl_tags: Array.isArray(r.ghl_tags) ? r.ghl_tags.filter((t): t is string => typeof t === "string") : [],
    synced_at: str(r.synced_at),
    reconciled_at: str(r.reconciled_at),
    last_trace_id: str(r.last_trace_id),
    erased_at: str(r.erased_at),
    created_at: str(r.created_at) ?? "",
    updated_at: str(r.updated_at) ?? "",
  };
}

/**
 * The read every caller inside this module uses.
 *
 * It tells "no such row" apart from "we could not ask", which the public
 * `getCrmContact` cannot. The worker needs that distinction: a missing row
 * means create the spine and carry on, a failed read means retry the job
 * later, and collapsing the two would have a database blip look like a person
 * who has never been synced.
 */
async function readSpine(
  key: string,
): Promise<{ ok: true; row: CrmContactRow | null } | { ok: false; reason: "config" | "db" }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, reason: "config" };
  const { data, error } = await supabase.from("crm_contacts").select(COLUMNS).eq("email_key", key).maybeSingle();
  if (error) {
    console.error("[crm] contact read failed", error.message);
    return { ok: false, reason: "db" };
  }
  return { ok: true, row: toRow(data) };
}

/** The spine row for an address, or null when there is not one (or we could not ask). */
export async function getCrmContact(email: string): Promise<CrmContactRow | null> {
  const key = emailKey(email);
  if (!key) return null;
  const read = await readSpine(key);
  return read.ok ? read.row : null;
}

/**
 * The spine row that claims a CRM contact id.
 *
 * This is the whole point of storing the id: an inbound ContactDndUpdate
 * carries `id` and `locationId` and no email at all, so without this lookup a
 * DND event could not be attached to anyone.
 */
export async function getCrmContactByGhlId(ghlContactId: string): Promise<CrmContactRow | null> {
  const id = (ghlContactId ?? "").trim();
  if (!id) return null;
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase.from("crm_contacts").select(COLUMNS).eq("ghl_contact_id", id).maybeSingle();
  if (error) {
    console.error("[crm] contact read by id failed", error.message);
    return null;
  }
  return toRow(data);
}

/**
 * Create the spine row if it is not there, and hand it back either way.
 *
 * public.crm_enqueue already does this inside the writer's transaction, so the
 * common path never needs it. It exists for the contacts that arrive the other
 * way: someone the owner typed into the CRM by hand, whose first appearance
 * here is a webhook. `email` keeps whatever casing we were given, while
 * `email_key` is the identity, so the admin can show the address as it is held
 * without ever matching on it.
 */
export async function ensureCrmContact(email: string, display?: string | null): Promise<CrmContactRow | null> {
  const key = emailKey(email);
  if (!key) return null;
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const existing = await readSpine(key);
  if (!existing.ok) return null;
  if (existing.row) return existing.row;

  const { error } = await supabase
    .from("crm_contacts")
    .upsert({ email_key: key, email: (display ?? "").trim() || key }, { onConflict: "email_key", ignoreDuplicates: true });
  if (error) {
    console.error("[crm] contact insert failed", error.message);
    return null;
  }
  // Read it back rather than trusting the insert: with ignoreDuplicates a
  // concurrent writer's row is the one that exists, and its erased_at is the
  // answer that matters to the caller.
  const created = await readSpine(key);
  return created.ok ? created.row : null;
}

/**
 * The one writer. Every patch stamps updated_at in the same statement, because
 * set_updated_at() exists in this database but is attached to nothing on these
 * tables, and it refuses an erased row: a tombstone is final, and a write that
 * slipped past it would put a forgotten person back into circulation.
 *
 * `rows` is how many rows the filter actually matched. supabase-js reports no
 * error when an UPDATE matches nothing, so without counting, "the row is
 * erased" and "the row was written" are the same answer.
 */
async function writePatch(
  key: string,
  values: Record<string, unknown>,
): Promise<{ ok: boolean; rows: number; duplicate: boolean }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, rows: 0, duplicate: false };
  const { data, error } = await supabase
    .from("crm_contacts")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("email_key", key)
    .is("erased_at", null)
    .select("id");
  if (error) {
    console.error("[crm] contact write failed", error.message);
    // 23505 is unique_violation. The stable SQLSTATE first, the message only
    // as a fallback, the same way addSubscriber reads an insert race.
    return { ok: false, rows: 0, duplicate: error.code === "23505" || /duplicate key|unique/i.test(error.message) };
  }
  return { ok: true, rows: (data ?? []).length, duplicate: false };
}

/** A plain field write. Returns false when the write failed or the row is erased. */
export async function updateCrmContact(email: string, patch: CrmContactPatch): Promise<boolean> {
  const key = emailKey(email);
  if (!key) return false;
  const values: Record<string, unknown> = { ...patch };
  if (Object.keys(values).length === 0) return true;
  const res = await writePatch(key, values);
  return res.ok && res.rows > 0;
}

/** Has this contact been ruled out of every future push. See MISMATCH_PREFIX. */
export function isCrmContactBlocked(row: Pick<CrmContactRow, "last_trace_id">): boolean {
  return (row.last_trace_id ?? "").startsWith(MISMATCH_PREFIX);
}

/**
 * The sub-account handed back somebody else.
 *
 * A contact upsert matches on more than the address: with phone-number
 * matching on, sending an email plus a phone can return an existing contact
 * whose email belongs to a different person. Storing that id would point this
 * address at a stranger, and the next dnd.set would suppress the stranger
 * instead. So the id is never stored, the spine is marked, and the owner is
 * told once per address. Fail loud rather than corrupt a stranger's consent
 * state.
 */
async function markCrmContactMismatch(key: string, contact: GhlContact): Promise<void> {
  // The marker needs a row to live on, and there may not be one: crm_enqueue
  // creates the spine inside the writer's transaction, but a contact that
  // arrived from their side, or a resolution for an address we have never
  // queued, gets here first. Without this the block is written to nothing, and
  // the next job makes the same call and corrupts the same stranger again.
  await ensureCrmContact(key);
  const res = await writePatch(key, {
    // Never store the foreign id. The column is unique, so storing it would
    // also stop the real owner of that contact from ever claiming it.
    ghl_contact_id: null,
    synced_at: null,
    ghl_dnd_email: "unknown",
    ghl_dnd_code: null,
    last_trace_id: `${MISMATCH_PREFIX}${contact.id}`,
  });
  if (!res.ok || res.rows === 0) {
    // Worth a line: the block did not persist, so the next pass will make the
    // same call and hit the same stranger. The notification below still goes out.
    console.error("[crm] could not record a contact mismatch, rows:", res.rows);
  }
  await notifyAdmins({
    event: "crm.contact_mismatch",
    title: `CRM returned a different contact for ${key}`,
    body: `We asked for ${key} and the CRM answered with contact ${contact.id}, whose address is ${
      contact.email ?? "empty"
    }. That is what phone-number matching does when a contact shares a number. Nothing more is pushed for this address, so a stranger's consent state cannot be changed by us.`,
    url: "/admin/crm",
    needsAction: true,
    entity: { type: "crm_contact", id: key },
    dedupeKey: `crm_mismatch:${key}`,
    data: { email_key: key, ghl_contact_id: contact.id, ghl_email: contact.email },
  });
}

/**
 * Is this contact the one we asked for. Call it after every upsert, and after
 * anything else that hands back a contact we are about to write state onto.
 *
 * On a mismatch it blocks the spine, raises crm.contact_mismatch and returns
 * false; the caller must then stop, not retry.
 */
export async function confirmContactIdentity(email: string, contact: GhlContact): Promise<boolean> {
  const key = emailKey(email);
  if (!key) return false;
  if (emailKey(contact.email) === key) return true;
  await markCrmContactMismatch(key, contact);
  return false;
}

/**
 * What we last knew their side to hold.
 *
 * Two rules, both of them things a plain field copy gets wrong:
 *
 *  - A state is never downgraded to 'unknown'. A contact nobody has ever
 *    suppressed comes back with no email channel in `dndSettings` at all, and
 *    writing that over a known 'active' would make the worker re-push a
 *    suppression it had already applied. When the channel is absent the global
 *    `dnd` boolean answers instead, since it is unambiguous.
 *  - ghl_dnd_at moves only when the state actually changed, because the column
 *    means "occurred-at of the newest applied change" and the inbound
 *    staleness rule compares against it. Advancing it on a re-read of the same
 *    state would make a genuinely newer delivery look old.
 *
 * The DND conflict tripwire fires from here, so every path that records a
 * snapshot trips it: if the polarity were ever backwards, a DND-ON contact
 * would read as contactable and we would quietly leave someone who opted out
 * marked as mailable. Corroborating against the global boolean turns that
 * silent failure into an alert.
 */
export async function recordCrmContactSnapshot(
  email: string,
  contact: GhlContact,
  opts?: {
    /** Set synced_at: we pushed our state and their side accepted it. */
    synced?: boolean;
    /** Set reconciled_at: the nightly pass has now checked this contact. */
    reconciled?: boolean;
    traceId?: string | null;
    /** Their timestamp for the change, when the caller has one. */
    occurredAt?: string | null;
  },
): Promise<{ ok: boolean; conflict: boolean }> {
  const key = emailKey(email);
  if (!key) return { ok: false, conflict: false };

  const row = await ensureCrmContact(key, contact.email);
  if (!row) return { ok: false, conflict: false };
  if (row.erased_at || isCrmContactBlocked(row)) return { ok: false, conflict: false };

  const read = readEmailDnd(contact.dndSettings, contact.dnd);
  const state: CrmDndState =
    read.state !== "unknown" ? read.state : typeof contact.dnd === "boolean" ? (contact.dnd ? "active" : "inactive") : "unknown";

  const values: Record<string, unknown> = {
    ghl_contact_id: contact.id,
    ghl_location_id: contact.locationId ?? row.ghl_location_id,
    ghl_tags: contact.tags,
  };
  if (state !== "unknown") {
    values.ghl_dnd_email = state;
    values.ghl_dnd_code = read.code;
    if (state !== row.ghl_dnd_email) values.ghl_dnd_at = opts?.occurredAt ?? new Date().toISOString();
  }
  if (opts?.synced) values.synced_at = new Date().toISOString();
  if (opts?.reconciled) values.reconciled_at = new Date().toISOString();
  if (opts?.traceId) values.last_trace_id = opts.traceId;

  let res = await writePatch(key, values);
  if (res.duplicate) {
    // ghl_contact_id is unique, so this is two email keys claiming one CRM
    // contact, which is what a merge on their side looks like. Record
    // everything else rather than losing the whole mirror over the id, and say
    // so: the ContactUpdate handler is what re-keys the spine properly.
    const { ghl_contact_id: claimed, ...rest } = values;
    console.error("[crm] contact", claimed, "is already claimed by another email key; recording the rest of the mirror");
    res = await writePatch(key, rest);
  }

  if (read.conflict) {
    await notifyAdmins({
      event: "crm.dnd_conflict",
      title: `Consent records disagree for ${key}`,
      body: `The CRM reports the email channel as "${read.state}" while its own do-not-disturb switch says ${String(
        contact.dnd,
      )}. Those cannot both be true, so nothing has been changed on our side. Check the contact in the CRM before the next sync runs.`,
      url: "/admin/crm",
      needsAction: true,
      entity: { type: "crm_contact", id: key },
      dedupeKey: `crm_conflict:${key}`,
      data: { email_key: key, ghl_contact_id: contact.id, email_channel: read.state, global_dnd: contact.dnd },
    });
  }

  return { ok: res.ok && res.rows > 0, conflict: read.conflict };
}

/**
 * Record the mirror from a delivery that carried only DND settings.
 *
 * The inbound handler calls this BEFORE it writes subscribers.status, which is
 * what closes the feedback loop: by the time the worker picks up the echo job
 * the mirror already says their side holds 'active', the desired state
 * matches, and the job completes as a noop with no API call at all.
 *
 * Staleness is not decided here. A delivery older than ghl_dnd_at is the
 * inbound handler's business, because only it can mark the inbox row 'stale'.
 */
export async function setCrmContactDndMirror(
  email: string,
  input: {
    state: CrmDndState;
    code?: string | null;
    occurredAt?: string | null;
    ghlContactId?: string | null;
    ghlLocationId?: string | null;
  },
): Promise<boolean> {
  const key = emailKey(email);
  if (!key) return false;

  const read = await readSpine(key);
  if (!read.ok) return false;
  const row = read.row;
  if (!row || row.erased_at || isCrmContactBlocked(row)) return false;

  const values: Record<string, unknown> = {};
  if (input.state !== "unknown") {
    values.ghl_dnd_email = input.state;
    values.ghl_dnd_code = input.code ?? null;
    if (input.state !== row.ghl_dnd_email) values.ghl_dnd_at = input.occurredAt ?? new Date().toISOString();
  }
  // Only ever fills a gap. Re-pointing an existing id is a re-key, and that is
  // rekeyCrmContact's job, where the unique constraint is handled.
  if (input.ghlContactId && !row.ghl_contact_id) values.ghl_contact_id = input.ghlContactId;
  if (input.ghlLocationId && !row.ghl_location_id) values.ghl_location_id = input.ghlLocationId;
  if (Object.keys(values).length === 0) return true;

  const res = await writePatch(key, values);
  return res.ok && res.rows > 0;
}

/**
 * The tombstone.
 *
 * Set when someone asks to be forgotten, before the subscriber row is deleted.
 * public.crm_enqueue checks it and refuses to queue anything for the address
 * afterwards, and every writer above refuses too, so the only thing that can
 * still happen is the contact.erase job that was queued at the same moment.
 */
export async function markCrmContactErased(email: string): Promise<boolean> {
  const key = emailKey(email);
  if (!key) return false;
  const row = await ensureCrmContact(key);
  if (!row) return false;
  if (row.erased_at) return true;
  const res = await writePatch(key, { erased_at: new Date().toISOString() });
  return res.ok && res.rows > 0;
}

/**
 * Their side changed the address on a contact we hold.
 *
 * We can only do this because the spine stores their contact id, which is the
 * whole argument for storing it. The subscriber's own email is never touched:
 * consent was given for the address the person typed, and a third party
 * editing a field is not the person changing their mind.
 *
 * A collision means we already have a spine row for the new address, so the
 * two cannot be merged without deciding whose consent record wins. The old row
 * gives up its claim on the contact id instead, which leaves the new row free
 * to resolve the contact for itself on its next job.
 */
export async function rekeyCrmContact(
  oldKey: string,
  newEmail: string,
): Promise<
  | { ok: true; changed: boolean; collision: boolean }
  | { ok: false; reason: "invalid" | "config" | "db" | "notfound" | "erased" }
> {
  const from = emailKey(oldKey);
  const to = emailKey(newEmail);
  if (!from || !to) return { ok: false, reason: "invalid" };
  if (from === to) return { ok: true, changed: false, collision: false };

  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, reason: "config" };

  const read = await readSpine(from);
  if (!read.ok) return { ok: false, reason: "db" };
  if (!read.row) return { ok: false, reason: "notfound" };
  if (read.row.erased_at) return { ok: false, reason: "erased" };

  const { data, error } = await supabase
    .from("crm_contacts")
    .update({ email_key: to, email: (newEmail ?? "").trim() || to, updated_at: new Date().toISOString() })
    .eq("email_key", from)
    .is("erased_at", null)
    .select("id");
  if (!error) return { ok: true, changed: (data ?? []).length > 0, collision: false };

  if (error.code !== "23505" && !/duplicate key|unique/i.test(error.message)) {
    console.error("[crm] contact re-key failed", error.message);
    return { ok: false, reason: "db" };
  }

  const released = await writePatch(from, { ghl_contact_id: null, synced_at: null });
  console.error("[crm] re-key collided with an existing spine row; the old key released its contact id");
  return released.ok ? { ok: true, changed: false, collision: true } : { ok: false, reason: "db" };
}

/**
 * The reconciler's cursor: never-checked first, then oldest checked.
 *
 * Erased rows are excluded, which is also what keeps the cursor moving: a
 * tombstoned row can never be stamped as reconciled, so returning one would
 * hand the same row back on every pass for good.
 */
export async function listCrmContactsToReconcile(limit: number): Promise<CrmContactRow[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("crm_contacts")
    .select(COLUMNS)
    .is("erased_at", null)
    .order("reconciled_at", { ascending: true, nullsFirst: true })
    .limit(Math.max(1, Math.min(limit, 500)));
  if (error) {
    console.error("[crm] reconcile cursor read failed", error.message);
    return [];
  }
  return (data ?? []).map(toRow).filter((r): r is CrmContactRow => r !== null);
}

/**
 * Stamp a contact as checked. Always call it, including when nothing was
 * wrong: the cursor is this column, so a contact that is fine and never
 * stamped is the only contact the reconciler will ever look at again.
 */
export async function markCrmContactReconciled(email: string): Promise<boolean> {
  const key = emailKey(email);
  if (!key) return false;
  const res = await writePatch(key, { reconciled_at: new Date().toISOString() });
  return res.ok && res.rows > 0;
}

/** Why a resolution could not produce a contact id. `api` is the only retryable one. */
export type CrmResolveReason = "invalid" | "config" | "db" | "erased" | "blocked" | "mismatch" | "api";

export type CrmResolution =
  | {
      ok: true;
      contactId: string;
      /** Present when we called out for it, null when it came from the spine. */
      contact: GhlContact | null;
      /** The upsert created a contact rather than matching one. */
      created: boolean;
      apiCalls: number;
      rateLimit: CrmRateLimit | null;
    }
  | {
      ok: false;
      reason: CrmResolveReason;
      message: string;
      apiCalls: number;
      /** Only on reason "api". Classify retry versus dead from error.code. */
      error?: CrmError;
    };

/**
 * The contact id for an address: the spine, else a lookup, else an upsert.
 *
 * Every handler calls this for itself rather than depending on an earlier job
 * having run. That costs one extra call in the rare cold case and buys a queue
 * with no dependency graph, no depends_on column and no ordering questions
 * between job kinds. Against one sub-account and a budget of 100 requests per
 * 10 seconds, it is not a trade worth thinking about twice.
 *
 * A lookup that answers with a different address is discarded rather than
 * treated as a mismatch: that endpoint also matches a contact's secondary
 * addresses, so the honest next step is to ask the upsert, which matches on
 * the address we care about. It is the upsert's answer that gets the mismatch
 * guard, because that is where phone-number matching hands back a stranger.
 */
export async function resolveCrmContactId(cfg: CrmConfig, email: string): Promise<CrmResolution> {
  let apiCalls = 0;
  const key = emailKey(email);
  if (!key) return { ok: false, reason: "invalid", message: "resolution needs an email address", apiCalls };

  const read = await readSpine(key);
  if (!read.ok) {
    return { ok: false, reason: read.reason, message: "could not read the contact spine", apiCalls };
  }
  const row = read.row;
  if (row?.erased_at) {
    return { ok: false, reason: "erased", message: "this address asked to be forgotten", apiCalls };
  }
  if (row && isCrmContactBlocked(row)) {
    return { ok: false, reason: "blocked", message: `pushes are stopped: ${row.last_trace_id}`, apiCalls };
  }
  if (row?.ghl_contact_id) {
    return { ok: true, contactId: row.ghl_contact_id, contact: null, created: false, apiCalls, rateLimit: null };
  }

  const found = await lookupContactByEmail(cfg, key);
  apiCalls += 1;
  if (!found.ok) {
    return { ok: false, reason: "api", message: found.error.message, apiCalls, error: found.error };
  }
  if (found.data && emailKey(found.data.email) === key) {
    await recordCrmContactSnapshot(key, found.data);
    return { ok: true, contactId: found.data.id, contact: found.data, created: false, apiCalls, rateLimit: found.rateLimit };
  }
  if (found.data) {
    // No address in the log line: these end up in Vercel's logs, and an
    // address there is a disclosure the contact id makes unnecessary.
    console.error("[crm] lookup answered with contact", found.data.id, "for a different address; asking the upsert instead");
  }

  const made = await upsertContact(cfg, { email: key });
  apiCalls += 1;
  if (!made.ok) {
    return { ok: false, reason: "api", message: made.error.message, apiCalls, error: made.error };
  }
  if (!(await confirmContactIdentity(key, made.data.contact))) {
    return {
      ok: false,
      reason: "mismatch",
      message: `the CRM answered with contact ${made.data.contact.id}, which is not this address`,
      apiCalls,
    };
  }
  await recordCrmContactSnapshot(key, made.data.contact, { traceId: made.data.traceId });
  return {
    ok: true,
    contactId: made.data.contact.id,
    contact: made.data.contact,
    created: made.data.isNew,
    apiCalls,
    rateLimit: made.rateLimit,
  };
}
