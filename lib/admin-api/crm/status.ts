import { instant } from "@/lib/admin-api";
import { getSupabaseAdmin } from "@/lib/supabase";
import { business } from "@/config/site";
import type { CrmSwitchSurface } from "@/lib/crm/admin-ops";
import { getCrmQueueCounts, listCrmAttention, listCrmRuns, type CrmAttentionRow, type CrmQueueCounts } from "@/lib/crm/admin-data";
import {
  crmAppConfig,
  crmConfigured,
  getCrmAppInstall,
  getCrmProbeSetting,
  getCrmSyncSetting,
  type CrmAppInstall,
  type CrmProbeSetting,
  type CrmSyncSetting,
} from "@/lib/crm/config";
import { CRM_FIELDS, cachedFieldKeys, type CrmFieldKey } from "@/lib/crm/fields";
import { getLastCrmRun, type CrmSyncJob, type CrmSyncRun } from "@/lib/crm/reconcile";
import {
  APP_EXPLANATION,
  APP_KEYS_MISSING,
  HEALTH_EXPLANATION,
  INBOX_EVENT_LABEL,
  OUTBOX_KIND_LABEL,
  PROBE_SENTENCES,
  SWITCH_STOPPED,
  plural,
  scrubVendor,
  sentence,
  type CrmApiAppStatus,
  type CrmApiHealth,
  type CrmApiJob,
  type CrmApiRunBy,
  type CrmApiRunStatus,
} from "./copy";

/**
 * GET /crm in one read: the same facts the web admin's /admin/crm panels show
 * (components/admin/crm/*), from the same lib/crm readers, as the shapes in the
 * app's src/api/schemas/crm.ts. Those readers degrade to empty answers on a
 * failed read rather than throwing, exactly as the web page does.
 */

/* ------------------------------------------------------------------ */
/* Shapes                                                              */
/* ------------------------------------------------------------------ */

export type ApiProbeResult = { key: string; ok: boolean; sentence: string; detail?: string };
export type ApiCrmConnection = {
  configured: boolean;
  health: CrmApiHealth;
  explanation: string;
  probe: { checkedAt: string; results: ApiProbeResult[] } | null;
};
export type ApiCrmSwitch = { on: boolean; running: boolean; lastRunAt: string | null; error?: string };
export type ApiCrmSwitches = Record<CrmSwitchSurface, ApiCrmSwitch>;
export type ApiCrmApp = { status: CrmApiAppStatus; explanation: string; installUrl?: string };
export type ApiCrmQueueStat = { count: number; sub: string };
export type ApiCrmRun = { id: string; job: CrmApiJob; startedAt: string; by: CrmApiRunBy; result: string; status: CrmApiRunStatus };
export type ApiCrmLastReconcile = { at: string; checked: number; corrected: number; halted: boolean; haltReason?: string };
export type ApiCrmAttention = {
  id: string;
  queue: "outbox" | "inbox";
  what: string;
  direction: "to_crm" | "from_crm";
  who: string;
  tries: number;
  why: string;
  at: string;
  signed: boolean;
};
export type ApiCrmStatus = {
  connection: ApiCrmConnection;
  switches: ApiCrmSwitches;
  app: ApiCrmApp;
  mergeFields: { key: string; label: string }[];
  queue: { waitingToPush: ApiCrmQueueStat; pushed: ApiCrmQueueStat; waitingToApply: ApiCrmQueueStat; applied: ApiCrmQueueStat };
  runs: ApiCrmRun[];
  lastReconcile: ApiCrmLastReconcile | null;
  attention: ApiCrmAttention[];
};

const RUNS_SHOWN = 6;
const ATTENTION_SHOWN = 50;

