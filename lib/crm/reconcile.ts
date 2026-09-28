import { getSupabaseAdmin } from "@/lib/supabase";
import { dayKey, notifyAdmins } from "@/lib/admin-notify";
import { crmGate, readCrmSetting, setCrmSync, type CrmConfig } from "@/lib/crm/config";
import { lookupContactByEmail, type CrmRateLimit, type GhlContact } from "@/lib/crm/client";
import { readEmailDnd, type CrmDndState } from "@/lib/crm/dnd";
import { CRM_TAGS } from "@/lib/crm/tags";
import { setSubscriberStatus, type SubscriberStatus } from "@/lib/subscribers-data";

/**
 * The backstop that makes the compliance claim true rather than intended.
 *
 * Everything else in this integration is best-effort by design. The enqueue
 * triggers end in `exception when others then raise warning`, because an
 * outbox row must never be the reason a signup or an unsubscribe fails, which
 * means an enqueue CAN be swallowed. Webhook delivery can be paused by the CRM
 * or simply missed. A missed ContactDndUpdate is not a stale row: it is us
 * mailing someone who told a third party to stop, which is a legal failure.
 *
 * So once a day this job reads the CRM's own state for every contact we know
 * about and makes our record agree with it in the safe direction. It is the
 * reason the rest of the design is allowed to swallow anything.
 *
 * Three properties matter more than throughput:
 *
 *  1. It resumes. The cursor is `crm_contacts` ordered by `reconciled_at asc
 *     nulls first`, so a pass that runs out of its Vercel budget picks up
 *     where it stopped instead of re-checking the same head of the list every
 *     night and never reaching the tail.
 *  2. It only ever raises suppression. Suppression is monotone (see the
 *     conflict rules in section 10.3): if either side says suppressed, the
 *     person is suppressed. A CRM contact that reads as mailable while our
 *     record says unsubscribed is NEVER flipped back here, because
 *     `ContactDndUpdate` cannot say who cleared the flag and only a person
 *     acting on our own surface creates consent. It raises an alert instead.
 *  3. It cannot suppress the whole list. Because point 2 makes suppression
 *     one-way and unattended, a mistake in one of the owner's CRM workflows
 *     would otherwise walk quietly down the audience and empty it. The valve
 *     below stops the pass instead.
 */

/** Both crons run with `maxDuration = 60`, so the pass gives itself ten seconds of headroom. */
const DEFAULT_BUDGET_MS = 50_000;

/**
 * At eight requests a second a 50 second budget cannot check more than about
 * 400 contacts anyway. The cap is here so the row fetch is bounded rather than
 * pulling a table that has grown past what the pass could ever walk.
 */
const DEFAULT_MAX_CONTACTS = 400;

/** Eight requests a second. The sub-account's burst budget is 100 per 10 seconds. */
const MIN_REQUEST_GAP_MS = 125;

/**
 * How few burst requests may be left before the pacer waits out the whole
 * interval. The docs call the rate limit headers authoritative, so the pace is
 * read from them rather than counted here.
 */
const BURST_HEADROOM = 5;

/** A single wait is capped so a misread header cannot park the pass for minutes. */
const MAX_PACE_WAIT_MS = 12_000;

/**
 * The valve. A pass may suppress at most this share of the active list, with a
 * floor so a five-person list is not permanently blocked by its own size.
 * Overridable through `site_settings.crm_reconcile.suppressionShare`; no
 * migration seeds that row, so an absent one means the default.
 */
const DEFAULT_SUPPRESSION_SHARE = 0.2;
const SUPPRESSION_FLOOR = 5;

/** `.in()` list size, for the one subscriber read that covers a whole page of contacts. */
const IN_CHUNK = 200;

/** Rows read per source by a backfill, and the ceiling on what a caller may ask for. */
const DEFAULT_BACKFILL_LIMIT = 500;
const MAX_BACKFILL_LIMIT = 5_000;

type Db = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

export type CrmSyncJob = "outbox" | "inbox" | "reconcile" | "backfill" | "probe";

