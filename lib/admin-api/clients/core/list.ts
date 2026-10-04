import { z } from "zod";
import { offerName } from "@/config/products";
import { dbError, decodeCursor, encodeCursor, instant, requireDb, type Page } from "@/lib/admin-api";
import { guaranteeFor } from "@/lib/admin-api/clients/sections";
import type { Client } from "@/lib/clients-data";
import { derivedStage, isTaskOpen, type BookedCall, type ClientOnboarding, type OnboardingTask } from "@/lib/onboarding-data";
import { dateColumn, storedDate } from "./dates";
import { STAGES, isOneOf, type AppClientStatus, type AppGuaranteePace, type AppPlanId, type AppStage, type ClientAttention, type ListStatus } from "./enums";
import { clientStatusOf, planIdOf } from "./serialize";

/**
 * The Clients list, its stat cards, and the "Needs you" rules that Home's
 * attention counts use too (GET /overview should call `clientAttention` so a
 * card's number and the list it opens always agree).
 *
 * Rows are computed for every visible client in a handful of queries (clients,
 * runs, open runs' tasks, calls, intakes), then filtered, sorted and paged in
 * memory: the stats need every client anyway.
 */

export type ApiClientRow = {
  id: string;
  businessName: string;
  primaryEmail: string;
  isTest: boolean;
  planId: AppPlanId | null;
  planName: string | null;
  status: AppClientStatus;
  stage: AppStage | null;
  blocked: boolean;
  blockedReason: string | null;
  openTasks: { client: number; us: number };
  goLive: { liveDate: string | null; targetDate: string | null };
  guarantee: { eligible: boolean; counted: number; target: number; daysIn: number; daysLeft: number; windowDays: number; status: AppGuaranteePace };
  callsToReview: number;
  intakeToReview: boolean;
  strategist: string | null;
  updatedAt: string;
};

export type ApiClientStats = { leads: number; onboarding: number; live: number; blocked: number; behindPace: number };

/** A row plus the raw values the sort and the cursor use. */
export type ClientRowEntry = { row: ApiClientRow; sortAt: string; rawUpdatedAt: string; latestIntakeAt: string | null; latestIntakeVersion: number | null };

const PAGE = 1000;
const CHUNK = 100;

