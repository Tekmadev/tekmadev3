import { tierMeta } from "@/config/pricing";
import { productMeta } from "@/config/products";
import { CLIENT_STATUS_LABEL } from "@/lib/clients-data";
import { INTAKE_SECTIONS } from "@/lib/intake-schema";
import { STAGES as WEB_STAGES } from "@/lib/onboarding-data";
import { sectionActivityEvents, sectionsMeta } from "@/lib/admin-api/clients/sections";
import {
  GUARANTEE_DEFAULTS,
  SETTABLE_GUARANTEE_STATUSES,
  STORED_TASK_KINDS,
  type AppClientStatus,
  type AppGuaranteeStatus,
  type AppPlanId,
  type AppStage,
  type AppTaskKind,
  type AppTaskOwner,
  type AppTaskStatus,
} from "./enums";

/**
 * The clients slice of GET /meta (src/api/schemas/clients.ts `metaFragment`):
 * every label and tone the client screens show. Labels come from the website
 * where it has them (statuses, stages, the intake form, plan names), so the
 * app and the web admin say the same thing.
 */

type Tone = "neutral" | "gold" | "ok" | "warn" | "muted" | "signal";
type Option<T extends string> = { value: T; label: string };
type Toned<T extends string> = Option<T> & { tone: Tone };

const CLIENT_TONES: Record<AppClientStatus, Tone> = { lead: "muted", pending: "neutral", onboarding: "gold", live: "ok", paused: "warn", churned: "muted" };

export const clientStatuses: Toned<AppClientStatus>[] = (Object.keys(CLIENT_TONES) as AppClientStatus[]).map((value) => ({
  value,
  label: CLIENT_STATUS_LABEL[value],
  tone: CLIENT_TONES[value],
}));

/** Stages with the website's internal day targets (staff only; the portal never shows them). */
export const onboardingStages: { value: AppStage; label: string; dayRange: string | null }[] = WEB_STAGES.map((s) => ({
  value: s.key,
  label: s.label,
  dayRange: s.days ? s.days : null,
}));

const TASK_KIND_LABELS: Record<AppTaskKind, string> = {
  general: "Checklist",
  form: "Form",
  upload: "Upload",
  access: "Access",
  meeting: "Call",
  agreement: "Agreement",
  build: "Internal",
  approval: "Approval",
  review: "Review",
  launch: "Launch",
  billing: "Billing",
};

/** Only kinds the database stores as themselves, so a picked kind always reads back the same. */
export const taskKinds: Option<AppTaskKind>[] = STORED_TASK_KINDS.map((value) => ({ value, label: TASK_KIND_LABELS[value] }));
export const taskKindLabel = (kind: AppTaskKind): string => TASK_KIND_LABELS[kind];

export const taskStatuses: Toned<AppTaskStatus>[] = [
  { value: "todo", label: "To do", tone: "neutral" },
  { value: "in_progress", label: "In progress", tone: "gold" },
  { value: "waiting_client", label: "Waiting on client", tone: "warn" },
  { value: "done", label: "Done", tone: "ok" },
  { value: "skipped", label: "Skipped", tone: "muted" },
  { value: "blocked", label: "Blocked", tone: "signal" },
];

export const taskOwners: Option<AppTaskOwner>[] = [
  { value: "client", label: "Client" },
  { value: "tekmadev", label: "Tekmadev" },
];

const GUARANTEE_STATUS_LABELS: Record<AppGuaranteeStatus, Toned<AppGuaranteeStatus>> = {
  not_started: { value: "not_started", label: "Not started", tone: "muted" },
  running: { value: "running", label: "Running", tone: "gold" },
  met: { value: "met", label: "Met", tone: "ok" },
  missed: { value: "missed", label: "Missed", tone: "signal" },
  waived: { value: "waived", label: "Waived", tone: "muted" },
};

/** Only the statuses the account can store (there is no "missed" in the database). */
export const guaranteeStatuses: Toned<AppGuaranteeStatus>[] = SETTABLE_GUARANTEE_STATUSES.map((s) => GUARANTEE_STATUS_LABELS[s]);

type IntakeFieldType = "text" | "textarea" | "select" | "multiselect" | "url" | "number";

/** The portal's intake form (lib/intake-schema.ts). Phone and email fields are plain text to the app. */
export const intakeSchema = INTAKE_SECTIONS.map((section) => ({
  key: section.key,
  title: section.title,
  fields: section.fields.map((f) => {
    const type: IntakeFieldType = f.type === "tel" || f.type === "email" ? "text" : f.type;
    return {
      key: f.key,
      label: f.label,
      type,
      ...(f.options ? { options: f.options.map((o) => ({ value: o.value, label: o.label })) } : {}),
      help: f.help ?? null,
    };
  }),
}));

