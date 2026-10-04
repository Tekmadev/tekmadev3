"use server";

import { redirect } from "next/navigation";
import { requireAdminCapability } from "@/lib/admin";
import {
  addTaskByStaff,
  changeOnboardingStage,
  completeOnboardingRun,
  goLiveClient,
  reviewIntakeByStaff,
  setOnboardingBlocked,
  setTaskStatusByStaff,
  trashClient,
} from "@/lib/client-ops";
import {
  getClientById,
  getMemberById,
  logActivity,
  updateClient,
  updateMember,
  type Client,
  type ClientStatus,
  type GuaranteeCountRule,
  type GuaranteeStatus,
  type MemberRole,
  type MemberStatus,
} from "@/lib/clients-data";
import {
  deleteTemplate,
  getAccessGrant,
  getOnboardingById,
  getTaskById,
  updateOnboarding,
  upsertTemplate,
  type AccessGrant,
  type ApprovalKind,
  type BookedCall,
  type OnboardingStage,
  type TaskKind,
  type TaskOwner,
  type TaskStage,
  type TaskStatus,
} from "@/lib/onboarding-data";
import { type AccessProviderKey } from "@/lib/access-providers";
import { inviteMember, provisionClient } from "@/lib/client-provisioning";
import {
  logClientBookedCall,
  postClientNote,
  requestClientAccess,
  requestClientApproval,
  saveBookedCallReview,
  saveClientCrmMapping,
  sendMemberLink,
  setClientAccessStatus,
} from "@/lib/client-sections-data";

/**
 * Admin actions for client accounts. Each one checks its own capability from
 * the permission table the admin API uses (lib/admin-api/permissions.ts):
 * staff may add tasks, set task status, ask for access and approvals, log
 * calls and post notes; account edits, go live, members, onboarding run
 * controls, call review, CRM, templates and trash need a manager or owner.
 * Every write logs to the client's activity trail.
 */

function s(v: FormDataEntryValue | null, max = 4000): string {
  return String(v ?? "").trim().slice(0, max);
}
function opt(v: FormDataEntryValue | null, max = 4000): string | null {
  const x = s(v, max);
  return x === "" ? null : x;
}
function num(v: FormDataEntryValue | null): number | null {
  const x = s(v);
  if (!x) return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}
function iso(v: FormDataEntryValue | null): string | null {
  const x = s(v);
  if (!x) return null;
  const d = new Date(x);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
function back(clientId: string, anchor?: string) {
  return `/admin/clients/${clientId}${anchor ? `#${anchor}` : ""}`;
}

const STATUSES: ClientStatus[] = ["pending", "onboarding", "live", "paused", "churned"];
const GUARANTEE: GuaranteeStatus[] = ["not_started", "running", "met", "extended", "waived", "not_eligible"];
const STAGES: OnboardingStage[] = ["welcome", "intake", "kickoff", "build", "review", "go_live", "optimizing", "complete"];
const TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "waiting_on_client", "done", "skipped", "blocked"];
const TASK_STAGES: TaskStage[] = ["welcome", "intake", "kickoff", "build", "review", "go_live", "optimizing"];
const TASK_KINDS: TaskKind[] = ["form", "upload", "access_grant", "approval", "esign", "call", "internal", "checklist", "billing"];
const APPROVAL_KINDS: ApprovalKind[] = ["website", "receptionist_script", "ad_creative", "landing_page", "follow_up_sequence", "social_content", "other"];
const CALL_STATUSES: BookedCall["status"][] = ["booked", "confirmed", "showed", "no_show", "cancelled", "rescheduled"];
const CALL_SOURCES: BookedCall["source"][] = ["receptionist", "web_form", "calendar", "missed_call_textback", "ads", "chat", "manual", "import", "other"];
const DQ_REASONS = ["spam", "duplicate", "out_of_area", "wrong_service", "fake", "other"] as const;
const ACCESS_STATUSES: AccessGrant["status"][] = ["requested", "pending_client", "client_says_done", "granted", "verified", "revoked", "not_applicable"];