/** Which run log job each switch drives. */
const SWITCH_JOB: Record<CrmSwitchSurface, CrmSyncJob> = { outbound: "outbox", inbound: "inbox", reconcile: "reconcile" };

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * An instant from a value that may not have come from Postgres (the probe's
 * own clock, the CRM's dateUpdated). Postgres strings keep their fraction via
 * instant(); anything else that parses becomes an ISO string.
 */
export function looseInstant(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const s = instant(value);
  if (s && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return s;
  const t = Date.parse(value);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function humanize(value: string): string {
  const s = value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_.-]+/g, " ").trim().toLowerCase();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : value;
}

/** "5 minutes", "3 hours", "2 days" since an instant, for a sub line. */
function waitedFor(iso: string | null): string | null {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return null;
  const mins = Math.max(0, Math.round((Date.now() - t) / 60_000));
  if (mins < 1) return "less than a minute";
  if (mins < 60) return plural(mins, "minute", "minutes");
  const hours = Math.round(mins / 60);
  if (hours < 48) return plural(hours, "hour", "hours");
  return plural(Math.round(hours / 24), "day", "days");
}

/* ------------------------------------------------------------------ */
/* Connection                                                          */
/* ------------------------------------------------------------------ */

export function healthOf(configured: boolean, setting: CrmSyncSetting): CrmApiHealth {
  if (!configured) return "not_connected";
  if (setting.health === "auth_failed") return "token_rejected";
  if (setting.health === "ok") return "verified";
  return "not_verified";
}

type StoredCheck = { name: string; ok: boolean; detail: string };

/** The checklist lib/crm/probe.ts stored, read defensively (the row is hand-editable). */
function storedChecks(value: unknown): StoredCheck[] {
  if (!Array.isArray(value)) return [];
  const out: StoredCheck[] = [];
  for (const c of value) {
    if (!c || typeof c !== "object") continue;
    const r = c as Record<string, unknown>;
    if (typeof r.name !== "string" || typeof r.ok !== "boolean") continue;
    out.push({ name: r.name, ok: r.ok, detail: typeof r.detail === "string" ? r.detail : "" });
  }
  return out;
}

function probeFrom(setting: CrmProbeSetting): ApiCrmConnection["probe"] {
  const checkedAt = looseInstant(setting.at);
  if (!checkedAt) return null;
  const results = storedChecks(setting.checks).map((c): ApiProbeResult => {
    const copy = PROBE_SENTENCES[c.name];
    const line = copy ? (c.ok ? copy.ok : copy.failed) : sentence(humanize(c.name));
    if (c.ok) return { key: c.name, ok: true, sentence: line };
    const detail = sentence(scrubVendor(c.detail), 400);
    return detail ? { key: c.name, ok: false, sentence: line, detail } : { key: c.name, ok: false, sentence: line };
  });
  return { checkedAt, results };
}

function connectionFrom(configured: boolean, setting: CrmSyncSetting, probe: CrmProbeSetting): ApiCrmConnection {
  const health = healthOf(configured, setting);
  return {
    configured,
    health,
    explanation: HEALTH_EXPLANATION[health],
    // Nothing to show for a connection that does not exist.
    probe: configured ? probeFrom(probe) : null,
  };
}

/** The Connection card, also what POST /crm/verify answers. */
export async function loadCrmConnection(): Promise<ApiCrmConnection> {
  const [setting, probe] = await Promise.all([getCrmSyncSetting(), getCrmProbeSetting()]);
  return connectionFrom(crmConfigured(), setting, probe);
}

/* ------------------------------------------------------------------ */
/* Switches                                                            */
/* ------------------------------------------------------------------ */

/**
 * Off, Running, or "On, not running" with why. A switch runs when it is on
 * and the connection is configured and verified: that is the gate every
 * worker passes (lib/crm/config.ts crmGate), so a failed Verify stops every
 * switch that is on until Verify passes again.
 */
function switchCard(on: boolean, configured: boolean, setting: CrmSyncSetting, lastRun: CrmSyncRun | null): ApiCrmSwitch {
  const running = on && configured && setting.health === "ok";
  const card: ApiCrmSwitch = { on, running, lastRunAt: lastRun ? instant(lastRun.started_at) : null };
  if (on && !running) {
    card.error = !configured
      ? SWITCH_STOPPED.notConfigured
      : setting.health === "auth_failed"
        ? SWITCH_STOPPED.tokenRejected
        : SWITCH_STOPPED.unverified;
  }
  return card;
}

function switchesFrom(configured: boolean, setting: CrmSyncSetting, last: Record<CrmSwitchSurface, CrmSyncRun | null>): ApiCrmSwitches {
  return {
    outbound: switchCard(setting.outbound, configured, setting, last.outbound),
    inbound: switchCard(setting.inbound, configured, setting, last.inbound),
    reconcile: switchCard(setting.reconcile, configured, setting, last.reconcile),
  };
}

/** One switch card, fresh, for PUT /crm/switches/:surface. */
export async function loadCrmSwitch(surface: CrmSwitchSurface): Promise<ApiCrmSwitch> {
  const [setting, lastRun] = await Promise.all([getCrmSyncSetting(), getLastCrmRun(SWITCH_JOB[surface])]);
  return switchCard(setting[surface], crmConfigured(), setting, lastRun);
}

/* ------------------------------------------------------------------ */
/* Webhook app and merge fields                                        */
/* ------------------------------------------------------------------ */

function appFrom(install: CrmAppInstall): ApiCrmApp {
  const status: CrmApiAppStatus = install.installedAt ? (install.ours ? "installed_here" : "installed_elsewhere") : "not_installed";
  const keysMissing = status !== "installed_here" && crmAppConfig() === null;
  return {
    status,
    explanation: APP_EXPLANATION[status] + (keysMissing ? APP_KEYS_MISSING : ""),
    // Installing is a browser flow that starts on the website's CRM page.
    installUrl: `${business.url}/admin/crm`,
  };
}

/**
 * All twelve fields this site fills in. The key is the one the CRM assigned
 * (as Verify last saw it, without the "contact." prefix) or, before Verify has
 * resolved it, the key we create the field with.
 */
function mergeFieldsFrom(assigned: Partial<Record<CrmFieldKey, string>>): { key: string; label: string }[] {
  return (Object.keys(CRM_FIELDS) as CrmFieldKey[]).map((k) => ({
    key: (assigned[k] ?? "").trim().replace(/^contact\./i, "") || CRM_FIELDS[k].key,
    label: CRM_FIELDS[k].name,
  }));
}

/* ------------------------------------------------------------------ */
/* Queue                                                               */
/* ------------------------------------------------------------------ */

/** The same four numbers as the web admin's Queue panel. */
function queueFrom(counts: CrmQueueCounts): ApiCrmStatus["queue"] {
  const o = counts.outbox;
  const i = counts.inbox;
  const n = (bag: Record<string, number>, key: string) => bag[key] ?? 0;

  const waiting = n(o, "pending") + n(o, "failed") + n(o, "sending");
  const waited = waitedFor(counts.oldestPendingAt);
  const noop = n(o, "noop");
  const inboundWaiting = n(i, "pending") + n(i, "failed") + n(i, "processing");
  const unmapped = n(i, "unmapped");

  return {
    waitingToPush: {
      count: waiting,
      sub: waiting === 0 ? "Nothing waiting" : waited ? `The oldest has waited ${waited}` : "Goes out on the next run",
    },
    pushed: { count: n(o, "done") + noop, sub: `${noop} ${noop === 1 ? "was" : "were"} already right` },
    waitingToApply: {
      count: inboundWaiting,
      sub:
        unmapped > 0
          ? `${unmapped} ${unmapped === 1 ? "needs" : "need"} a client mapped`
          : inboundWaiting > 0
            ? "Unsubscribes and appointments from the CRM"
            : "Nothing waiting",
    },
    applied: { count: n(i, "applied"), sub: `${n(i, "ignored")} ignored, ${n(i, "stale")} out of date` },
  };
}

/* ------------------------------------------------------------------ */
/* Runs and the last reconcile                                         */
/* ------------------------------------------------------------------ */

const RUN_JOB: Record<string, CrmApiJob> = { outbox: "push", inbox: "inbound", reconcile: "reconcile", backfill: "backfill", probe: "verify" };
const RUN_BY: Record<string, CrmApiRunBy> = { cron: "schedule", inline: "signup", manual: "you" };
const RUN_STATUS: Record<string, CrmApiRunStatus> = { ok: "ok", running: "running", partial: "partial", error: "error" };

/** lib/crm/reconcile.ts writes this exact prefix when the mass-suppression valve trips. */
const isHalted = (run: CrmSyncRun) => !!run.error?.startsWith("valve:");

function runResult(r: CrmSyncRun): string {
  if (r.status === "running") return "Running now.";
  let line: string;
  switch (r.job) {
    case "reconcile":
      line = isHalted(r)
        ? `Safety stop: checked ${plural(r.done, "contact", "contacts")} and corrected ${r.corrected}, then stopped before unsubscribing more.`
        : `Checked ${plural(r.done, "contact", "contacts")}, corrected ${r.corrected}.`;
      break;
    case "backfill":
      line = `Queued ${plural(r.done, "existing contact", "existing contacts")} for their first push.`;
      break;
    case "outbox": {
      if (r.claimed === 0 && r.done === 0 && r.noop === 0) {
        line = "Nothing was waiting to push.";
        break;
      }
      const parts = [`Pushed ${plural(r.done, "contact", "contacts")}`];
      if (r.noop) parts.push(`${r.noop} already right`);
      if (r.failed) parts.push(`${r.failed} will retry`);
      if (r.dead) parts.push(`${r.dead} stopped`);
      line = `${parts.join(", ")}.`;
      break;
    }
    case "inbox": {
      if (r.claimed === 0 && r.done === 0 && r.noop === 0) {
        line = "Nothing was waiting to apply.";
        break;
      }
      const parts = [`Applied ${plural(r.done, "change", "changes")} from the CRM`];
      if (r.noop) parts.push(`${r.noop} needed nothing`);
      if (r.failed) parts.push(`${r.failed} will retry`);
      if (r.dead) parts.push(`${r.dead} stopped`);
      line = `${parts.join(", ")}.`;
      break;
    }
    case "probe":
      line = r.failed ? `${r.failed} of ${r.done + r.failed} checks failed.` : `All ${r.done} checks passed.`;
      break;
    default:
      line = "Ran.";
  }
  if (r.error && !isHalted(r) && (r.status === "error" || r.status === "partial")) {
    line += ` ${sentence(scrubVendor(r.error), 200)}`;
  }
  return line;
}

function toRun(r: CrmSyncRun): ApiCrmRun {
  return {
    id: String(r.id),
    job: RUN_JOB[r.job] ?? "push",
    startedAt: instant(r.started_at),
    by: RUN_BY[r.trigger] ?? "schedule",
    result: runResult(r),
    status: RUN_STATUS[r.status] ?? "error",
  };
}

/**
 * The last Verify as a run. lib/crm/probe.ts keeps only its latest result (in
 * site_settings.crm_probe) and writes no crm_sync_runs row, so the run log
 * gets this one line built from it: always started by the owner ("you"),
 * ok when every check passed, error when none did (a rejected token fails
 * them all), part done otherwise. Nothing is written to the database.
 */
function verifyRunFrom(probe: CrmProbeSetting): ApiCrmRun | null {
  const startedAt = looseInstant(probe.at);
  if (!startedAt) return null;
  const checks = storedChecks(probe.checks);
  if (checks.length === 0) return null;
  const failed = checks.filter((c) => !c.ok).length;
  return {
    id: `verify:${startedAt}`,
    job: "verify",
    startedAt,
    by: "you",
    result:
      failed === 0
        ? `All ${checks.length} checks passed.`
        : failed === checks.length
          ? `None of the ${checks.length} checks passed.`
          : `${failed} of ${checks.length} checks failed.`,
    status: failed === 0 ? "ok" : failed === checks.length ? "error" : "partial",
  };
}

/** Newest first by start time, the verify line placed among the logged runs. */
function runLog(logged: CrmSyncRun[], probe: CrmProbeSetting): ApiCrmRun[] {
  const runs = logged.map(toRun);
  const verify = verifyRunFrom(probe);
  if (verify) runs.push(verify);
  const at = (r: ApiCrmRun) => {
    const t = Date.parse(r.startedAt);
    return Number.isFinite(t) ? t : 0;
  };
  return runs.sort((a, b) => at(b) - at(a)).slice(0, RUNS_SHOWN);
}

/**
 * The newest reconcile that finished (ok or part done), for "Last reconcile".
 * A run still going, or one that failed before checking anything, says
 * nothing about the list; both are in the run log. Degrades to null on a
 * failed read, like the web admin's readers.
 */
async function lastFinishedReconcile(): Promise<CrmSyncRun | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;
  const { data, error } = await db
    .from("crm_sync_runs")
    .select("id,job,trigger,started_at,finished_at,status,claimed,done,noop,failed,dead,corrected,api_calls,error")
    .eq("job", "reconcile")
    .in("status", ["ok", "partial"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[admin-api] crm last reconcile read failed", error.message);
    return null;
  }
  return (data as CrmSyncRun | null) ?? null;
}

function lastReconcileFrom(run: CrmSyncRun | null): ApiCrmLastReconcile | null {
  if (!run) return null;
  const halted = isHalted(run);
  const out: ApiCrmLastReconcile = { at: instant(run.started_at), checked: run.done, corrected: run.corrected, halted };
  if (halted) {
    out.haltReason = `One run would have unsubscribed more than the allowed share of the list (a fifth unless changed), so it stopped after ${plural(
      run.corrected,
      "unsubscribe",
      "unsubscribes",
    )}. Check the CRM for a workflow or an import that marks contacts as do not disturb, then run it again.`;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Needs attention                                                     */
/* ------------------------------------------------------------------ */

function attentionWhy(r: CrmAttentionRow): string {
  if (r.lastError) {
    const base = scrubVendor(r.lastError).replace(/[.\s]+$/, "");
    return sentence(r.httpStatus ? `${base} (HTTP ${r.httpStatus})` : base, 300);
  }
  if (r.status === "unverified") return "The message signature did not match, so it was not applied.";
  if (r.status === "unmapped") return "No client is mapped to that CRM account yet.";
  if (r.status === "dead") return "It stopped after too many tries.";
  return "It could not be applied yet. It is tried again on its own.";
}

function toAttention(r: CrmAttentionRow): ApiCrmAttention {
  const outbox = r.queue === "outbox";
  return {
    id: r.id,
    queue: r.queue,
    what: outbox ? (OUTBOX_KIND_LABEL[r.kind] ?? humanize(r.kind)) : (INBOX_EVENT_LABEL[r.kind] ?? humanize(scrubVendor(r.kind))),
    direction: outbox ? "to_crm" : "from_crm",
    who: r.email?.trim() || "Unknown contact",
    tries: r.attempts,
    why: attentionWhy(r),
    at: looseInstant(r.at) ?? instant(r.at),
    // Only signed items can be retried: an unverified delivery is never an instruction.
    signed: r.signed,
  };
}

/* ------------------------------------------------------------------ */
/* GET /crm                                                            */
/* ------------------------------------------------------------------ */

export async function loadCrmStatus(): Promise<ApiCrmStatus> {
  const configured = crmConfigured();
  const [setting, probe, install, fieldKeys, counts, runs, attention, lastOutbox, lastInbox, lastReconcile, finishedReconcile] =
    await Promise.all([
      getCrmSyncSetting(),
      getCrmProbeSetting(),
      getCrmAppInstall(),
      cachedFieldKeys(),
      getCrmQueueCounts(),
      listCrmRuns(RUNS_SHOWN),
      listCrmAttention(ATTENTION_SHOWN),
      getLastCrmRun("outbox"),
      getLastCrmRun("inbox"),
      getLastCrmRun("reconcile"),
      lastFinishedReconcile(),
    ]);

  return {
    connection: connectionFrom(configured, setting, probe),
    switches: switchesFrom(configured, setting, { outbound: lastOutbox, inbound: lastInbox, reconcile: lastReconcile }),
    app: appFrom(install),
    mergeFields: mergeFieldsFrom(fieldKeys),
    queue: queueFrom(counts),
    runs: runLog(runs, configured ? probe : {}),
    lastReconcile: lastReconcileFrom(finishedReconcile),
    // listCrmAttention already sorts newest first.
    attention: attention.map(toAttention),
  };
}