/** A row of `public.crm_sync_runs`, which mirrors `ad_sync_runs`. */
export type CrmSyncRun = {
  id: string;
  job: CrmSyncJob;
  trigger: "cron" | "manual" | "inline";
  started_at: string;
  finished_at: string | null;
  status: "running" | "ok" | "partial" | "error";
  claimed: number;
  done: number;
  noop: number;
  failed: number;
  dead: number;
  corrected: number;
  api_calls: number;
  error: string | null;
};

export type CrmReconcileResult =
  | { ok: true; checked: number; corrected: number; apiCalls: number; halted: boolean }
  | { ok: false; error: string };

export type CrmBackfillResult = { ok: true; queued: number } | { ok: false; error: string };

const RUN_COLUMNS =
  "id,job,trigger,started_at,finished_at,status,claimed,done,noop,failed,dead,corrected,api_calls,error";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const emailKeyOf = (raw: unknown): string => (typeof raw === "string" ? raw.trim().toLowerCase() : "");

/**
 * Open a `crm_sync_runs` row and hand back the closure that closes it, the
 * pattern `syncMetaInsights` uses at lib/meta-ads.ts:160. A pass that cannot
 * record its run still runs: `finish` becomes a no-op rather than a throw, so
 * an unwritable log never stops a compliance job.
 */
async function openRun(
  db: Db,
  job: CrmSyncJob,
  trigger: "cron" | "manual" | "inline",
): Promise<(patch: Record<string, unknown>) => Promise<void>> {
  const { data, error } = await db.from("crm_sync_runs").insert({ job, trigger }).select("id").maybeSingle();
  if (error) console.error("[crm] could not open the run log", error.message);
  const id = data?.id ? String(data.id) : null;
  return async (patch: Record<string, unknown>) => {
    if (!id) return;
    const { error: closeError } = await db
      .from("crm_sync_runs")
      .update({ finished_at: new Date().toISOString(), ...patch })
      .eq("id", id);
    if (closeError) console.error("[crm] could not close the run log", closeError.message);
  };
}

/**
 * Hand a job to the outbox through the same SQL function the triggers call, so
 * a repair queued here is indistinguishable from one the trigger queued: same
 * idempotency keys, same erasure refusal, same priority rule. Nothing in this
 * module calls the CRM's write endpoints itself.
 */
async function enqueue(
  db: Db,
  kind: "contact.upsert" | "dnd.set" | "tags.add" | "tags.remove" | "contact.erase",
  idemKey: string,
  emailKey: string,
  subjectType: "subscriber" | "lead" | "lead_magnet_submission" | "client" | "admin",
  subjectId: string | null,
  payload: Record<string, unknown> = {},
): Promise<boolean> {
  const { error } = await db.rpc("crm_enqueue", {
    p_kind: kind,
    p_idem_key: idemKey,
    p_email_key: emailKey,
    p_subject_type: subjectType,
    p_subject_id: subjectId,
    p_payload: payload,
  });
  if (error) {
    console.error("[crm] enqueue failed", kind, error.message);
    return false;
  }
  return true;
}

/** Every crm_* table is application-maintained: nothing attaches set_updated_at to them. */
async function writeMirror(db: Db, id: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await db
    .from("crm_contacts")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) console.error("[crm] could not update the contact mirror", error.message);
}

/** Element-wise after a sort, so no separator has to be assumed safe inside a tag name. */
const sameTags = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return false;
  const ours = [...a].sort();
  const theirs = [...b].sort();
  return ours.every((tag, i) => tag === theirs[i]);
};

/**
 * The share of the active list a single pass may suppress.
 *
 * Read defensively and clamped: a hand-edited row that says 5 (meaning
 * percent) or "lots" must make the valve tighter or leave it alone, never
 * widen it, because the whole point of the number is to be the thing that
 * stops an unattended job.
 */
async function suppressionShare(): Promise<number> {
  const raw = await readCrmSetting<{ suppressionShare?: unknown }>("crm_reconcile", {});
  const v = raw?.suppressionShare;
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0 || v > 1) return DEFAULT_SUPPRESSION_SHARE;
  return v;
}

type ContactRow = {
  id: string;
  email_key: string;
  ghl_contact_id: string | null;
  ghl_dnd_email: CrmDndState;
  ghl_dnd_code: string | null;
  ghl_tags: string[] | null;
};

type SubscriberFacts = { id: string; status: SubscriberStatus };