function pick<T extends string>(v: FormDataEntryValue | null, allowed: readonly T[], fallback: T): T {
  const x = s(v) as T;
  return allowed.includes(x) ? x : fallback;
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

export async function createClientAction(formData: FormData) {
  const ctx = await requireAdminCapability("clients.create");
  const email = s(formData.get("email"), 200).toLowerCase();
  const businessName = s(formData.get("business_name"), 200);
  if (!email.includes("@") || !businessName) redirect("/admin/clients/new?e=required");

  const planRaw = s(formData.get("plan_id"));
  const result = await provisionClient({
    business_name: businessName,
    email,
    name: opt(formData.get("name"), 120),
    phone: opt(formData.get("phone"), 40),
    plan_id: planRaw || null,
    actor_type: "admin",
    actor_email: ctx.email,
    send_invite: formData.get("send_invite") === "on",
  });
  if (opt(formData.get("assigned_strategist"))) {
    await updateClient(result.client.id, { assigned_strategist: opt(formData.get("assigned_strategist"), 200) }, ctx.email);
  }
  redirect(`${back(result.client.id)}?created=1${result.invite && !result.invite.ok ? "&invite=failed" : ""}`);
}

export async function updateClientAction(formData: FormData) {
  const ctx = await requireAdminCapability("clients.edit");
  const id = s(formData.get("client_id"));
  const client = await getClientById(id);
  if (!client) redirect("/admin/clients");

  const patch: Partial<Client> = {
    business_name: s(formData.get("business_name"), 200) || client.business_name,
    legal_name: opt(formData.get("legal_name"), 200),
    website_url: opt(formData.get("website_url"), 300),
    primary_email: (s(formData.get("primary_email"), 200) || client.primary_email).toLowerCase(),
    primary_phone: opt(formData.get("primary_phone"), 40),
    industry: opt(formData.get("industry"), 100),
    service_area: opt(formData.get("service_area"), 1000),
    timezone: s(formData.get("timezone"), 60) || client.timezone,
    status: pick(formData.get("status"), STATUSES, client.status),
    plan_id: opt(formData.get("plan_id"), 40),
    assigned_strategist: opt(formData.get("assigned_strategist"), 200),
    internal_notes: opt(formData.get("internal_notes"), 10000),
    guarantee_eligible: formData.get("guarantee_eligible") === "on",
    guarantee_target: num(formData.get("guarantee_target")) ?? client.guarantee_target,
    guarantee_window_days: num(formData.get("guarantee_window_days")) ?? client.guarantee_window_days,
    guarantee_count_rule: pick<GuaranteeCountRule>(formData.get("guarantee_count_rule"), ["booked", "showed"], client.guarantee_count_rule),
    guarantee_status: pick(formData.get("guarantee_status"), GUARANTEE, client.guarantee_status),
    guarantee_started_at: iso(formData.get("guarantee_started_at")),
    live_at: iso(formData.get("live_at")),
  };
  await updateClient(id, patch, ctx.email);
  await logActivity({ client_id: id, actor_type: "admin", actor_email: ctx.email, event: "client.updated", summary: "Account details updated" });
  redirect(`${back(id, "account")}?saved=1`);
}

export async function deleteClientAction(formData: FormData) {
  const ctx = await requireAdminCapability("clients.trash");
  const id = s(formData.get("client_id"));
  const client = await getClientById(id);
  // Soft delete, and the owner is told who did it (lib/client-ops.ts).
  await trashClient(client, id, ctx.email);
  redirect("/admin/clients?deleted=1");
}

/** Flip the account live: status, milestones, and the guarantee clock in one go (lib/client-ops.ts). */
export async function goLiveAction(formData: FormData) {
  const ctx = await requireAdminCapability("clients.go_live");
  const id = s(formData.get("client_id"));
  const client = await getClientById(id);
  if (!client) redirect("/admin/clients");

  // A product with a required care plan (Webline) does not go live until the
  // client has set it up. An explicit override exists for comped or invoiced
  // sites and is written to the activity log.
  const result = await goLiveClient(client, { by: ctx.email, override: formData.get("override") === "1" });
  if (!result.ok) redirect(`${back(id)}?e=care`);
  redirect(`${back(id)}?live=1`);
}

// ---------------------------------------------------------------------------
// Onboarding + tasks
// ---------------------------------------------------------------------------

export async function setStageAction(formData: FormData) {
  const ctx = await requireAdminCapability("clients.onboarding");
  const onboarding = await getOnboardingById(s(formData.get("onboarding_id")));
  if (!onboarding) redirect("/admin/clients");
  const stage = pick(formData.get("stage"), STAGES, onboarding.stage);
  await changeOnboardingStage(onboarding, stage, ctx.email);
  redirect(back(onboarding.client_id, "onboarding"));
}

export async function setBlockedAction(formData: FormData) {
  const ctx = await requireAdminCapability("clients.onboarding");
  const onboarding = await getOnboardingById(s(formData.get("onboarding_id")));
  if (!onboarding) redirect("/admin/clients");
  const blocked = formData.get("blocked") === "on";
  const reason = opt(formData.get("blocked_reason"), 500);
  await setOnboardingBlocked(onboarding, blocked, reason, ctx.email);
  redirect(back(onboarding.client_id, "onboarding"));
}

export async function setOnboardingDatesAction(formData: FormData) {
  await requireAdminCapability("clients.onboarding");
  const onboarding = await getOnboardingById(s(formData.get("onboarding_id")));
  if (!onboarding) redirect("/admin/clients");
  await updateOnboarding(onboarding.id, {
    target_live_date: opt(formData.get("target_live_date"), 10),
    kickoff_at: iso(formData.get("kickoff_at")),
  });
  redirect(back(onboarding.client_id, "onboarding"));
}

export async function setTaskStatusAction(formData: FormData) {
  const ctx = await requireAdminCapability("clients.tasks.status");
  const task = await getTaskById(s(formData.get("task_id")));
  if (!task) redirect("/admin/clients");
  const status = pick(formData.get("status"), TASK_STATUSES, task.status);
  await setTaskStatusByStaff(task, status, ctx.email);
  redirect(back(task.client_id, "onboarding"));
}

export async function addTaskAction(formData: FormData) {
  const ctx = await requireAdminCapability("clients.tasks.create");
  const onboarding = await getOnboardingById(s(formData.get("onboarding_id")));
  if (!onboarding) redirect("/admin/clients");
  const title = s(formData.get("title"), 200);
  if (!title) redirect(back(onboarding.client_id, "onboarding"));
  await addTaskByStaff(
    onboarding,
    {
      title,
      description: opt(formData.get("description"), 1000),
      stage: pick(formData.get("stage"), TASK_STAGES, onboarding.stage === "complete" ? "optimizing" : (onboarding.stage as TaskStage)),
      owner: pick<TaskOwner>(formData.get("owner"), ["client", "tekmadev"], "tekmadev"),
      kind: pick(formData.get("kind"), TASK_KINDS, "checklist"),
      required: formData.get("required") === "on",
      due_at: iso(formData.get("due_at")),
    },
    ctx.email,
  );
  redirect(back(onboarding.client_id, "onboarding"));
}

export async function completeOnboardingAction(formData: FormData) {
  const ctx = await requireAdminCapability("clients.onboarding");
  const onboarding = await getOnboardingById(s(formData.get("onboarding_id")));
  if (!onboarding) redirect("/admin/clients");
  await completeOnboardingRun(onboarding, ctx.email);
  redirect(back(onboarding.client_id, "onboarding"));
}

// ---------------------------------------------------------------------------
// Intake, access, approvals
// ---------------------------------------------------------------------------

export async function markIntakeReviewedAction(formData: FormData) {
  const ctx = await requireAdminCapability("clients.intake.review");
  const clientId = s(formData.get("client_id"));
  await reviewIntakeByStaff(s(formData.get("intake_id")), clientId, ctx.email);
  redirect(back(clientId, "intake"));
}

export async function setAccessStatusAction(formData: FormData) {
  const ctx = await requireAdminCapability("clients.access.update");
  const grant = await getAccessGrant(s(formData.get("grant_id")));
  if (!grant) redirect("/admin/clients");
  const status = pick(formData.get("status"), ACCESS_STATUSES, grant.status);
  // Shared with the admin API (lib/client-sections-data.ts): stamps, inbox, task sync, activity.
  await setClientAccessStatus({ grant, status, notes: opt(formData.get("notes"), 1000) ?? grant.notes, by: ctx.email });
  redirect(back(grant.client_id, "access"));
}

export async function addAccessGrantAction(formData: FormData) {
  const ctx = await requireAdminCapability("clients.access.request");
  const clientId = s(formData.get("client_id"));
  const provider = s(formData.get("provider")) as AccessProviderKey;
  await requestClientAccess({
    clientId,
    provider,
    label: opt(formData.get("label"), 120),
    notes: opt(formData.get("notes"), 1000),
    by: ctx.email,
  });
  redirect(back(clientId, "access"));
}

export async function requestApprovalAction(formData: FormData) {
  const ctx = await requireAdminCapability("clients.approvals.request");
  const clientId = s(formData.get("client_id"));
  const title = s(formData.get("title"), 200);
  if (!title) redirect(back(clientId, "approvals"));
  const taskId = opt(formData.get("task_id"));
  const attLabel = opt(formData.get("attachment_label"), 120);
  const attUrl = opt(formData.get("attachment_url"), 500);

  await requestClientApproval({
    clientId,
    title,
    kind: pick(formData.get("kind"), APPROVAL_KINDS, "other"),
    description: opt(formData.get("description"), 2000),
    previewUrl: opt(formData.get("preview_url"), 500),
    taskId,
    attachments: attLabel && attUrl ? [{ label: attLabel, url: attUrl }] : [],
    by: ctx.email,
  });
  redirect(back(clientId, "approvals"));
}

// ---------------------------------------------------------------------------
// Booked calls + guarantee
// ---------------------------------------------------------------------------

export async function addBookedCallAction(formData: FormData) {
  const ctx = await requireAdminCapability("clients.calls.log");
  const clientId = s(formData.get("client_id"));
  // Shared with the admin API (lib/client-sections-data.ts): the call, its activity line, the guarantee check.
  await logClientBookedCall(
    {
      client_id: clientId,
      external_id: opt(formData.get("external_id"), 200) ?? `manual-${Date.now().toString(36)}`,
      source: pick(formData.get("source"), CALL_SOURCES, "manual"),
      contact_name: opt(formData.get("contact_name"), 120),
      contact_phone: opt(formData.get("contact_phone"), 40),
      contact_email: opt(formData.get("contact_email"), 200),
      service_requested: opt(formData.get("service_requested"), 200),
      booked_at: iso(formData.get("booked_at")) ?? new Date().toISOString(),
      booked_for: iso(formData.get("booked_for")),
      status: pick(formData.get("status"), CALL_STATUSES, "booked"),
      notes: opt(formData.get("notes"), 1000),
      reviewed_by: ctx.email,
      reviewed_at: new Date().toISOString(),
    },
    ctx.email,
  );
  redirect(back(clientId, "calls"));
}

export async function updateBookedCallAction(formData: FormData) {
  const ctx = await requireAdminCapability("clients.calls.review");
  const clientId = s(formData.get("client_id"));
  const id = s(formData.get("call_id"));
  const qualified = s(formData.get("qualified")) !== "no";
  // Shared with the admin API: the update, the guarantee check, and closing the
  // CRM appointment's "needs reviewing" card (keyed by its external id).
  await saveBookedCallReview({
    callId: id,
    clientId,
    patch: {
      status: pick(formData.get("status"), CALL_STATUSES, "booked"),
      qualified,
      disqualified_reason: qualified ? null : pick(formData.get("disqualified_reason"), DQ_REASONS, "other"),
      notes: opt(formData.get("notes"), 1000),
      reviewed_by: ctx.email,
      reviewed_at: new Date().toISOString(),
    },
    by: ctx.email,
    externalId: opt(formData.get("external_id"), 200),
  });
  redirect(back(clientId, "calls"));
}

// ---------------------------------------------------------------------------
// CRM account mapping
// ---------------------------------------------------------------------------

// Their location and calendar ids are opaque alphanumeric strings. Anything
// else is a paste mistake, and a wrong id silently maps nobody.
const CRM_ID_RE = /^[A-Za-z0-9_-]{6,64}$/;

/**
 * Which CRM sub-account belongs to this client, and which of its calendars
 * count toward the guarantee.
 *
 * clients.crm, because it decides what counts toward a commercial promise.
 * An empty calendar list counts every appointment in the account; the owner
 * decided only calendars we built should count, so the form asks for them.
 */
export async function saveCrmLocationAction(formData: FormData) {
  const ctx = await requireAdminCapability("clients.crm");
  const clientId = s(formData.get("client_id"));
  if (!clientId) redirect("/admin/clients");
  const locationId = s(formData.get("location_id"), 64);
  const calendars = [...new Set(s(formData.get("calendar_ids"), 4000).split(/[\s,]+/).filter(Boolean))];

  if (locationId && !CRM_ID_RE.test(locationId)) redirect(`/admin/clients/${clientId}?e=crm_location#crm`);
  if (calendars.some((c) => !CRM_ID_RE.test(c))) redirect(`/admin/clients/${clientId}?e=crm_calendar#crm`);

  // Shared with the admin API (lib/client-sections-data.ts): the taken and own
  // checks, the unlink, the upsert, releasing held appointments, the activity line.
  const result = await saveClientCrmMapping({ clientId, locationId: locationId || null, calendarIds: calendars, by: ctx.email });
  if (!result.ok) {
    const code = result.reason === "own" ? "crm_own" : result.reason === "db" ? "crm_db" : "crm_taken";
    redirect(`/admin/clients/${clientId}?e=${code}#crm`);
  }
  redirect(`/admin/clients/${clientId}?saved=1#crm`);
}

// ---------------------------------------------------------------------------
// Team + notes
// ---------------------------------------------------------------------------

export async function addMemberAction(formData: FormData) {
  const ctx = await requireAdminCapability("clients.members");
  const clientId = s(formData.get("client_id"));
  const email = s(formData.get("email"), 200).toLowerCase();
  if (!email.includes("@")) redirect(`${back(clientId, "team")}?e=email`);
  const { invite } = await inviteMember({
    client_id: clientId,
    email,
    name: opt(formData.get("name"), 120),
    title: opt(formData.get("title"), 120),
    role: pick<MemberRole>(formData.get("role"), ["owner", "admin", "member"], "member"),
    invited_by: ctx.email,
    actor_type: "admin",
  });
  redirect(`${back(clientId, "team")}${invite.ok ? "" : "?e=invite"}`);
}

export async function resendInviteAction(formData: FormData) {
  const ctx = await requireAdminCapability("clients.members");
  const member = await getMemberById(s(formData.get("member_id")));
  if (!member) redirect("/admin/clients");
  // Shared with the admin API (lib/client-sections-data.ts): the email and its activity line.
  const result = await sendMemberLink(member, ctx.email);
  redirect(`${back(member.client_id, "team")}${result.ok ? "?invited=1" : "?e=invite"}`);
}

export async function setMemberStatusAction(formData: FormData) {
  const ctx = await requireAdminCapability("clients.members");
  const member = await getMemberById(s(formData.get("member_id")));
  if (!member) redirect("/admin/clients");
  const status = pick<MemberStatus>(formData.get("status"), ["invited", "active", "disabled"], member.status);
  const role = pick<MemberRole>(formData.get("role"), ["owner", "admin", "member"], member.role);
  await updateMember(member.id, { status, role });
  await logActivity({ client_id: member.client_id, actor_type: "admin", actor_email: ctx.email, event: "member.updated", entity_type: "member", entity_id: member.id, summary: `${member.email}: ${role}, ${status}` });
  redirect(back(member.client_id, "team"));
}

export async function addNoteAction(formData: FormData) {
  const ctx = await requireAdminCapability("clients.activity.write");
  const clientId = s(formData.get("client_id"));
  const text = s(formData.get("text"), 4000);
  if (!text) redirect(back(clientId, "activity"));
  const toClient = s(formData.get("kind")) === "update";
  // Shared with the admin API (lib/client-sections-data.ts): the activity row and, for an update, the client's notification.
  await postClientNote({
    clientId,
    kind: toClient ? "update" : "note",
    text,
    subject: toClient ? opt(formData.get("subject"), 200) : null,
    actionUrl: toClient ? opt(formData.get("action_url"), 300) : null,
    by: ctx.email,
  });
  redirect(back(clientId, "activity"));
}

// ---------------------------------------------------------------------------
// Templates (the master checklist)
// ---------------------------------------------------------------------------

export async function saveTemplateAction(formData: FormData) {
  await requireAdminCapability("clients.templates");
  const key = s(formData.get("key"), 100).toLowerCase().replace(/[^a-z0-9._-]+/g, "_");
  const title = s(formData.get("title"), 200);
  if (!key || !title) redirect("/admin/clients/templates?e=required");
  let payload: Record<string, unknown> = {};
  const raw = s(formData.get("payload"), 4000);
  if (raw) {
    try {
      payload = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      redirect("/admin/clients/templates?e=json");
    }
  }
  await upsertTemplate({
    key,
    title,
    description: opt(formData.get("description"), 1000),
    plan_ids: s(formData.get("plan_ids"), 200).split(",").map((x) => x.trim()).filter(Boolean),
    stage: pick(formData.get("stage"), TASK_STAGES, "build"),
    owner: pick<TaskOwner>(formData.get("owner"), ["client", "tekmadev"], "tekmadev"),
    kind: pick(formData.get("kind"), TASK_KINDS, "checklist"),
    required: formData.get("required") === "on",
    due_offset_days: num(formData.get("due_offset_days")),
    sort_order: num(formData.get("sort_order")) ?? 0,
    payload,
    active: formData.get("active") === "on",
  });
  redirect("/admin/clients/templates?saved=1");
}

export async function deleteTemplateAction(formData: FormData) {
  await requireAdminCapability("clients.templates");
  await deleteTemplate(s(formData.get("id")));
  redirect("/admin/clients/templates?deleted=1");
}
