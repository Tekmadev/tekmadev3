import { offerName } from "@/config/products";
import { instant } from "@/lib/admin-api";
import type { People } from "@/lib/admin-api/clients/sections";
import type { Client, ClientMember } from "@/lib/clients-data";
import {
  derivedStage,
  isTaskOpen,
  taskProgress,
  type ClientIntake,
  type ClientOnboarding,
  type OnboardingTask,
  type OnboardingTaskTemplate,
} from "@/lib/onboarding-data";
import { portalUrl } from "@/lib/portal-host";
import { dateColumn, storedDate, TIME_ZONE } from "./dates";
import {
  CLIENT_STATUSES,
  COUNT_RULES,
  guaranteeStatusToApp,
  INTAKE_STATUSES,
  isOneOf,
  PLAN_IDS,
  STAGES,
  taskKindToApp,
  taskStatusToApp,
  type AppClientStatus,
  type AppCountRule,
  type AppGuaranteeStatus,
  type AppIntakeStatus,
  type AppOrderStatus,
  type AppPlanId,
  type AppStage,
  type AppSubscriptionStatus,
  type AppTaskKind,
  type AppTaskOwner,
  type AppTaskStatus,
} from "./enums";

/**
 * Database rows to the app's shapes (src/api/schemas/clients.ts) for the
 * account, the onboarding run and its tasks, the intake, checklist templates
 * and billing. The run's derived stage and progress are computed here, once,
 * for the list, the bundle and every write. The client sections (access,
 * files, approvals, agreements, calls and the guarantee, CRM, people,
 * activity) are shaped in lib/admin-api/clients/sections.
 */

type Money = { amount: number; currency: string };

/* ------------------------------------------------------------------ */
/* Client                                                              */
/* ------------------------------------------------------------------ */