/** One read covers a whole page of contacts, on the plain index migration 1 adds. */
async function subscribersFor(db: Db, emailKeys: string[]): Promise<Map<string, SubscriberFacts>> {
  const out = new Map<string, SubscriberFacts>();
  for (let i = 0; i < emailKeys.length; i += IN_CHUNK) {
    const chunk = emailKeys.slice(i, i + IN_CHUNK);
    // Every writer normalizes before it stores, so an exact match on the
    // column finds the row; the expression index on lower(email) could not
    // serve this predicate, which is why migration 1 adds a plain one.
    const { data, error } = await db.from("subscribers").select("id,email,status").in("email", chunk);
    if (error) {
      console.error("[crm] could not read subscribers for reconciliation", error.message);
      continue;
    }
    for (const row of data ?? []) {
      const key = emailKeyOf(row.email);
      if (key) out.set(key, { id: String(row.id), status: row.status as SubscriberStatus });
    }
  }
  return out;
}

/** State of the pacer between calls. The CRM's own headers decide the pace. */
type Pace = { lastAt: number; limit: CrmRateLimit | null };

async function pace(state: Pace): Promise<void> {
  const elapsed = Date.now() - state.lastAt;
  let wait = elapsed >= MIN_REQUEST_GAP_MS ? 0 : MIN_REQUEST_GAP_MS - elapsed;
  const rl = state.limit;
  if (rl && rl.remaining != null && rl.remaining <= BURST_HEADROOM && rl.intervalMs) {
    wait = Math.max(wait, Math.min(rl.intervalMs, MAX_PACE_WAIT_MS));
  }
  if (wait > 0) await sleep(wait);
  state.lastAt = Date.now();
}

/**
 * Is this contact suppressed on the CRM's side.
 *
 * `conflict` is the tripwire from lib/crm/dnd.ts: the unambiguous global `dnd`
 * boolean disagreeing with the email channel. When they disagree we take the
 * suppressed reading, because one of the two says stop and stopping is the
 * only direction this job is allowed to move in. The alert still fires, so a
 * polarity change on their side is loud rather than silent.
 */
function crmSuppressed(state: CrmDndState, conflict: boolean): boolean {
  if (state === "active" || state === "permanent") return true;
  return conflict && state === "inactive";
}

/**
 * Walk the contact spine against the CRM and make our record agree with it in
 * the safe direction.
 *
 * `checked` counts contacts we actually got an answer about. `corrected`
 * counts suppressions we applied to `subscribers`, which is the number the
 * admin should read as "this job earned its keep tonight".
 */