/** Every row of a query, in pages of 1000 (PostgREST caps a single answer). */
async function selectAll<T>(what: string, build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw dbError(what, error);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

function chunks<T>(list: readonly T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * A sortable key for a Postgres timestamptz string: UTC, microseconds padded,
 * so "…22Z" and "…22.5Z" compare as numbers do. Display values still go
 * through instant() untouched.
 */
export function instantKey(value: string | null | undefined): string {
  const iso = instant(value ?? null);
  if (!iso) return "";
  const m = iso.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?Z$/);
  return m ? `${m[1]}.${(m[2] ?? "").padEnd(9, "0")}` : iso;
}

type RunRow = Pick<ClientOnboarding, "id" | "client_id" | "stage" | "blocked" | "blocked_reason" | "target_live_date" | "completed_at" | "created_at">;
type TaskRow = Pick<OnboardingTask, "onboarding_id" | "stage" | "owner" | "status" | "required">;
/** Every booked-call column but `raw` (the CRM payload): the guarantee reads the rest. */
const CALL_COLUMNS =
  "id,client_id,external_id,source,contact_name,contact_phone,contact_email,service_requested,booked_at,booked_for,status,qualified,disqualified_reason,reviewed_by,reviewed_at,notes,created_at,updated_at";
type CallRow = Omit<BookedCall, "raw">;
type IntakeRow = { client_id: string; version: number; status: string; submitted_at: string | null };

/**
 * Every visible client as a list row, most recently updated first (ties by
 * business name). Deleted clients never; test clients only when
 * `includeTest` (the caller holds `testdata.view` and asked with test=1).
 */
export async function loadClientRows(opts: { includeTest: boolean }): Promise<ClientRowEntry[]> {
  const db = requireDb();
  const clients = await selectAll<Client>("clients list", (from, to) => {
    let q = db.from("clients").select("*").is("deleted_at", null).order("id").range(from, to);
    if (!opts.includeTest) q = q.eq("is_test", false);
    return q;
  });
  if (clients.length === 0) return [];
  const ids = new Set(clients.map((c) => c.id));

  const [runs, calls, intakes] = await Promise.all([
    selectAll<RunRow>("runs list", (from, to) =>
      db.from("client_onboardings").select("id,client_id,stage,blocked,blocked_reason,target_live_date,completed_at,created_at").order("id").range(from, to),
    ),
    selectAll<CallRow>("calls list", (from, to) =>
      db.from("client_booked_calls").select(CALL_COLUMNS).order("id").range(from, to),
    ),
    selectAll<IntakeRow>("intakes list", (from, to) => db.from("client_intakes").select("client_id,version,status,submitted_at").order("id").range(from, to)),
  ]);

  // The latest run per client (a completed one counts: its stage reads "complete").
  const latestRun = new Map<string, RunRow>();
  for (const r of runs) {
    if (!ids.has(r.client_id)) continue;
    const prev = latestRun.get(r.client_id);
    if (!prev || r.created_at > prev.created_at || (r.created_at === prev.created_at && r.id > prev.id)) latestRun.set(r.client_id, r);
  }

  // Tasks of the latest runs that are still open (a completed run needs none).
  const openRunIds = [...latestRun.values()].filter((r) => !r.completed_at).map((r) => r.id);
  const taskLists = await Promise.all(
    chunks(openRunIds).map((part) =>
      selectAll<TaskRow>("tasks list", (from, to) =>
        db.from("onboarding_tasks").select("onboarding_id,stage,owner,status,required").in("onboarding_id", part).order("id").range(from, to),
      ),
    ),
  );
  const tasksByRun = new Map<string, TaskRow[]>();
  for (const t of taskLists.flat()) tasksByRun.set(t.onboarding_id, [...(tasksByRun.get(t.onboarding_id) ?? []), t]);

  const callsByClient = new Map<string, BookedCall[]>();
  for (const c of calls) if (ids.has(c.client_id)) callsByClient.set(c.client_id, [...(callsByClient.get(c.client_id) ?? []), { ...c, raw: null }]);

  const latestIntake = new Map<string, IntakeRow>();
  for (const i of intakes) {
    if (!ids.has(i.client_id)) continue;
    const prev = latestIntake.get(i.client_id);
    if (!prev || i.version > prev.version) latestIntake.set(i.client_id, i);
  }

  const entries = clients.map((c): ClientRowEntry => {
    const run = latestRun.get(c.id) ?? null;
    const active = !!run && !run.completed_at;
    const tasks = run ? (tasksByRun.get(run.id) ?? []) : [];
    const open = active ? tasks.filter((t) => isTaskOpen(t as OnboardingTask)) : [];
    // The same guarantee the bundle and every call write answer (lib/admin-api/clients/sections).
    const g = guaranteeFor(c, callsByClient.get(c.id) ?? []);
    const liveDate = storedDate(c.live_at);
    const stage = run ? derivedStage(run as ClientOnboarding, tasks as OnboardingTask[]) : null;
    const intake = latestIntake.get(c.id) ?? null;
    return {
      row: {
        id: c.id,
        businessName: c.business_name,
        primaryEmail: c.primary_email,
        isTest: Boolean(c.is_test),
        planId: planIdOf(c.plan_id),
        planName: offerName(c.plan_id),
        status: clientStatusOf(c.status),
        stage: isOneOf(STAGES, stage) ? stage : null,
        blocked: active && Boolean(run?.blocked),
        blockedReason: active && run?.blocked ? run.blocked_reason : null,
        openTasks: { client: open.filter((t) => t.owner === "client").length, us: open.filter((t) => t.owner === "tekmadev").length },
        goLive: { liveDate, targetDate: liveDate ? null : dateColumn(run?.target_live_date) },
        guarantee: { eligible: g.eligible, counted: g.counted, target: g.target, daysIn: g.daysIn, daysLeft: g.daysLeft, windowDays: g.windowDays, status: g.status },
        callsToReview: g.needsReview,
        intakeToReview: intake?.status === "submitted",
        strategist: c.assigned_strategist,
        updatedAt: instant(c.updated_at),
      },
      sortAt: instantKey(c.updated_at),
      rawUpdatedAt: c.updated_at,
      latestIntakeAt: intake?.submitted_at ?? null,
      latestIntakeVersion: intake?.version ?? null,
    };
  });
  return entries.sort(compareEntries);
}

/** Most recently updated first, then business name, then id (a total order for the cursor). */
function compareEntries(a: Pick<ClientRowEntry, "sortAt" | "row">, b: Pick<ClientRowEntry, "sortAt" | "row">): number {
  if (a.sortAt !== b.sortAt) return a.sortAt < b.sortAt ? 1 : -1;
  const byName = a.row.businessName.localeCompare(b.row.businessName);
  if (byName !== 0) return byName;
  return a.row.id < b.row.id ? -1 : a.row.id > b.row.id ? 1 : 0;
}

/* ------------------------------------------------------------------ */
/* Filters, stats, attention                                           */
/* ------------------------------------------------------------------ */

export function matchesStatus(row: ApiClientRow, filter: ListStatus): boolean {
  if (filter === "all") return true;
  if (filter === "active") return row.status !== "churned" && row.status !== "lead";
  return row.status === filter;
}

/** Case-insensitive "contains" on business name and email. */
export function matchesQuery(row: ApiClientRow, q: string | undefined): boolean {
  const needle = q?.trim().toLowerCase();
  if (!needle) return true;
  return row.businessName.toLowerCase().includes(needle) || row.primaryEmail.toLowerCase().includes(needle);
}

/**
 * The rule behind each "Needs you" card, on a list row. blocked: the current
 * run is blocked (churned excluded); calls_to_review: CRM appointments nobody
 * reviewed yet; intake_to_review: the latest intake is submitted; behind_pace:
 * live, guarantee behind pace with days left.
 */
export function rowNeedsAttention(row: ApiClientRow, attention: ClientAttention): boolean {
  switch (attention) {
    case "blocked":
      return row.blocked && row.status !== "churned";
    case "calls_to_review":
      return row.callsToReview > 0;
    case "intake_to_review":
      return row.intakeToReview;
    case "behind_pace":
      return row.status === "live" && row.guarantee.status === "behind" && row.guarantee.daysLeft > 0;
  }
}

/** The stat cards: they ignore the status chip, the search and the attention filter. */
export function clientStats(rows: readonly ApiClientRow[]): ApiClientStats {
  return {
    leads: rows.filter((r) => r.status === "lead").length,
    onboarding: rows.filter((r) => r.status === "onboarding" || r.status === "pending").length,
    live: rows.filter((r) => r.status === "live").length,
    blocked: rows.filter((r) => rowNeedsAttention(r, "blocked")).length,
    behindPace: rows.filter((r) => rowNeedsAttention(r, "behind_pace")).length,
  };
}

/**
 * Home's client attention counts, from the same rules as the list filter.
 * Real clients only (pass rows loaded with includeTest false).
 */
export function clientAttention(rows: readonly ApiClientRow[]): { blockedOnboardings: number; callsToReview: number; intakesToReview: number; behindPace: number } {
  return {
    blockedOnboardings: rows.filter((r) => rowNeedsAttention(r, "blocked")).length,
    callsToReview: rows.reduce((n, r) => n + r.callsToReview, 0),
    intakesToReview: rows.filter((r) => rowNeedsAttention(r, "intake_to_review")).length,
    behindPace: rows.filter((r) => rowNeedsAttention(r, "behind_pace")).length,
  };
}

/* ------------------------------------------------------------------ */
/* Paging                                                              */
/* ------------------------------------------------------------------ */

const listCursor = z.tuple([z.string(), z.string(), z.string()]);

/**
 * A keyset page over the sorted entries: the cursor holds the last row's
 * (updated_at as Postgres sent it, business name, id), so a client bumped or
 * added between two loads is never repeated or skipped below the cursor.
 */
export function pageRows(entries: readonly ClientRowEntry[], limit: number, cursor: string | null | undefined): Page<ApiClientRow> {
  const after = decodeCursor(cursor, listCursor);
  let start = 0;
  if (after) {
    const [rawAt, name, id] = after;
    const pivot = { sortAt: instantKey(rawAt), row: { businessName: name, id } as ApiClientRow };
    start = entries.findIndex((e) => compareEntries(e, pivot) > 0);
    if (start < 0) start = entries.length;
  }
  const slice = entries.slice(start, start + limit);
  const last = slice[slice.length - 1];
  const more = start + limit < entries.length;
  return {
    items: slice.map((e) => e.row),
    nextCursor: more && last ? encodeCursor([last.rawUpdatedAt, last.row.businessName, last.row.id]) : null,
  };
}