export type ApiClient = {
  id: string;
  businessName: string;
  legalName: string | null;
  website: string | null;
  primaryEmail: string;
  contactName: string | null;
  phone: string | null;
  industry: string | null;
  status: AppClientStatus;
  planId: AppPlanId | null;
  planName: string | null;
  isTest: boolean;
  timezone: string;
  assignedStrategist: string | null;
  liveDate: string | null;
  serviceArea: string | null;
  internalNotes: string | null;
  guaranteeEligible: boolean;
  guaranteeTarget: number;
  guaranteeWindowDays: number;
  guaranteeCountRule: AppCountRule;
  guaranteeStatus: AppGuaranteeStatus;
  guaranteeClockStartedOn: string | null;
  portalUrl: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export const planIdOf = (planId: string | null | undefined): AppPlanId | null => (isOneOf(PLAN_IDS, planId) ? planId : null);
export const clientStatusOf = (status: string | null | undefined): AppClientStatus => (isOneOf(CLIENT_STATUSES, status) ? status : "pending");
export const countRuleOf = (rule: string | null | undefined): AppCountRule => (isOneOf(COUNT_RULES, rule) ? rule : "booked");

/**
 * The contact name: the client's own portal login (the member with the
 * primary email, which "New client" creates as the owner), else the first
 * owner with a name, else what the account keeps in `metadata.contact_name`.
 */
export function contactNameOf(client: Pick<Client, "primary_email" | "metadata">, members: readonly Pick<ClientMember, "email" | "name" | "role">[]): string | null {
  const primary = client.primary_email.toLowerCase();
  const own = members.find((m) => m.email.toLowerCase() === primary && m.name?.trim());
  if (own?.name) return own.name.trim();
  const owner = members.find((m) => m.role === "owner" && m.name?.trim());
  if (owner?.name) return owner.name.trim();
  const stored = client.metadata?.contact_name;
  return typeof stored === "string" && stored.trim() ? stored.trim() : null;
}

export function toClient(c: Client, contactName: string | null): ApiClient {
  return {
    id: c.id,
    businessName: c.business_name,
    legalName: c.legal_name,
    website: c.website_url,
    primaryEmail: c.primary_email,
    contactName,
    phone: c.primary_phone,
    industry: c.industry,
    status: clientStatusOf(c.status),
    planId: planIdOf(c.plan_id),
    planName: offerName(c.plan_id),
    isTest: Boolean(c.is_test),
    timezone: c.timezone || TIME_ZONE,
    assignedStrategist: c.assigned_strategist,
    liveDate: storedDate(c.live_at),
    serviceArea: c.service_area,
    internalNotes: c.internal_notes,
    guaranteeEligible: Boolean(c.guarantee_eligible),
    guaranteeTarget: Math.trunc(Number(c.guarantee_target) || 0),
    guaranteeWindowDays: Math.trunc(Number(c.guarantee_window_days) || 0),
    guaranteeCountRule: countRuleOf(c.guarantee_count_rule),
    guaranteeStatus: guaranteeStatusToApp(c.guarantee_status),
    guaranteeClockStartedOn: storedDate(c.guarantee_started_at),
    portalUrl: portalUrl("/"),
    createdAt: instant(c.created_at),
    updatedAt: instant(c.updated_at),
    deletedAt: instant(c.deleted_at),
  };
}

/* ------------------------------------------------------------------ */
/* Onboarding                                                          */
/* ------------------------------------------------------------------ */

export type ApiRun = {
  id: string;
  clientId: string;
  stage: AppStage;
  derivedStage: AppStage;
  percentRequiredDone: number;
  requiredDone: number;
  requiredTotal: number;
  waitingOnClient: number;
  blocked: boolean;
  blockedReason: string | null;
  targetLiveDate: string | null;
  kickoffAt: string | null;
  startedAt: string;
  completedAt: string | null;
  updatedAt: string;
};

export type ApiTask = {
  id: string;
  runId: string;
  templateKey: string | null;
  title: string;
  description: string | null;
  stage: AppStage;
  owner: AppTaskOwner;
  kind: AppTaskKind;
  required: boolean;
  status: AppTaskStatus;
  dueAt: string | null;
  doneAt: string | null;
  doneBy: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

const stageOf = (stage: string | null | undefined): AppStage => (isOneOf(STAGES, stage) ? stage : "welcome");

/** Tasks in checklist order: stage, then sort order, then when they were added. */
export function sortTasks<T extends Pick<OnboardingTask, "stage" | "sort_order" | "created_at">>(tasks: readonly T[]): T[] {
  return [...tasks].sort(
    (a, b) =>
      STAGES.indexOf(stageOf(a.stage)) - STAGES.indexOf(stageOf(b.stage)) ||
      a.sort_order - b.sort_order ||
      a.created_at.localeCompare(b.created_at),
  );
}

export function toRun(run: ClientOnboarding, tasks: readonly OnboardingTask[]): ApiRun {
  const list = [...tasks];
  const progress = taskProgress(list);
  return {
    id: run.id,
    clientId: run.client_id,
    stage: stageOf(run.stage),
    // The website's rule: the first stage with an open required task, or the stored stage when further along.
    derivedStage: stageOf(derivedStage(run, list)),
    percentRequiredDone: progress.percent,
    requiredDone: progress.done,
    requiredTotal: progress.total,
    waitingOnClient: list.filter((t) => isTaskOpen(t) && (t.owner === "client" || t.status === "waiting_on_client")).length,
    // Only an open run can be blocked (a run completed while blocked keeps the flag in the database).
    blocked: !run.completed_at && Boolean(run.blocked),
    blockedReason: !run.completed_at && run.blocked ? run.blocked_reason : null,
    targetLiveDate: dateColumn(run.target_live_date),
    kickoffAt: instant(run.kickoff_at),
    startedAt: instant(run.created_at),
    completedAt: instant(run.completed_at),
    updatedAt: instant(run.updated_at),
  };
}

/** Tasks added by hand have a `custom.` key; the rest carry their template's key. */
const templateKeyOf = (key: string | null | undefined): string | null => (key && !key.startsWith("custom.") ? key : null);

export function toTask(t: OnboardingTask, people: People): ApiTask {
  return {
    id: t.id,
    runId: t.onboarding_id,
    templateKey: templateKeyOf(t.key),
    title: t.title,
    description: t.description,
    stage: stageOf(t.stage),
    owner: t.owner === "client" ? "client" : "tekmadev",
    kind: taskKindToApp(t.kind),
    required: Boolean(t.required),
    status: taskStatusToApp(t.status),
    dueAt: instant(t.due_at),
    doneAt: instant(t.completed_at),
    doneBy: people.display(t.completed_by),
    sortOrder: Math.trunc(Number(t.sort_order) || 0),
    createdAt: instant(t.created_at),
    updatedAt: instant(t.updated_at),
  };
}

/* ------------------------------------------------------------------ */
/* Intake                                                              */
/* ------------------------------------------------------------------ */

export type IntakeAnswer = string | number | string[] | null;

export type ApiIntake = {
  id: string;
  clientId: string;
  version: number;
  status: AppIntakeStatus;
  startedAt: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  updatedAt: string;
  answers: Record<string, IntakeAnswer>;
};

function answerOf(value: unknown): IntakeAnswer | undefined {
  if (value === null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  return undefined;
}

export function toIntake(i: ClientIntake, people: People): ApiIntake {
  const answers: Record<string, IntakeAnswer> = {};
  for (const [key, value] of Object.entries(i.answers ?? {})) {
    const answer = answerOf(value);
    if (answer !== undefined) answers[key] = answer;
  }
  return {
    id: i.id,
    clientId: i.client_id,
    version: Math.trunc(Number(i.version) || 1),
    status: isOneOf(INTAKE_STATUSES, i.status) ? i.status : "draft",
    startedAt: instant(i.created_at),
    submittedAt: instant(i.submitted_at),
    reviewedAt: instant(i.reviewed_at),
    reviewedBy: people.display(i.reviewed_by),
    updatedAt: instant(i.updated_at),
    answers,
  };
}

/* ------------------------------------------------------------------ */
/* Checklist templates                                                 */
/* ------------------------------------------------------------------ */

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type ApiTemplate = {
  key: string;
  title: string;
  stage: AppStage;
  owner: AppTaskOwner;
  kind: AppTaskKind;
  plans: AppPlanId[];
  dueOffsetDays: number | null;
  sortOrder: number;
  description: string | null;
  payload: JsonValue;
  required: boolean;
  active: boolean;
  updatedAt: string;
};

export function toTemplate(t: OnboardingTaskTemplate): ApiTemplate {
  return {
    key: t.key,
    title: t.title,
    stage: stageOf(t.stage),
    owner: t.owner === "client" ? "client" : "tekmadev",
    kind: taskKindToApp(t.kind),
    plans: Array.from(new Set((t.plan_ids ?? []).filter((p): p is AppPlanId => isOneOf(PLAN_IDS, p)))),
    dueOffsetDays: t.due_offset_days === null || t.due_offset_days === undefined ? null : Math.trunc(Number(t.due_offset_days)),
    sortOrder: Math.trunc(Number(t.sort_order) || 0),
    description: t.description,
    payload: (t.payload ?? null) as JsonValue,
    required: Boolean(t.required),
    active: Boolean(t.active),
    updatedAt: instant(t.updated_at),
  };
}

/* ------------------------------------------------------------------ */
/* Billing                                                             */
/* ------------------------------------------------------------------ */

export type ApiBilling = {
  subscription: {
    id: string;
    kind: "plan" | "care";
    productName: string;
    status: AppSubscriptionStatus;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: string | null;
    amount: Money;
    interval: "month" | "year";
  } | null;
  latestOrder: {
    id: string;
    productName: string;
    status: AppOrderStatus;
    amount: Money;
    paymentMethod: string | null;
    paidAt: string | null;
    createdAt: string;
  } | null;
  carePlan: { required: boolean; active: boolean };
};