export async function reconcileCrmContacts(opts: {
  trigger: "cron" | "manual";
  budgetMs?: number;
  maxContacts?: number;
}): Promise<CrmReconcileResult> {
  const startedAt = Date.now();
  const budgetMs = Math.max(1_000, opts.budgetMs ?? DEFAULT_BUDGET_MS);
  const maxContacts = Math.max(1, opts.maxContacts ?? DEFAULT_MAX_CONTACTS);

  const db = getSupabaseAdmin();
  if (!db) return { ok: false, error: "Supabase is not configured." };

  const gate = await crmGate("reconcile");
  if (!gate.ok) {
    // Switched off is the owner's decision and says nothing. Switched on
    // without credentials is worth one notification a day, because from the
    // admin the switch looks armed while nothing is being checked.
    if (gate.reason === "not_configured") {
      await notifyAdmins({
        event: "crm.not_configured",
        title: "CRM sync is on but not connected",
        body: "Reconciliation is switched on, but the CRM token or location id is missing, so consent records are not being checked against the CRM.",
        url: "/admin/crm",
        dedupeKey: dayKey("crm_not_configured"),
        collapse: true,
      });
    }
    // Not an error: the cron must answer 200 so a deliberately paused
    // integration does not look like a broken endpoint.
    return { ok: true, checked: 0, corrected: 0, apiCalls: 0, halted: false };
  }
  const cfg: CrmConfig = gate.cfg;

  const finish = await openRun(db, "reconcile", opts.trigger);

  try {
    // The valve's denominator: how many people we could still mail. Read
    // before anything is applied, so a pass cannot widen its own allowance by
    // suppressing people as it goes.
    const { count: activeCount, error: countError } = await db
      .from("subscribers")
      .select("id", { count: "exact", head: true })
      .eq("status", "active");
    if (countError) {
      // Without the denominator the valve cannot be enforced, and a pass that
      // applies CRM-side suppression with no valve is exactly the thing the
      // valve exists to prevent. So: refuse the pass.
      const message = `could not size the active list: ${countError.message}`;
      await finish({ status: "error", error: message.slice(0, 1000) });
      return { ok: false, error: message };
    }
    const active = activeCount ?? 0;
    const allowance = Math.max(SUPPRESSION_FLOOR, Math.floor((await suppressionShare()) * active));

    const { data: contacts, error: cursorError } = await db
      .from("crm_contacts")
      .select("id,email_key,ghl_contact_id,ghl_dnd_email,ghl_dnd_code,ghl_tags")
      // An erased contact is a tombstone. Reading it back from the CRM is how
      // a person who asked to be forgotten gets recreated, which is the exact
      // failure the spine exists to close.
      .is("erased_at", null)
      // Nulls first, so a contact nobody has ever checked is checked before
      // one that was checked last night.
      .order("reconciled_at", { ascending: true, nullsFirst: true })
      .limit(maxContacts);
    if (cursorError) {
      const message = `could not read the contact spine: ${cursorError.message}`;
      await finish({ status: "error", error: message.slice(0, 1000) });
      return { ok: false, error: message };
    }

    const rows = (contacts ?? []) as ContactRow[];
    const subscribers = await subscribersFor(db, rows.map((r) => emailKeyOf(r.email_key)).filter(Boolean));

    const pacer: Pace = { lastAt: 0, limit: null };
    let checked = 0;
    let noop = 0;
    let failed = 0;
    let corrected = 0;
    let apiCalls = 0;
    let suppressed = 0;
    let halted = false;
    let stopped = false;

    for (const row of rows) {
      if (Date.now() - startedAt >= budgetMs) {
        stopped = true;
        break;
      }

      const key = emailKeyOf(row.email_key);
      if (!key) {
        failed += 1;
        continue;
      }

      await pace(pacer);
      const found = await lookupContactByEmail(cfg, key);
      apiCalls += 1;

      if (!found.ok) {
        const code = found.error.code;
        if (code === "auth") {
          // A rotated or revoked token: every remaining lookup would fail the
          // same way. Flipping health is what makes crmGate refuse every
          // surface until the owner fixes it, rather than this job quietly
          // failing every night.
          await setCrmSync({ health: "auth_failed" }, "system");
          await notifyAdmins({
            event: "crm.auth_failed",
            title: "CRM token rejected",
            body: "Reconciliation stopped: the CRM refused our credentials, so consent records are no longer being checked. Re-issue the Private Integration Token and verify the connection.",
            url: "/admin/crm",
            needsAction: true,
            // A fixed entity so a passing Verify on /admin/crm can resolve the card.
            entity: { type: "crm", id: "connection" },
            dedupeKey: dayKey("crm_auth_failed"),
            collapse: true,
          });
          const message = `the CRM rejected our credentials: ${found.error.message}`;
          await finish({
            status: "error",
            claimed: rows.length,
            done: checked,
            noop,
            failed: failed + 1,
            corrected,
            api_calls: apiCalls,
            error: message.slice(0, 1000),
          });
          return { ok: false, error: message };
        }

        if (code === "rate_limit_daily") {
          // Retrying burns tomorrow's quota. Stop and let the next run walk
          // on from this cursor position.
          await notifyAdmins({
            event: "crm.rate_limited",
            title: "CRM daily quota reached",
            body: `Reconciliation stopped after ${checked} contacts because the CRM's daily request quota is spent. It resumes on the next run.`,
            url: "/admin/crm",
            dedupeKey: dayKey("crm_rate_limited"),
            collapse: true,
          });
          failed += 1;
          stopped = true;
          break;
        }

        pacer.limit = null;
        if (code === "rate_limit_burst") {
          // The pace should make this unreachable. If it happens, wait it out
          // and leave the contact unstamped so the next pass takes it.
          await sleep(Math.min(found.error.retryAfterMs ?? 10_000, MAX_PACE_WAIT_MS));
          failed += 1;
          continue;
        }
        if (code === "bad_request" || code === "not_found") {
          // A per-contact defect that will not fix itself. Stamped anyway,
          // because leaving it unstamped keeps it at the head of the cursor
          // and starves every contact behind it.
          await writeMirror(db, row.id, { reconciled_at: new Date().toISOString() });
        }
        failed += 1;
        continue;
      }

      pacer.limit = found.rateLimit;
      const now = new Date().toISOString();
      const contact: GhlContact | null = found.data;

      // Not in the CRM at all. An unambiguous answer, which is why the client
      // returns a 404 as `data: null` rather than as an error.
      if (!contact) {
        checked += 1;
        if (row.ghl_contact_id) {
          const subject = subscribers.get(key);
          await enqueue(
            db,
            "contact.upsert",
            `contact.upsert:${key}`,
            key,
            subject ? "subscriber" : "admin",
            subject?.id ?? null,
          );
        }
        await writeMirror(db, row.id, {
          // The id we held points at nothing. Keeping it would send every
          // later job to a contact that no longer exists.
          ghl_contact_id: null,
          ghl_dnd_email: "unknown",
          ghl_dnd_code: null,
          ghl_tags: [],
          reconciled_at: now,
        });
        if (!row.ghl_contact_id) noop += 1;
        continue;
      }

      // The duplicate-search fallback can match on a phone number, so the
      // contact we got back is not always the one we asked about. Reading its
      // DND state as this person's would corrupt a stranger's consent record,
      // which is the one mistake worth refusing to guess about.
      if (emailKeyOf(contact.email) !== key) {
        await notifyAdmins({
          event: "crm.contact_mismatch",
          title: "CRM matched the wrong contact",
          body: `Looking up ${key} returned the contact for ${contact.email ?? "an address with no email"}. Nothing was applied. Check the sub-account's duplicate handling before arming anything further.`,
          url: "/admin/crm",
          needsAction: true,
          dedupeKey: `crm_mismatch:${key}`,
          data: { emailKey: key, returnedEmail: contact.email, ghlContactId: contact.id },
        });
        await writeMirror(db, row.id, { reconciled_at: now });
        failed += 1;
        continue;
      }

      checked += 1;
      const dnd = readEmailDnd(contact.dndSettings, contact.dnd);
      const theirTags = contact.tags;
      const mirrorMoved =
        row.ghl_contact_id !== contact.id ||
        row.ghl_dnd_email !== dnd.state ||
        (row.ghl_dnd_code ?? null) !== dnd.code ||
        !sameTags(row.ghl_tags ?? [], theirTags);

      const mirror: Record<string, unknown> = {
        ghl_contact_id: contact.id,
        ghl_location_id: contact.locationId ?? cfg.locationId,
        ghl_dnd_email: dnd.state,
        ghl_dnd_code: dnd.code,
        ghl_tags: theirTags,
        reconciled_at: now,
      };
      // Only on a real change, and only as "when we confirmed this". The
      // inbound handler compares a delivery's occurred_at against this, so
      // bumping it on every pass would mark ordinary deliveries stale.
      if (row.ghl_dnd_email !== dnd.state) mirror.ghl_dnd_at = now;

      if (dnd.conflict) {
        // The tripwire, not a finding. If the polarity were ever backwards a
        // DND-ON event would read as "contactable" and this job would quietly
        // do nothing, leaving someone who opted out marked mailable.
        await notifyAdmins({
          event: "crm.dnd_conflict",
          title: "Consent records disagree",
          body: `The CRM reports ${key} as ${dnd.state} on the email channel while its own do-not-disturb switch says ${contact.dnd === true ? "suppressed" : "contactable"}. Treated as suppressed. Re-run the connection check: this is what a change to their schema looks like.`,
          url: "/admin/crm",
          needsAction: true,
          dedupeKey: `crm_conflict:${key}`,
          data: { emailKey: key, emailChannel: dnd.state, globalDnd: contact.dnd },
        });
      }

      const subject = subscribers.get(key);
      const theirSuppression = crmSuppressed(dnd.state, dnd.conflict);

      // No subscribers row: a lead-only contact. There is no consent record
      // to correct, and absence of consent is not a suppression instruction.
      if (!subject) {
        await writeMirror(db, row.id, mirror);
        if (!mirrorMoved) noop += 1;
        continue;
      }

      if (theirSuppression && subject.status === "active") {
        if (suppressed >= allowance) {
          // THE VALVE. Suppression here is one-way and unattended, so a
          // mistake in one of the owner's workflows would otherwise walk down
          // the whole audience and empty it with no one watching. Record what
          // we saw, apply nothing more, and stop the pass.
          await writeMirror(db, row.id, mirror);
          halted = true;
          stopped = true;
          await notifyAdmins({
            event: "crm.mass_suppression_halted",
            title: "Bulk unsubscribe stopped",
            body: `Reconciliation suppressed ${suppressed} of ${active} active subscribers from the CRM and stopped before doing more. Nothing further was applied. Check the CRM for a workflow or an import that is marking contacts as do-not-disturb, then run it again.`,
            url: "/admin/crm",
            needsAction: true,
            dedupeKey: dayKey("crm_mass_suppression"),
            collapse: true,
            data: { applied: suppressed, allowance, activeSubscribers: active },
          });
          break;
        }

        // The missed-webhook case, and the entire reason this job exists.
        // Deliberately no `notNewerThan`: suppression is monotone, so a late
        // suppression is still honoured rather than dropped as stale.
        const applied = await setSubscriberStatus({
          match: { by: "email", email: key },
          status: "unsubscribed",
          source: "reconcile",
        });
        if (applied.ok && applied.changed) {
          suppressed += 1;
          corrected += 1;
        } else if (!applied.ok && (applied.reason === "db" || applied.reason === "config")) {
          // "refused" means the row is already bounced or complained and
          // "stale" means it moved under us; neither is a failure to retry.
          failed += 1;
        }
        await writeMirror(db, row.id, mirror);
        // The tag repair below is skipped on purpose. The status write just
        // fired the subscribers trigger, which queues the DND push and the
        // newsletter tag removal itself, and if outbound is switched off then
        // nothing should be pushed anyway. The next pass sees the tag still
        // present and repairs it.
        continue;
      }

      if (!theirSuppression && subject.status === "unsubscribed") {
        // The CRM says mailable, we say the person withdrew. Recorded, never
        // applied: ContactDndUpdate does not say whether a person, a workflow
        // or a staff member cleared the flag, and only the first is consent.
        // The owner confirms it on /admin/crm, which stamps a policy version.
        await notifyAdmins({
          event: "crm.resubscribe_requested",
          title: "Resubscribe needs confirming",
          body: `${key} is mailable in the CRM but unsubscribed here, so nothing was changed. Confirm it only if the person asked to come back: confirming records fresh consent against the current policy.`,
          url: "/admin/crm",
          needsAction: true,
          dedupeKey: `crm_resubscribe:${key}`,
          data: { emailKey: key, subscriberId: subject.id, crmState: dnd.state },
        });
        await writeMirror(db, row.id, mirror);
        continue;
      }

      // Tag drift, in the only direction that can be derived from state.
      // `tmd-newsletter` is the one state-derived tag: every other tag records
      // an event that happened and cannot be recomputed from a contact row.
      // Nothing else is ever added or removed here, so a tag one of the
      // owner's workflows applied is never touched.
      const hasNewsletter = theirTags.includes(CRM_TAGS.newsletter);
      if (subject.status === "active" && !hasNewsletter) {
        await enqueue(db, "tags.add", `tags.add:${key}:newsletter`, key, "subscriber", subject.id, {
          tag: "newsletter",
        });
      } else if (subject.status !== "active" && hasNewsletter) {
        await enqueue(db, "tags.remove", `tags.remove:${key}:newsletter`, key, "subscriber", subject.id, {
          tag: "newsletter",
        });
      } else if (!mirrorMoved) {
        noop += 1;
      }

      await writeMirror(db, row.id, mirror);
    }

    // "partial" is the honest status for a pass that stopped early, whether
    // the valve tripped, the budget ran out or the quota did. The next run
    // continues from the cursor.
    const status = failed > 0 || stopped || halted ? "partial" : "ok";
    await finish({
      status,
      claimed: rows.length,
      done: checked,
      noop,
      failed,
      corrected,
      api_calls: apiCalls,
      // The run log is the only durable record that the valve tripped, and the
      // admin reads it back by this exact prefix. Keep the prefix stable.
      ...(halted ? { error: `valve: stopped after ${corrected} unsubscribes, above the allowed share of the active list` } : {}),
    });
    return { ok: true, checked, corrected, apiCalls, halted };
  } catch (err) {
    // Nothing here is expected to throw: the CRM client never throws and
    // supabase-js reports failures in `error`. This exists so a run row is
    // never left open on 'running', which would read as a pass still in
    // flight and block the admin's own judgement about the queue.
    const message = err instanceof Error ? err.message : String(err);
    console.error("[crm] reconciliation threw", message);
    await finish({ status: "error", error: message.slice(0, 1000) });
    return { ok: false, error: message };
  }
}

