"use server";

import { redirect } from "next/navigation";
import { requireAdmin, requireOwner } from "@/lib/admin";
import {
  createNotification,
  getClientById,
  getMemberById,
  logActivity,
  softDeleteClient,
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
  completeTaskByKey,
  createAccessGrant,
  createApproval,
  createBookedCall,
  createTask,
  deleteTemplate,
  getAccessGrant,
  getActiveOnboarding,
  getOnboardingById,
  getTaskById,
  guaranteeSummary,
  listBookedCalls,
  markIntakeReviewed,
  setOnboardingStage,
  setTaskStatus,
  updateAccessGrant,
  updateBookedCall,
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
import { accessProvider, type AccessProviderKey } from "@/lib/access-providers";
import { inviteMember, provisionClient, sendPortalInvite } from "@/lib/client-provisioning";

/**
 * Admin actions for client accounts. Managers can run onboarding; only the
 * owner can delete a client. Every write logs to the client's activity trail.
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
const TASK_KINDS: TaskKind[] = ["form", "upload", "access_grant", "approval", "esign", "call", "internal", "checklist"];
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
  const ctx = await requireAdmin();
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
  const ctx = await requireAdmin();
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
  const ctx = await requireOwner();
  const id = s(formData.get("client_id"));
  await softDeleteClient(id, ctx.email);
  redirect("/admin/clients?deleted=1");
}

/** Flip the account live: status, milestones, and the guarantee clock in one go. */
export async function goLiveAction(formData: FormData) {
  const ctx = await requireAdmin();
  const id = s(formData.get("client_id"));
  const client = await getClientById(id);
  if (!client) redirect("/admin/clients");
  const now = new Date().toISOString();

  await updateClient(
    id,
    {
      status: "live",
      live_at: client.live_at ?? now,
      guarantee_started_at: client.guarantee_eligible ? (client.guarantee_started_at ?? now) : client.guarantee_started_at,
      guarantee_status: client.guarantee_eligible ? "running" : "not_eligible",
    },
    ctx.email,
  );
  const onboarding = await getActiveOnboarding(id);
  if (onboarding) {
    await updateOnboarding(onboarding.id, { live_at: now, stage: "optimizing", stage_entered_at: now });
    await completeTaskByKey(onboarding.id, "go_live.clock_start", ctx.email);
    await completeTaskByKey(onboarding.id, "go_live.switch_on", ctx.email);
    await completeTaskByKey(onboarding.id, "go_live.publish", ctx.email);
  }
  await logActivity({
    client_id: id,
    actor_type: "admin",
    actor_email: ctx.email,
    event: "client.live",
    summary: client.guarantee_eligible ? "System live. Guarantee clock started." : "System live.",
    visibility: "client",
  });
  await createNotification({
    client_id: id,
    template_key: "go_live",
    subject: "You are live",
    body: client.guarantee_eligible
      ? `Everything is switched on. Your ${client.guarantee_window_days}-day guarantee window starts today.`
      : "Everything is switched on. Booked calls will start showing on your dashboard.",
    action_url: "/calls",
  });
  redirect(`${back(id)}?live=1`);
}

// ---------------------------------------------------------------------------
// Onboarding + tasks
// ---------------------------------------------------------------------------

export async function setStageAction(formData: FormData) {
  const ctx = await requireAdmin();
  const onboarding = await getOnboardingById(s(formData.get("onboarding_id")));
  if (!onboarding) redirect("/admin/clients");
  const stage = pick(formData.get("stage"), STAGES, onboarding.stage);
  await setOnboardingStage(onboarding.id, stage);
  await logActivity({
    client_id: onboarding.client_id,
    actor_type: "admin",
    actor_email: ctx.email,
    event: "onboarding.stage_changed",
    entity_type: "onboarding",
    entity_id: onboarding.id,
    summary: `Stage set to ${stage.replace("_", " ")}`,
    visibility: "client",
    data: { from: onboarding.stage, to: stage },
  });
  redirect(back(onboarding.client_id, "onboarding"));
}

export async function setBlockedAction(formData: FormData) {
  const ctx = await requireAdmin();
  const onboarding = await getOnboardingById(s(formData.get("onboarding_id")));
  if (!onboarding) redirect("/admin/clients");
  const blocked = formData.get("blocked") === "on";
  const reason = opt(formData.get("blocked_reason"), 500);
  await updateOnboarding(onboarding.id, { blocked, blocked_reason: blocked ? reason : null });
  await logActivity({
    client_id: onboarding.client_id,
    actor_type: "admin",
    actor_email: ctx.email,
    event: blocked ? "onboarding.blocked" : "onboarding.unblocked",
    entity_type: "onboarding",
    entity_id: onboarding.id,
    summary: blocked ? `Blocked: ${reason ?? "no reason given"}` : "Unblocked",
  });
  redirect(back(onboarding.client_id, "onboarding"));
}

export async function setOnboardingDatesAction(formData: FormData) {
  await requireAdmin();
  const onboarding = await getOnboardingById(s(formData.get("onboarding_id")));
  if (!onboarding) redirect("/admin/clients");
  await updateOnboarding(onboarding.id, {
    target_live_date: opt(formData.get("target_live_date"), 10),
    kickoff_at: iso(formData.get("kickoff_at")),
  });
  redirect(back(onboarding.client_id, "onboarding"));
}

export async function setTaskStatusAction(formData: FormData) {
  const ctx = await requireAdmin();
  const task = await getTaskById(s(formData.get("task_id")));
  if (!task) redirect("/admin/clients");
  const status = pick(formData.get("status"), TASK_STATUSES, task.status);
  if (status !== task.status) {
    await setTaskStatus(task.id, status, ctx.email);
    await logActivity({
      client_id: task.client_id,
      actor_type: "admin",
      actor_email: ctx.email,
      event: "task.status_changed",
      entity_type: "task",
      entity_id: task.id,
      summary: `"${task.title}" set to ${status.replace(/_/g, " ")}`,
      visibility: status === "done" ? "client" : "internal",
    });
  }
  redirect(back(task.client_id, "onboarding"));
}

export async function addTaskAction(formData: FormData) {
  const ctx = await requireAdmin();
  const onboarding = await getOnboardingById(s(formData.get("onboarding_id")));
  if (!onboarding) redirect("/admin/clients");
  const title = s(formData.get("title"), 200);
  if (!title) redirect(back(onboarding.client_id, "onboarding"));
  const task = await createTask({
    onboarding_id: onboarding.id,
    client_id: onboarding.client_id,
    title,
    description: opt(formData.get("description"), 1000),
    stage: pick(formData.get("stage"), TASK_STAGES, onboarding.stage === "complete" ? "optimizing" : (onboarding.stage as TaskStage)),
    owner: pick<TaskOwner>(formData.get("owner"), ["client", "tekmadev"], "tekmadev"),
    kind: pick(formData.get("kind"), TASK_KINDS, "checklist"),
    required: formData.get("required") === "on",
    due_at: iso(formData.get("due_at")),
  });
  await logActivity({
    client_id: onboarding.client_id,
    actor_type: "admin",
    actor_email: ctx.email,
    event: "task.created",
    entity_type: "task",
    entity_id: task.id,
    summary: `Task added: ${title}`,
    visibility: task.owner === "client" ? "client" : "internal",
  });
  if (task.owner === "client") {
    await createNotification({
      client_id: onboarding.client_id,
      template_key: "task_added",
      subject: `New to-do: ${title}`,
      body: task.description,
      action_url: "/onboarding",
    });
  }
  redirect(back(onboarding.client_id, "onboarding"));
}

export async function completeOnboardingAction(formData: FormData) {
  const ctx = await requireAdmin();
  const onboarding = await getOnboardingById(s(formData.get("onboarding_id")));
  if (!onboarding) redirect("/admin/clients");
  await setOnboardingStage(onboarding.id, "complete");
  await logActivity({
    client_id: onboarding.client_id,
    actor_type: "admin",
    actor_email: ctx.email,
    event: "onboarding.completed",
    entity_type: "onboarding",
    entity_id: onboarding.id,
    summary: "Onboarding complete",
    visibility: "client",
  });
  redirect(back(onboarding.client_id, "onboarding"));
}

// ---------------------------------------------------------------------------
// Intake, access, approvals
// ---------------------------------------------------------------------------

export async function markIntakeReviewedAction(formData: FormData) {
  const ctx = await requireAdmin();
  const clientId = s(formData.get("client_id"));
  await markIntakeReviewed(s(formData.get("intake_id")), ctx.email);
  await logActivity({ client_id: clientId, actor_type: "admin", actor_email: ctx.email, event: "intake.reviewed", summary: "Intake reviewed", visibility: "client" });
  redirect(back(clientId, "intake"));
}

export async function setAccessStatusAction(formData: FormData) {
  const ctx = await requireAdmin();
  const grant = await getAccessGrant(s(formData.get("grant_id")));
  if (!grant) redirect("/admin/clients");
  const status = pick(formData.get("status"), ACCESS_STATUSES, grant.status);
  const now = new Date().toISOString();
  const patch: Partial<AccessGrant> = { status, notes: opt(formData.get("notes"), 1000) ?? grant.notes };
  if (status === "granted" && !grant.granted_at) patch.granted_at = now;
  if (status === "verified") {
    patch.granted_at = grant.granted_at ?? now;
    patch.verified_at = now;
    patch.verified_by = ctx.email;
  }
  if (status === "revoked") patch.revoked_at = now;
  await updateAccessGrant(grant.id, patch);
  if (status === "verified" && grant.task_id) await setTaskStatus(grant.task_id, "done", ctx.email);
  if (status === "pending_client" && grant.task_id) await setTaskStatus(grant.task_id, "waiting_on_client", ctx.email);
  await logActivity({
    client_id: grant.client_id,
    actor_type: "admin",
    actor_email: ctx.email,
    event: `access.${status}`,
    entity_type: "access_grant",
    entity_id: grant.id,
    summary: `${grant.label ?? grant.provider}: ${status.replace(/_/g, " ")}`,
    visibility: status === "verified" || status === "pending_client" ? "client" : "internal",
  });
  redirect(back(grant.client_id, "access"));
}

export async function addAccessGrantAction(formData: FormData) {
  const ctx = await requireAdmin();
  const clientId = s(formData.get("client_id"));
  const provider = s(formData.get("provider")) as AccessProviderKey;
  const def = accessProvider(provider);
  const grant = await createAccessGrant({
    client_id: clientId,
    provider: def.key,
    method: def.method,
    label: opt(formData.get("label"), 120) ?? def.label,
    notes: opt(formData.get("notes"), 1000),
  });
  await logActivity({
    client_id: clientId,
    actor_type: "admin",
    actor_email: ctx.email,
    event: "access.requested",
    entity_type: "access_grant",
    entity_id: grant.id,
    summary: `Access requested: ${grant.label}`,
    visibility: "client",
  });
  await createNotification({ client_id: clientId, template_key: "access_requested", subject: `We need access: ${grant.label}`, body: def.summary, action_url: "/access" });
  redirect(back(clientId, "access"));
}

export async function requestApprovalAction(formData: FormData) {
  const ctx = await requireAdmin();
  const clientId = s(formData.get("client_id"));
  const title = s(formData.get("title"), 200);
  if (!title) redirect(back(clientId, "approvals"));
  const onboarding = await getActiveOnboarding(clientId);
  const taskId = opt(formData.get("task_id"));
  const attLabel = opt(formData.get("attachment_label"), 120);
  const attUrl = opt(formData.get("attachment_url"), 500);

  const approval = await createApproval({
    client_id: clientId,
    onboarding_id: onboarding?.id ?? null,
    task_id: taskId,
    kind: pick(formData.get("kind"), APPROVAL_KINDS, "other"),
    title,
    description: opt(formData.get("description"), 2000),
    preview_url: opt(formData.get("preview_url"), 500),
    attachments: attLabel && attUrl ? [{ label: attLabel, url: attUrl }] : [],
    requested_by: ctx.email,
  });
  if (taskId) await setTaskStatus(taskId, "waiting_on_client", ctx.email);
  await logActivity({
    client_id: clientId,
    actor_type: "admin",
    actor_email: ctx.email,
    event: "approval.requested",
    entity_type: "approval",
    entity_id: approval.id,
    summary: `Approval requested: ${title} (v${approval.version})`,
    visibility: "client",
  });
  await createNotification({ client_id: clientId, template_key: "approval_requested", subject: `Please review: ${title}`, body: approval.description, action_url: "/approvals" });
  redirect(back(clientId, "approvals"));
}

// ---------------------------------------------------------------------------
// Booked calls + guarantee
// ---------------------------------------------------------------------------

async function refreshGuaranteeStatus(clientId: string, by: string) {
  const client = await getClientById(clientId);
  if (!client || !client.guarantee_eligible || client.guarantee_status !== "running") return;
  const calls = await listBookedCalls(clientId, 2000);
  const g = guaranteeSummary(client, calls);
  if (g.counted >= g.target) {
    await updateClient(clientId, { guarantee_status: "met", guarantee_met_at: new Date().toISOString() }, by);
    await logActivity({ client_id: clientId, actor_type: "system", event: "guarantee.met", summary: `Guarantee met: ${g.counted} booked calls`, visibility: "client" });
    await createNotification({ client_id: clientId, template_key: "guarantee_met", subject: "Guarantee hit", body: `${g.counted} qualified booked calls. Now we keep going.`, action_url: "/calls" });
  }
}

export async function addBookedCallAction(formData: FormData) {
  const ctx = await requireAdmin();
  const clientId = s(formData.get("client_id"));
  const call = await createBookedCall({
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
  });
  await logActivity({ client_id: clientId, actor_type: "admin", actor_email: ctx.email, event: "call.added", entity_type: "booked_call", entity_id: call.id, summary: `Booked call added: ${call.contact_name ?? "unknown"}` });
  await refreshGuaranteeStatus(clientId, ctx.email);
  redirect(back(clientId, "calls"));
}

export async function updateBookedCallAction(formData: FormData) {
  const ctx = await requireAdmin();
  const clientId = s(formData.get("client_id"));
  const id = s(formData.get("call_id"));
  const qualified = s(formData.get("qualified")) !== "no";
  await updateBookedCall(id, {
    status: pick(formData.get("status"), CALL_STATUSES, "booked"),
    qualified,
    disqualified_reason: qualified ? null : pick(formData.get("disqualified_reason"), DQ_REASONS, "other"),
    notes: opt(formData.get("notes"), 1000),
    reviewed_by: ctx.email,
    reviewed_at: new Date().toISOString(),
  });
  await refreshGuaranteeStatus(clientId, ctx.email);
  redirect(back(clientId, "calls"));
}

// ---------------------------------------------------------------------------
// Team + notes
// ---------------------------------------------------------------------------

export async function addMemberAction(formData: FormData) {
  const ctx = await requireAdmin();
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
  const ctx = await requireAdmin();
  const member = await getMemberById(s(formData.get("member_id")));
  if (!member) redirect("/admin/clients");
  const result = await sendPortalInvite(member.email, member.name);
  await logActivity({
    client_id: member.client_id,
    actor_type: "admin",
    actor_email: ctx.email,
    event: result.ok ? "member.invite_resent" : "member.invite_failed",
    entity_type: "member",
    entity_id: member.id,
    summary: result.ok ? `Invite re-sent to ${member.email}` : `Invite failed: ${result.error}`,
  });
  redirect(`${back(member.client_id, "team")}${result.ok ? "?invited=1" : "?e=invite"}`);
}

export async function setMemberStatusAction(formData: FormData) {
  const ctx = await requireAdmin();
  const member = await getMemberById(s(formData.get("member_id")));
  if (!member) redirect("/admin/clients");
  const status = pick<MemberStatus>(formData.get("status"), ["invited", "active", "disabled"], member.status);
  const role = pick<MemberRole>(formData.get("role"), ["owner", "admin", "member"], member.role);
  await updateMember(member.id, { status, role });
  await logActivity({ client_id: member.client_id, actor_type: "admin", actor_email: ctx.email, event: "member.updated", entity_type: "member", entity_id: member.id, summary: `${member.email}: ${role}, ${status}` });
  redirect(back(member.client_id, "team"));
}

export async function addNoteAction(formData: FormData) {
  const ctx = await requireAdmin();
  const clientId = s(formData.get("client_id"));
  const text = s(formData.get("text"), 4000);
  if (!text) redirect(back(clientId, "activity"));
  const toClient = s(formData.get("kind")) === "update";
  await logActivity({
    client_id: clientId,
    actor_type: "admin",
    actor_email: ctx.email,
    event: toClient ? "update.sent" : "note",
    summary: text,
    visibility: toClient ? "client" : "internal",
  });
  if (toClient) {
    await createNotification({ client_id: clientId, template_key: "update", subject: opt(formData.get("subject"), 200) ?? "Update from Tekmadev", body: text, action_url: opt(formData.get("action_url"), 300) });
  }
  redirect(back(clientId, "activity"));
}

// ---------------------------------------------------------------------------
// Templates (the master checklist)
// ---------------------------------------------------------------------------

export async function saveTemplateAction(formData: FormData) {
  await requireOwner();
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
  await requireOwner();
  await deleteTemplate(s(formData.get("id")));
  redirect("/admin/clients/templates?deleted=1");
}
