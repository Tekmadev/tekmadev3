/**
 * The clients domain vocabulary as the app sees it (src/api/schemas/clients.ts
 * in the app repo) for the account, the onboarding run, tasks, templates and
 * billing, and the mapping to what the database stores
 * (supabase/migrations/20260910000001_client_portal_schema.sql and later).
 * The client sections keep their own vocabulary in lib/admin-api/clients/sections.
 *
 * The portal and the web admin keep using the database values, so every read
 * maps database to app and every write maps app to database.
 */

/* ------------------------------------------------------------------ */
/* App enums                                                           */
/* ------------------------------------------------------------------ */

export const CLIENT_STATUSES = ["lead", "pending", "onboarding", "live", "paused", "churned"] as const;
export type AppClientStatus = (typeof CLIENT_STATUSES)[number];

/** Statuses the Account sheet can set: a lead becomes a client through checkout, not by hand. */
export const EDITABLE_CLIENT_STATUSES: readonly AppClientStatus[] = ["pending", "onboarding", "live", "paused", "churned"];

export const LIST_STATUSES = ["active", "lead", "onboarding", "live", "pending", "paused", "churned", "all"] as const;
export type ListStatus = (typeof LIST_STATUSES)[number];

export const ATTENTIONS = ["blocked", "calls_to_review", "intake_to_review", "behind_pace"] as const;
export type ClientAttention = (typeof ATTENTIONS)[number];

export const PLAN_IDS = ["convert", "grow", "lets-talk", "webline"] as const;
export type AppPlanId = (typeof PLAN_IDS)[number];

export const STAGES = ["welcome", "intake", "kickoff", "build", "review", "go_live", "optimizing", "complete"] as const;
export type AppStage = (typeof STAGES)[number];
/** Stages a task or template can sit in (the database never stores `complete` on them). */
export type AppTaskStage = Exclude<AppStage, "complete">;

export const TASK_OWNERS = ["client", "tekmadev"] as const;
export type AppTaskOwner = (typeof TASK_OWNERS)[number];

export const TASK_KINDS = ["general", "form", "upload", "access", "meeting", "agreement", "build", "approval", "review", "launch", "billing"] as const;
export type AppTaskKind = (typeof TASK_KINDS)[number];

export const TASK_STATUSES = ["todo", "in_progress", "waiting_client", "done", "skipped", "blocked"] as const;
export type AppTaskStatus = (typeof TASK_STATUSES)[number];

export const COUNT_RULES = ["booked", "showed"] as const;
export type AppCountRule = (typeof COUNT_RULES)[number];

export const GUARANTEE_STATUSES = ["not_started", "running", "met", "missed", "waived"] as const;
export type AppGuaranteeStatus = (typeof GUARANTEE_STATUSES)[number];

export const GUARANTEE_PACES = ["met", "on_pace", "behind", "not_started", "n/a"] as const;
export type AppGuaranteePace = (typeof GUARANTEE_PACES)[number];

export const INTAKE_STATUSES = ["draft", "submitted", "reviewed"] as const;
export type AppIntakeStatus = (typeof INTAKE_STATUSES)[number];

export const SUBSCRIPTION_STATUSES = ["active", "trialing", "past_due", "unpaid", "incomplete", "paused", "canceled"] as const;
export type AppSubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const ORDER_STATUSES = ["paid", "pending", "failed", "refunded", "partially_refunded"] as const;
export type AppOrderStatus = (typeof ORDER_STATUSES)[number];

/** The account's guarantee defaults (the `clients` column defaults). */
export const GUARANTEE_DEFAULTS = { target: 30, windowDays: 60, countRule: "booked" as AppCountRule };

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}

export function stageIndex(stage: AppStage): number {
  return STAGES.indexOf(stage);
}

/* ------------------------------------------------------------------ */
/* Database values                                                     */
/* ------------------------------------------------------------------ */

export type DbTaskKind = "form" | "upload" | "access_grant" | "approval" | "esign" | "call" | "internal" | "checklist" | "billing";
export type DbTaskStatus = "todo" | "in_progress" | "waiting_on_client" | "done" | "skipped" | "blocked";
export type DbGuaranteeStatus = "not_started" | "running" | "met" | "extended" | "waived" | "not_eligible";

/* ---------- task kinds ---------- */

/**
 * Task kinds. The portal acts on the database kind (a `checklist` or `call`
 * task the client can tick off, `form` opens the intake, and so on), so the
 * app's kinds land on the database kind with the same portal behaviour:
 * general is a checklist item, meeting is a call, agreement is an e-sign, and
 * the three internal kinds (build, review, launch) are `internal` work, which
 * reads back as build.
 */
const TASK_KIND_TO_DB: Record<AppTaskKind, DbTaskKind> = {
  general: "checklist",
  form: "form",
  upload: "upload",
  access: "access_grant",
  meeting: "call",
  agreement: "esign",
  build: "internal",
  approval: "approval",
  review: "internal",
  launch: "internal",
  billing: "billing",
};

const TASK_KIND_TO_APP: Record<DbTaskKind, AppTaskKind> = {
  checklist: "general",
  form: "form",
  upload: "upload",
  access_grant: "access",
  call: "meeting",
  esign: "agreement",
  internal: "build",
  approval: "approval",
  billing: "billing",
};

export const taskKindToDb = (kind: AppTaskKind): DbTaskKind => TASK_KIND_TO_DB[kind];
export const taskKindToApp = (kind: string | null | undefined): AppTaskKind => TASK_KIND_TO_APP[kind as DbTaskKind] ?? "general";

/** The app kinds that round trip exactly (one per database kind): what meta offers. */
export const STORED_TASK_KINDS: readonly AppTaskKind[] = ["general", "form", "upload", "access", "meeting", "agreement", "build", "approval", "billing"];

/* ---------- task statuses ---------- */

export const taskStatusToDb = (status: AppTaskStatus): DbTaskStatus => (status === "waiting_client" ? "waiting_on_client" : status);
export function taskStatusToApp(status: string | null | undefined): AppTaskStatus {
  if (status === "waiting_on_client") return "waiting_client";
  return isOneOf(TASK_STATUSES, status) ? status : "todo";
}

/* ---------- the stored guarantee status ---------- */

/**
 * Stored guarantee status. `extended` reads as running (the clock is still on),
 * `not_eligible` as not started (the pace badge already says n/a). `missed` has
 * no database value, so the API does not offer it (see meta) and refuses it.
 */
export function guaranteeStatusToApp(status: string | null | undefined): AppGuaranteeStatus {
  switch (status) {
    case "running":
    case "extended":
      return "running";
    case "met":
      return "met";
    case "waived":
      return "waived";
    default:
      return "not_started";
  }
}

export function guaranteeStatusToDb(status: AppGuaranteeStatus): DbGuaranteeStatus | null {
  return status === "missed" ? null : status;
}

/** Guarantee statuses the API accepts and offers (everything the database can hold). */
export const SETTABLE_GUARANTEE_STATUSES: readonly AppGuaranteeStatus[] = ["not_started", "running", "met", "waived"];

/* ---------- billing ---------- */

export function subscriptionStatusToApp(status: string | null | undefined): AppSubscriptionStatus {
  if (status === "incomplete_expired") return "canceled";
  return isOneOf(SUBSCRIPTION_STATUSES, status) ? status : "incomplete";
}

/** A disputed order reads as failed: the money is not ours until the dispute is won. */
export function orderStatusToApp(status: string | null | undefined): AppOrderStatus {
  if (status === "disputed") return "failed";
  return isOneOf(ORDER_STATUSES, status) ? status : "pending";
}