/**
 * Queue the jobs the triggers never fired for.
 *
 * Driven from `subscribers` and `leads` directly, not from the outbox,
 * because it exists precisely for the rows that predate the triggers: those
 * rows have no outbox history to walk. The idempotency keys and subject rows
 * are byte-identical to what the triggers write, so a backfilled job is
 * indistinguishable from a live one and the two collapse on conflict instead
 * of racing.
 *
 * Idempotent but not free: `crm_enqueue` resets a finished job back to
 * pending, so running it twice costs the API calls twice. It is a button the
 * owner presses, not something on a schedule.
 */
export async function backfillCrmContacts(opts?: { limit?: number }): Promise<CrmBackfillResult> {
  const db = getSupabaseAdmin();
  if (!db) return { ok: false, error: "Supabase is not configured." };

  const limit = Math.min(Math.max(1, opts?.limit ?? DEFAULT_BACKFILL_LIMIT), MAX_BACKFILL_LIMIT);

  // Not gated on the outbound switch. This writes Postgres rows and makes no
  // API call, and queueing before arming is the intended order: fill the
  // queue, then arm, then drain. The switch still decides whether anything is
  // sent.
  const finish = await openRun(db, "backfill", "manual");

  try {
    const { data: subs, error: subError } = await db
      .from("subscribers")
      .select("id,email,status")
      .order("created_at", { ascending: true })
      .limit(limit);
    if (subError) {
      const message = `could not read subscribers: ${subError.message}`;
      await finish({ status: "error", error: message.slice(0, 1000) });
      return { ok: false, error: message };
    }

    const { data: leads, error: leadError } = await db
      .from("leads")
      .select("id,email,source,status,booking_uid")
      .not("email", "is", null)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (leadError) {
      const message = `could not read leads: ${leadError.message}`;
      await finish({ status: "error", error: message.slice(0, 1000) });
      return { ok: false, error: message };
    }

    const keys = new Set<string>();
    for (const row of subs ?? []) {
      const k = emailKeyOf(row.email);
      if (k) keys.add(k);
    }
    for (const row of leads ?? []) {
      const k = emailKeyOf(row.email);
      if (k) keys.add(k);
    }

    // `crm_enqueue` refuses an erased contact on its own. Asking first is what
    // keeps the queued count honest, so the admin is not told we queued work
    // that was silently dropped.
    const erased = new Set<string>();
    const all = [...keys];
    for (let i = 0; i < all.length; i += IN_CHUNK) {
      const { data, error } = await db
        .from("crm_contacts")
        .select("email_key")
        .not("erased_at", "is", null)
        .in("email_key", all.slice(i, i + IN_CHUNK));
      if (error) {
        const message = `could not read the contact spine: ${error.message}`;
        await finish({ status: "error", error: message.slice(0, 1000) });
        return { ok: false, error: message };
      }
      for (const row of data ?? []) {
        const k = emailKeyOf(row.email_key);
        if (k) erased.add(k);
      }
    }

    let queued = 0;
    let scanned = 0;
    let skipped = 0;
    const bump = (ok: boolean) => {
      if (ok) queued += 1;
    };

    // One profile job per person, not per row. `contact.upsert:<email_key>` is
    // a coalescing key, so a subscriber who is also three leads would queue
    // the same single row four times and report four jobs queued.
    const upserted = new Set<string>();
    const upsertOnce = async (
      key: string,
      subjectType: "subscriber" | "lead",
      subjectId: string,
    ): Promise<void> => {
      if (upserted.has(key)) return;
      upserted.add(key);
      bump(await enqueue(db, "contact.upsert", `contact.upsert:${key}`, key, subjectType, subjectId));
    };

    for (const row of subs ?? []) {
      const key = emailKeyOf(row.email);
      if (!key) continue;
      scanned += 1;
      if (erased.has(key)) {
        skipped += 1;
        continue;
      }
      const id = String(row.id);
      const status = row.status as SubscriberStatus;

      await upsertOnce(key, "subscriber", id);
      // Transition-scoped exactly as the trigger writes it, so the row the
      // trigger would have created and this one are the same row.
      bump(await enqueue(db, "dnd.set", `dnd.email:${key}:${status}`, key, "subscriber", id));
      if (status === "active") {
        bump(await enqueue(db, "tags.add", `tags.add:${key}:newsletter`, key, "subscriber", id, { tag: "newsletter" }));
      } else {
        bump(
          await enqueue(db, "tags.remove", `tags.remove:${key}:newsletter`, key, "subscriber", id, {
            tag: "newsletter",
          }),
        );
      }
    }

    for (const row of leads ?? []) {
      const key = emailKeyOf(row.email);
      if (!key) continue;
      scanned += 1;
      if (erased.has(key)) {
        skipped += 1;
        continue;
      }
      const id = String(row.id);
      // The event, not the row: a reschedule is its own job, the same scope
      // the trigger builds.
      const scope = (typeof row.booking_uid === "string" ? row.booking_uid.trim() : "") || id;
      const source = typeof row.source === "string" ? row.source : "";
      const status = typeof row.status === "string" ? row.status : "";

      await upsertOnce(key, "lead", id);

      // No DND job for a lead. Absence of consent is not a suppression
      // instruction, and writing "inactive" would assert a consent we do not
      // have. Only the subscribers leg touches DND.
      if (source === "cal_booking") {
        if (status === "booked" || status === "rescheduled") {
          bump(
            await enqueue(db, "tags.add", `tags.add:${key}:booked-call:${scope}`, key, "lead", id, {
              tag: "booked-call",
            }),
          );
        } else if (status === "cancelled") {
          bump(
            await enqueue(db, "tags.add", `tags.add:${key}:booking-cancelled:${scope}`, key, "lead", id, {
              tag: "booking-cancelled",
            }),
          );
          bump(
            await enqueue(db, "tags.remove", `tags.remove:${key}:booked-call:${scope}`, key, "lead", id, {
              tag: "booked-call",
            }),
          );
        }
      } else if (source === "lead_magnet") {
        bump(
          await enqueue(db, "tags.add", `tags.add:${key}:lead-magnet:${scope}`, key, "lead", id, {
            tag: "lead-magnet",
          }),
        );
      } else if (source === "portal_signup") {
        bump(
          await enqueue(db, "tags.add", `tags.add:${key}:portal-signup:${scope}`, key, "lead", id, {
            tag: "portal-signup",
          }),
        );
      }
    }

    // `claimed` is rows read, `done` is jobs queued, `noop` is rows skipped
    // because the person asked to be erased. No API call is made here, so
    // api_calls stays at zero and the outbox's own run rows carry the cost.
    await finish({ status: "ok", claimed: scanned, done: queued, noop: skipped, api_calls: 0 });
    return { ok: true, queued };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[crm] backfill threw", message);
    await finish({ status: "error", error: message.slice(0, 1000) });
    return { ok: false, error: message };
  }
}

/**
 * The most recent run, for the admin page's "last run" lines. Without a job
 * it returns the newest run of any kind.
 */
export async function getLastCrmRun(job?: CrmSyncJob): Promise<CrmSyncRun | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;
  const base = db.from("crm_sync_runs").select(RUN_COLUMNS);
  const scoped = job ? base.eq("job", job) : base;
  const { data, error } = await scoped.order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (error) {
    console.error("[crm] could not read the run log", error.message);
    return null;
  }
  return (data as CrmSyncRun | null) ?? null;
}