export type PlanOption = { id: AppPlanId; name: string; kind: "growth" | "product"; guarantee: boolean; needsCarePlan: boolean };

/** Growth plans (config/pricing.ts) then one-time products (config/products.ts). */
export const planOptions: PlanOption[] = [
  ...tierMeta.map((t): PlanOption => ({ id: t.id, name: t.name, kind: "growth", guarantee: t.guarantee, needsCarePlan: false })),
  ...productMeta.map((p): PlanOption => ({ id: p.id, name: p.name, kind: "product", guarantee: false, needsCarePlan: Boolean(p.care) })),
];

/** Whether a plan id carries the booked-call guarantee. */
export const planHasGuarantee = (planId: string | null | undefined): boolean => planOptions.find((p) => p.id === planId)?.guarantee ?? false;

/**
 * Labels for the activity events the account, onboarding and intake write to
 * `client_activity` (the website's events and this API's). The sections add
 * theirs (`sectionActivityEvents`); `activityEvents` is the merge.
 */
const CORE_ACTIVITY_EVENTS: Option<string>[] = [
  { value: "client.created", label: "Client created" },
  { value: "client.signed_up", label: "Signed up" },
  { value: "client.updated", label: "Account updated" },
  { value: "client.status", label: "Status changed" },
  { value: "client.live", label: "Went live" },
  { value: "care.go_live_override", label: "Went live without a care plan" },
  { value: "care.checkout_started", label: "Care plan checkout started" },
  { value: "care.started", label: "Care plan started" },
  { value: "checkout.started", label: "Checkout started" },
  { value: "billing.charge_refunded", label: "Payment refunded" },
  { value: "billing.charge_dispute_created", label: "Payment disputed" },
  { value: "billing.subscription_created", label: "Subscription started" },
  { value: "billing.subscription_updated", label: "Subscription updated" },
  { value: "billing.subscription_deleted", label: "Subscription ended" },
  { value: "onboarding.started", label: "Onboarding started" },
  { value: "onboarding.stage_changed", label: "Stage changed" },
  { value: "onboarding.blocked", label: "Blocked" },
  { value: "onboarding.unblocked", label: "Unblocked" },
  { value: "onboarding.updated", label: "Onboarding updated" },
  { value: "onboarding.completed", label: "Onboarding complete" },
  { value: "task.created", label: "Task added" },
  { value: "task.status_changed", label: "Task updated" },
  { value: "task.completed", label: "Task done" },
  { value: "intake.submitted", label: "Intake submitted" },
  { value: "intake.reviewed", label: "Intake reviewed" },
  { value: "guarantee.met", label: "Guarantee met" },
  { value: "member.activated", label: "Portal login" },
  { value: "member.self_joined", label: "Joined the portal" },
];

/** Every activity event label: the core's, then the sections' (a section's own label wins for its events). */
export function activityEvents(): Option<string>[] {
  const out = new Map<string, Option<string>>();
  for (const e of CORE_ACTIVITY_EVENTS) out.set(e.value, e);
  for (const e of sectionActivityEvents) out.set(e.value, { value: e.value, label: e.label });
  return [...out.values()];
}

/**
 * The whole clients slice of GET /meta, in the app's key order. The section
 * keys (access, files, approvals, agreements, calls, people, guarantee count
 * rules and paces) come from lib/admin-api/clients/sections, next to the code
 * that writes those values.
 */
export function clientsMeta() {
  return {
    clientStatuses,
    onboardingStages,
    taskKinds,
    taskStatuses,
    taskOwners,
    accessProviders: sectionsMeta.accessProviders,
    accessMethods: sectionsMeta.accessMethods,
    accessStatuses: sectionsMeta.accessStatuses,
    assetKinds: sectionsMeta.assetKinds,
    approvalKinds: sectionsMeta.approvalKinds,
    approvalStatuses: sectionsMeta.approvalStatuses,
    agreementStatuses: sectionsMeta.agreementStatuses,
    callStatuses: sectionsMeta.callStatuses,
    callSources: sectionsMeta.callSources,
    callReviewStates: sectionsMeta.callReviewStates,
    disqualifyReasons: sectionsMeta.disqualifyReasons,
    memberRoles: sectionsMeta.memberRoles,
    memberStatuses: sectionsMeta.memberStatuses,
    guaranteeCountRules: sectionsMeta.guaranteeCountRules,
    guaranteeStatuses,
    guaranteePaces: sectionsMeta.guaranteePaces,
    guaranteeDefaults: { ...GUARANTEE_DEFAULTS },
    intakeSchema,
    planOptions,
    activityEvents: activityEvents(),
  };
}
