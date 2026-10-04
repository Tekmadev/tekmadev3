import { badRequest, businessRule, conflict, dbError, isUuid, notFound, requireDb, unavailable, type ApiContext } from "@/lib/admin-api";
import { StaffDataNotReady, creditClientFromLead } from "@/lib/staff-credit";
import { loadGuarantee, type ApiGuarantee } from "@/lib/admin-api/clients/sections";
import { provisionClient } from "@/lib/client-provisioning";
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
import { getClientByEmail, logActivity, updateClient, updateMember, type Client, type ClientMember } from "@/lib/clients-data";
import {
  deleteTemplate,
  isTaskOpen,
  setTaskStatus,
  updateOnboarding,
  upsertTemplate,
  type ClientIntake,
  type ClientOnboarding,
  type OnboardingTask,
  type OnboardingTaskTemplate,
} from "@/lib/onboarding-data";
import { dateToStored, storedDate } from "./dates";
import {
  CLIENT_STATUSES,
  COUNT_RULES,
  EDITABLE_CLIENT_STATUSES,
  PLAN_IDS,
  SETTABLE_GUARANTEE_STATUSES,
  STAGES,
  TASK_KINDS,
  TASK_OWNERS,
  TASK_STATUSES,
  guaranteeStatusToApp,
  guaranteeStatusToDb,
  isOneOf,
  stageIndex,
  taskKindToDb,
  taskStatusToDb,
  type AppPlanId,
  type AppTaskStage,
} from "./enums";
import { clientStatuses, planHasGuarantee } from "./labels";
import {
  clientView,
  latestRunOf,
  listMembersOf,
  peopleFor,
  readClient,
  readRun,
  runView,
  tasksOfRun,
} from "./load";
import { contactNameOf, toIntake, toRun, toTask, toTemplate, type ApiClient, type ApiIntake, type ApiRun, type ApiTask, type ApiTemplate, type JsonValue } from "./serialize";
import { EMAIL, FieldCheck, INPUT, isEmail, isTimeZone, type JsonObject } from "./validate";

/**
 * The clients domain writes behind the routes. Each one validates the body the
 * way the contract documents it (docs/api-requests/clients.md), then calls the
 * same lib functions as the web admin (lib/client-ops.ts, lib/clients-data.ts,
 * lib/onboarding-data.ts, lib/client-provisioning.ts), and answers with the
 * recomputed entity.
 */

export const REQUIRED = "Business name and a valid email are required.";
export const EMAIL_TAKEN = "Another client already uses that email.";
export const LEAD_GONE = "That lead no longer exists.";
export const LEAD_CONVERTED = "That lead is already a client. Open it from the lead.";
export const RUN_COMPLETE = "This onboarding is complete. A completed run cannot be reopened.";

const label = (list: readonly { value: string; label: string }[], value: string) => list.find((o) => o.value === value)?.label ?? value;

/** `ilike` treats % and _ as wildcards: escape them for an exact, case-insensitive match. */
const likeExact = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

/* ------------------------------------------------------------------ */
/* POST /clients                                                       */
/* ------------------------------------------------------------------ */

export type CreateClientOutcome = { client: ApiClient; reused: boolean; invite: "sent" | "failed" | "skipped" };

type SourceLead = { id: string; found_by: string | null; booked_by: string | null };

/**
 * The lead a client is created from (POST /clients `leadId`), with who found
 * and booked it. Null with no `leadId`. 400 `lead_id` when it does not exist,
 * 409 `lead_converted` when another client already came from it.
 */
async function sourceLeadFor(ctx: ApiContext, leadId: string | null | undefined, email: string): Promise<SourceLead | null> {
  if (!leadId) return null;
  ctx.require("leads.convert");
  const db = requireDb();
  if (!isUuid(leadId)) throw badRequest("lead_id", LEAD_GONE, { leadId: LEAD_GONE });
  let lead = await db.from("leads").select("id,found_by,booked_by").eq("id", leadId).maybeSingle();
  // Before the staff management migration: the lead still links, with nobody to credit.
  if (lead.error && /found_by|booked_by/.test(lead.error.message ?? "")) {
    lead = await db.from("leads").select("id").eq("id", leadId).maybeSingle();
  }
  if (lead.error) throw dbError("source lead read", lead.error);
  const row = lead.data as { id: string; found_by?: string | null; booked_by?: string | null } | null;
  if (!row) throw badRequest("lead_id", LEAD_GONE, { leadId: LEAD_GONE });

  // One lead, one client: another (not trashed) client already made from it is a 409.
  const { data: others, error } = await db.from("clients").select("id,primary_email,is_test").eq("lead_id", leadId).is("deleted_at", null);
  if (error) throw dbError("lead client read", error);
  const other = ((others ?? []) as { id: string; primary_email: string | null; is_test: boolean | null }[]).find(
    (c) => (c.primary_email ?? "").trim().toLowerCase() !== email,
  );
  if (other) throw conflict("lead_converted", LEAD_CONVERTED, { leadId: LEAD_CONVERTED });
  return { id: row.id, found_by: row.found_by ?? null, booked_by: row.booked_by ?? null };
}

/**
 * Links a client to the lead it came from (when it has no lead yet) and
 * gives it the lead's default credits (when it has none yet). Credits are a
 * bonus on top of the create: before the staff management migration, or on a
 * failed write, the client is still created and the failure is logged.
 */
async function linkSourceLead(ctx: ApiContext, client: Client, lead: SourceLead): Promise<Client> {
  let linked = client;
  if (!client.lead_id) linked = await updateClient(client.id, { lead_id: lead.id }, ctx.email);
  try {
    await creditClientFromLead({ clientId: client.id, leadId: lead.id, foundBy: lead.found_by, bookedBy: lead.booked_by, by: ctx.email });
  } catch (err) {
    if (err instanceof StaffDataNotReady) console.warn("[admin-api] client created without credits: the staff management migration is not applied");
    else console.error("[admin-api] default credits failed", err instanceof Error ? err.message : String(err));
  }
  return linked;
}

/**
 * New client by hand. One client per email: an existing live client with the
 * email is reused and updated (business name, and contact name, phone, plan,
 * strategist when sent). A test client with the email is the owner's to reuse;
 * for anyone else the email is taken (409). Provisioning is the website's own
 * (lib/client-provisioning.ts): the client row, its owner login, the checklist
 * run from the plan's active templates, and the portal invite when asked.
 *
 * `leadId` ("Create client from this lead", docs/admin-api/staff.md) links the
 * client to that lead and copies the lead's finder and booker to the client's
 * credits with the default split (only when it has none yet).
 */
export async function createClientByStaff(ctx: ApiContext, body: JsonObject): Promise<CreateClientOutcome> {
  const check = new FieldCheck(body);
  const businessName = check.required("businessName", "required", REQUIRED, "Enter the business name.", 200);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!isEmail(email) || email.length > 200) check.add("email", "required", REQUIRED, EMAIL);
  const name = check.text("name", 120);
  const phone = check.text("phone", 40);
  const planId = check.oneOf("planId", PLAN_IDS, "Pick a plan from the list.", true);
  const strategist = check.email("assignedStrategist", 200);
  const sendInvite = check.flag("sendInvite");
  const leadId = check.text("leadId", 64);
  check.done();
  if (!businessName) throw badRequest("required", REQUIRED, { businessName: "Enter the business name." });

  const live = await getClientByEmail(email, false);
  const test = live ? null : await getClientByEmail(email, true);
  // Never reveal or touch a test client for someone who cannot see test data.
  if (test && !ctx.can("testdata.view")) throw conflict("email_taken", EMAIL_TAKEN, { email: EMAIL_TAKEN });
  const existing = live ?? test;
  const sourceLead = await sourceLeadFor(ctx, leadId, email);

  const result = await provisionClient({
    client_id: existing?.id ?? null,
    business_name: businessName,
    email,
    name: name ?? null,
    phone: phone ?? null,
    plan_id: planId ?? null,
    lead_id: sourceLead?.id ?? null,
    actor_type: "admin",
    actor_email: ctx.email,
    send_invite: sendInvite === true,
    is_test: existing ? Boolean(existing.is_test) : false,
  });

  let client = result.client;
  if (sourceLead) client = await linkSourceLead(ctx, client, sourceLead);
  const reused = !result.createdClient;
  if (reused) {
    const patch: Partial<Client> = {};
    if (businessName !== client.business_name) patch.business_name = businessName;
    if (phone && phone !== client.primary_phone) patch.primary_phone = phone;
    if (planId && planId !== client.plan_id) {
      patch.plan_id = planId;
      patch.guarantee_eligible = planHasGuarantee(planId);
    }
    if (strategist && strategist !== client.assigned_strategist) patch.assigned_strategist = strategist;
    if (Object.keys(patch).length) client = await updateClient(client.id, patch, ctx.email);
    if (name && result.member.name !== name) await updateMember(result.member.id, { name });
    await logActivity({
      client_id: client.id,
      actor_type: "admin",
      actor_email: ctx.email,
      event: "client.updated",
      entity_type: "client",
      entity_id: client.id,
      summary: "Added again by hand: the existing client was updated.",
    });
  } else if (strategist) {
    client = await updateClient(client.id, { assigned_strategist: strategist }, ctx.email);
  }

  const invite = result.invite === null ? "skipped" : result.invite.ok ? "sent" : "failed";
  return { client: await clientView(client), reused, invite };
}

/* ------------------------------------------------------------------ */
/* PATCH /clients/:id                                                  */
/* ------------------------------------------------------------------ */

/**
 * Account fields and guarantee terms: only what is sent changes, null clears.
 * A plan change makes `guaranteeEligible` follow the new plan unless the same
 * request sets it. The contact name lives on the client's own portal login.
 */
export async function patchClient(ctx: ApiContext, client: Client, body: JsonObject): Promise<ApiClient> {
  const check = new FieldCheck(body);

  let businessName: string | undefined;
  if (check.has("businessName")) businessName = check.required("businessName", "required", REQUIRED, "Enter the business name.", 200);
  let primaryEmail: string | undefined;
  if (check.has("primaryEmail")) {
    const raw = typeof body.primaryEmail === "string" ? body.primaryEmail.trim().toLowerCase() : "";
    if (!isEmail(raw) || raw.length > 200) check.add("primaryEmail", "required", REQUIRED, EMAIL);
    else primaryEmail = raw;
  }
  const legalName = check.text("legalName", 200);
  const website = check.url("website", 300);
  const contactName = check.text("contactName", 120);
  const phone = check.text("phone", 40);
  const industry = check.text("industry", 100);
  const serviceArea = check.text("serviceArea", 1000);
  const internalNotes = check.text("internalNotes", 10000);
  const strategist = check.email("assignedStrategist", 200);

  let status = check.oneOf("status", CLIENT_STATUSES, "Pick a status from the list.");
  // A lead becomes a client through checkout, not by hand (unless it already is one).
  if (status && !EDITABLE_CLIENT_STATUSES.includes(status) && status !== client.status) {
    check.add("status", "input", INPUT, "Pick a status from the list.");
    status = undefined;
  }
  const planId = check.oneOf("planId", PLAN_IDS, "Pick a plan from the list.", true);

  let timezone: string | undefined;
  if (check.has("timezone")) {
    const raw = typeof body.timezone === "string" ? body.timezone.trim() : "";
    if (!raw || raw.length > 60 || !isTimeZone(raw)) check.add("timezone", "input", INPUT, "Enter a time zone like America/Toronto.");
    else timezone = raw;
  }
  const liveDate = check.date("liveDate");
  const clockStartedOn = check.date("guaranteeClockStartedOn");
  const eligible = check.flag("guaranteeEligible");
  const target = check.int("guaranteeTarget", 1, 1000, "Enter a whole number of 1 or more.");
  const windowDays = check.int("guaranteeWindowDays", 1, 365, "Enter a number of days from 1 to 365.");
  const countRule = check.oneOf("guaranteeCountRule", COUNT_RULES, "Pick booked or showed.");
  const guaranteeStatus = check.oneOf("guaranteeStatus", SETTABLE_GUARANTEE_STATUSES, "Pick a guarantee status from the list.");
  check.done();

  // One client per email: that is what makes "reuse by email" on create work.
  if (primaryEmail && primaryEmail !== client.primary_email.toLowerCase()) {
    const { data, error } = await requireDb()
      .from("clients")
      .select("id")
      .ilike("primary_email", likeExact(primaryEmail))
      .is("deleted_at", null)
      .neq("id", client.id)
      .limit(1);
    if (error) throw dbError("client email check", error);
    if ((data ?? []).length > 0) throw conflict("email_taken", EMAIL_TAKEN, { primaryEmail: EMAIL_TAKEN });
  }

  const patch: Partial<Client> = {};
  const changed: string[] = [];
  const set = <K extends keyof Client>(key: K, value: Client[K] | undefined, what: string) => {
    if (value === undefined || value === client[key]) return;
    patch[key] = value;
    changed.push(what);
  };
  set("business_name", businessName, "business name");
  set("primary_email", primaryEmail, "primary email");
  set("legal_name", legalName, "legal name");
  set("website_url", website, "website");
  set("primary_phone", phone, "phone");
  set("industry", industry, "industry");
  set("service_area", serviceArea, "service area");
  set("internal_notes", internalNotes, "internal notes");
  set("assigned_strategist", strategist, "strategist");
  set("status", status ?? undefined, "status");
  if (planId !== undefined && planId !== client.plan_id) {
    set("plan_id", planId, "plan");
    // Guarantee terms follow the plan unless this same request set them.
    if (eligible === undefined) patch.guarantee_eligible = planHasGuarantee(planId);
  }
  set("timezone", timezone, "time zone");
  if (liveDate !== undefined && liveDate !== storedDate(client.live_at)) {
    patch.live_at = liveDate === null ? null : dateToStored(liveDate);
    changed.push("live date");
  }
  if (clockStartedOn !== undefined && clockStartedOn !== storedDate(client.guarantee_started_at)) {
    patch.guarantee_started_at = clockStartedOn === null ? null : dateToStored(clockStartedOn);
    changed.push("guarantee clock");
  }
  set("guarantee_eligible", eligible, "guarantee eligibility");
  set("guarantee_target", target ?? undefined, "guarantee target");
  set("guarantee_window_days", windowDays ?? undefined, "guarantee window");
  set("guarantee_count_rule", countRule ?? undefined, "count rule");
  // Only a real change: an `extended` guarantee reads as running and must not be rewritten by an untouched form.
  if (guaranteeStatus && guaranteeStatus !== guaranteeStatusToApp(client.guarantee_status)) {
    patch.guarantee_status = guaranteeStatusToDb(guaranteeStatus) ?? client.guarantee_status;
    changed.push("guarantee status");
  }

  let updated = client;
  if (Object.keys(patch).length > 0) updated = await updateClient(client.id, patch, ctx.email);

  let members: ClientMember[] = await listMembersOf(client.id);
  if (contactName !== undefined && contactName !== contactNameOf(updated, members)) {
    await saveContactName(updated, members, contactName);
    members = await listMembersOf(client.id);
    changed.push("contact name");
  }

  if (changed.length > 0) {
    if (updated.status !== client.status) {
      await logActivity({
        client_id: client.id,
        actor_type: "admin",
        actor_email: ctx.email,
        event: "client.status",
        entity_type: "client",
        entity_id: client.id,
        summary: `Status changed to ${label(clientStatuses, updated.status)}.`,
      });
    }
    const rest = changed.filter((w) => w !== "status");
    if (rest.length > 0) {
      await logActivity({
        client_id: client.id,
        actor_type: "admin",
        actor_email: ctx.email,
        event: "client.updated",
        entity_type: "client",
        entity_id: client.id,
        summary: `Account updated: ${rest.join(", ")}.`,
      });
    }
  }
  return clientView(updated, members);
}

/**
 * The contact name is the name on the client's own portal login (the member
 * with the primary email). Without one, it is kept on the account's metadata.
 */
async function saveContactName(client: Client, members: readonly ClientMember[], name: string | null): Promise<void> {
  const primary = client.primary_email.toLowerCase();
  const own = members.find((m) => m.email.toLowerCase() === primary);
  if (own) {
    await updateMember(own.id, { name });
    return;
  }
  await updateClient(client.id, { metadata: { ...(client.metadata ?? {}), contact_name: name } });
}

/* ------------------------------------------------------------------ */
/* Go live and trash                                                   */
/* ------------------------------------------------------------------ */

export function careRequiredMessage(productName: string, careName: string): string {
  return `${productName} needs an active ${careName} plan before the site goes live, and this client does not have one. Start ${careName} first, or go live without it.`;
}

/**
 * POST /clients/:id/go-live: 409 `already_live`, 422 `care_required` (offer
 * `override: true`). Status live, live date today, the guarantee clock starts
 * today for eligible clients unless it started before or is waived, and an
 * open run at an earlier stage moves to optimizing.
 */
export async function goLiveByStaff(ctx: ApiContext, client: Client, override: boolean): Promise<{ client: ApiClient; guarantee: ApiGuarantee }> {
  if (client.status === "live") throw conflict("already_live", "This client is already live.");
  const outcome = await goLiveClient(client, { by: ctx.email, override, strict: true });
  if (!outcome.ok) throw businessRule("care_required", careRequiredMessage(outcome.missing.productName, outcome.missing.careName));
  const [view, guarantee] = await Promise.all([clientView(outcome.client), loadGuarantee(outcome.client)]);
  return { client: view, guarantee };
}

/** DELETE /clients/:id (owner): the soft delete the web admin does, answered with the trashed client. */
export async function trashByStaff(ctx: ApiContext, client: Client): Promise<ApiClient> {
  const trashed = await trashClient(client, client.id, ctx.email);
  const row = trashed ?? (await readClient(client.id));
  if (!row.deleted_at) throw unavailable();
  return clientView(row);
}

/* ------------------------------------------------------------------ */
/* Onboarding runs and tasks                                           */
/* ------------------------------------------------------------------ */

const runComplete = () => conflict("run_complete", RUN_COMPLETE);

/**
 * PATCH /onboardings/:id. `stage: "complete"` completes the run for good.
 * Blocking keeps the old reason unless a new one is sent; unblocking clears
 * it. Dates change only when sent.
 */
export async function patchRun(ctx: ApiContext, found: { run: ClientOnboarding; client: Client }, body: JsonObject): Promise<ApiRun> {
  let run = found.run;
  if (run.completed_at) throw runComplete();
  const check = new FieldCheck(body);
  const stage = check.oneOf("stage", STAGES, "Pick a stage from the list.");
  const blocked = check.flag("blocked");
  const blockedReason = check.text("blockedReason", 500);
  const targetLiveDate = check.date("targetLiveDate");
  const kickoffAt = check.instant("kickoffAt");
  check.done();

  if (stage === "complete") return runView(await completeOnboardingRun(run, ctx.email));
  if (stage && stage !== run.stage) run = await changeOnboardingStage(run, stage, ctx.email);

  if (blocked === true) {
    const reason = blockedReason !== undefined ? blockedReason : run.blocked_reason;
    if (!run.blocked || (blockedReason !== undefined && blockedReason !== run.blocked_reason)) run = await setOnboardingBlocked(run, true, reason, ctx.email);
  } else if (blocked === false) {
    if (run.blocked) run = await setOnboardingBlocked(run, false, null, ctx.email);
    else if (run.blocked_reason) run = await updateOnboarding(run.id, { blocked_reason: null });
  } else if (blockedReason !== undefined && blockedReason !== run.blocked_reason) {
    run = await updateOnboarding(run.id, { blocked_reason: blockedReason });
  }

  const dates: Partial<ClientOnboarding> = {};
  const details: string[] = [];
  if (targetLiveDate !== undefined && targetLiveDate !== (run.target_live_date ? run.target_live_date.slice(0, 10) : null)) {
    dates.target_live_date = targetLiveDate;
    details.push("target go-live");
  }
  // Compared as moments: "...00.000Z" and "...00+00:00" are the same kickoff.
  const storedKickoff = run.kickoff_at;
  const sameKickoff =
    kickoffAt === storedKickoff || (typeof kickoffAt === "string" && typeof storedKickoff === "string" && Date.parse(kickoffAt) === Date.parse(storedKickoff));
  if (kickoffAt !== undefined && !sameKickoff) {
    dates.kickoff_at = kickoffAt;
    details.push("kickoff");
  }
  if (details.length > 0) {
    run = await updateOnboarding(run.id, dates);
    await logActivity({
      client_id: run.client_id,
      actor_type: "admin",
      actor_email: ctx.email,
      event: "onboarding.updated",
      entity_type: "onboarding",
      entity_id: run.id,
      summary: `Onboarding updated: ${details.join(", ")}.`,
    });
  }
  return runView(run);
}

/** POST /onboardings/:id/complete: irreversible. */
export async function completeRunByStaff(ctx: ApiContext, run: ClientOnboarding): Promise<ApiRun> {
  if (run.completed_at) throw runComplete();
  return runView(await completeOnboardingRun(run, ctx.email));
}

/**
 * POST /onboardings/:id/tasks. Defaults: the run's derived stage, owner
 * Tekmadev, kind general (a checklist item), not required. A client-owned task
 * shows in the client's portal.
 */
export async function addTaskToRun(ctx: ApiContext, found: { run: ClientOnboarding; client: Client }, body: JsonObject): Promise<{ task: ApiTask; run: ApiRun }> {
  const { run, client } = found;
  if (run.completed_at) throw runComplete();
  const check = new FieldCheck(body);
  const rawTitle = typeof body.title === "string" ? body.title.trim() : "";
  if (!rawTitle) check.add("title", "title", "Enter a task title.");
  else if (rawTitle.length > 200) check.add("title", "title", "Keep the title under 200 characters.");
  const description = check.text("description", 1000);
  const stage = check.oneOf("stage", STAGES, "Pick a stage from the list.");
  if (stage === "complete") check.add("stage", "input", INPUT, "Tasks cannot be added to the Complete stage.");
  const owner = check.oneOf("owner", TASK_OWNERS, "Pick Client or Tekmadev.");
  const kind = check.oneOf("kind", TASK_KINDS, "Pick a kind from the list.");
  const required = check.flag("required");
  const dueAt = check.instant("dueAt");
  check.done();

  const current = toRun(run, await tasksOfRun(run.id));
  const fallback: AppTaskStage = current.derivedStage === "complete" ? "optimizing" : current.derivedStage;
  const taskStage: AppTaskStage = stage && stage !== "complete" ? stage : fallback;
  const task = await addTaskByStaff(
    run,
    {
      title: rawTitle,
      description: description ?? null,
      stage: taskStage,
      owner: owner ?? "tekmadev",
      kind: taskKindToDb(kind ?? "general"),
      required: required ?? false,
      due_at: dueAt ?? null,
    },
    ctx.email,
  );
  const [people, view] = await Promise.all([peopleFor(ctx, client.id), runView(run)]);
  return { task: toTask(task, people), run: view };
}

/** PATCH /tasks/:id { status }: the task and its recomputed run. */
export async function setTaskStatusFromApp(
  ctx: ApiContext,
  found: { task: OnboardingTask; run: ClientOnboarding; client: Client },
  body: JsonObject,
): Promise<{ task: ApiTask; run: ApiRun }> {
  const { task, run, client } = found;
  if (run.completed_at) throw runComplete();
  const status = body.status;
  if (!isOneOf(TASK_STATUSES, status)) throw badRequest("status", "Pick a status from the list.", { status: "Pick a status from the list." });
  const updated = await setTaskStatusByStaff(task, taskStatusToDb(status), ctx.email);
  const [people, view] = await Promise.all([peopleFor(ctx, client.id), runView(await readRun(run.id))]);
  return { task: toTask(updated, people), run: view };
}

/* ------------------------------------------------------------------ */
/* Intake                                                              */
/* ------------------------------------------------------------------ */

/**
 * Checklist tasks that stand for "review the intake". The website's default
 * checklist has none; a template with one of these keys is closed when the
 * intake is marked reviewed (the app contract asks for it).
 */
export const INTAKE_REVIEW_TASK_KEYS: readonly string[] = ["intake.review", "intake.review_intake", "review-intake"];

/** POST /intakes/:id/review: only a submitted intake; also closes the open "review the intake" task. */
export async function reviewIntakeFromApp(ctx: ApiContext, found: { intake: ClientIntake; client: Client }): Promise<ApiIntake> {
  const { intake, client } = found;
  if (intake.status !== "submitted") {
    throw conflict("not_submitted", intake.status === "reviewed" ? "This intake is already reviewed." : "Only a submitted intake can be marked reviewed.");
  }
  await reviewIntakeByStaff(intake.id, client.id, ctx.email);

  const run = await latestRunOf(client.id);
  if (run && !run.completed_at) {
    const tasks = await tasksOfRun(run.id);
    for (const t of tasks) {
      if (INTAKE_REVIEW_TASK_KEYS.includes(t.key) && isTaskOpen(t)) await setTaskStatus(t.id, "done", ctx.email);
    }
  }

  const { data, error } = await requireDb().from("client_intakes").select("*").eq("id", intake.id).maybeSingle();
  if (error) throw dbError("intake read", error);
  const reviewed = data as ClientIntake | null;
  // The shared write does not report failures: check that it landed.
  if (!reviewed || reviewed.status !== "reviewed") throw unavailable("Could not save that just now. Nothing changed. Try again.");
  return toIntake(reviewed, await peopleFor(ctx, client.id));
}

/* ------------------------------------------------------------------ */
/* Checklist templates (owner)                                         */
/* ------------------------------------------------------------------ */

export const TEMPLATE_KEY_MESSAGE = "Use lowercase letters, numbers and dashes for the key.";
/** New keys: lowercase words joined by dashes (the website's own keys also use dots and underscores, so those are accepted too). */
const TEMPLATE_KEY_RE = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const JSON_MESSAGE = "Payload must be valid JSON.";

const templateStageOrder = (t: OnboardingTaskTemplate) => (isOneOf(STAGES, t.stage) ? stageIndex(t.stage) : STAGES.length);

/** GET /onboarding-templates: every template, in stage then sort order. */
export async function listTemplatesForApp(): Promise<ApiTemplate[]> {
  const { data, error } = await requireDb().from("onboarding_task_templates").select("*");
  if (error) throw dbError("templates read", error);
  return ((data ?? []) as OnboardingTaskTemplate[])
    .sort((a, b) => templateStageOrder(a) - templateStageOrder(b) || a.sort_order - b.sort_order || a.key.localeCompare(b.key))
    .map(toTemplate);
}

async function templateByKey(key: string): Promise<OnboardingTaskTemplate | null> {
  const { data, error } = await requireDb().from("onboarding_task_templates").select("*").eq("key", key).maybeSingle();
  if (error) throw dbError("template read", error);
  return (data as OnboardingTaskTemplate | null) ?? null;
}

/**
 * PUT /onboarding-templates/:key: create or update. For a new key, title,
 * stage, owner and kind are required; on an existing key, missing fields keep
 * their values. `payload` may be the JSON editor's raw text (400 `json` when it
 * does not parse) or a JSON value. Changes apply to new runs only.
 */
export async function saveTemplateFromApp(key: string, body: JsonObject): Promise<{ template: ApiTemplate; created: boolean }> {
  const existing = key && key.length <= 100 ? await templateByKey(key) : null;
  if (!existing && (!TEMPLATE_KEY_RE.test(key) || key.length > 100)) {
    throw badRequest("key", TEMPLATE_KEY_MESSAGE, { key: TEMPLATE_KEY_MESSAGE });
  }

  const check = new FieldCheck(body);
  let title: string | undefined;
  if (check.has("title") || !existing) {
    const raw = typeof body.title === "string" ? body.title.trim() : "";
    if (!raw) check.add("title", "title", "Enter a title.");
    else if (raw.length > 200) check.add("title", "title", "Keep the title under 200 characters.");
    else title = raw;
  }
  const stage = check.oneOf("stage", STAGES, "Pick a stage from the list.");
  if (stage === "complete") check.add("stage", "input", INPUT, "A template cannot sit in the Complete stage.");
  const owner = check.oneOf("owner", TASK_OWNERS, "Pick Client or Tekmadev.");
  const kind = check.oneOf("kind", TASK_KINDS, "Pick a kind from the list.");
  if (!existing) {
    if (!check.has("stage")) check.add("stage", "input", INPUT, "Pick a stage from the list.");
    if (!check.has("owner")) check.add("owner", "input", INPUT, "Pick Client or Tekmadev.");
    if (!check.has("kind")) check.add("kind", "input", INPUT, "Pick a kind from the list.");
  }
  let plans: AppPlanId[] | undefined;
  if (check.has("plans")) {
    const raw = body.plans;
    if (!Array.isArray(raw) || raw.some((p) => !isOneOf(PLAN_IDS, p))) check.add("plans", "input", INPUT, "Pick plans from the list.");
    else plans = Array.from(new Set(raw.filter((p): p is AppPlanId => isOneOf(PLAN_IDS, p))));
  }
  const dueOffsetDays = check.int("dueOffsetDays", 0, 365, "Enter a whole number of days, 0 or more.", true);
  const sortOrder = check.int("sortOrder", -10000, 10000, "Enter a whole number.");
  const description = check.text("description", 1000);
  const required = check.flag("required");
  const active = check.flag("active");

  // The JSON editor sends its raw text; a parsed value is taken as it is.
  let payload: JsonValue | undefined;
  if (check.has("payload")) {
    const raw = body.payload;
    if (typeof raw === "string") {
      if (raw.trim() === "") payload = {};
      else {
        try {
          payload = JSON.parse(raw) as JsonValue;
        } catch {
          check.add("payload", "json", JSON_MESSAGE);
        }
      }
    } else {
      payload = (raw ?? {}) as JsonValue;
    }
  }
  check.done();

  const nextStage = stage && stage !== "complete" ? stage : (existing?.stage ?? "welcome");
  const saved = await upsertTemplate({
    key,
    title: title ?? existing?.title ?? key,
    stage: nextStage,
    owner: owner ?? existing?.owner ?? "tekmadev",
    kind: kind ? taskKindToDb(kind) : (existing?.kind ?? "checklist"),
    plan_ids: plans ?? existing?.plan_ids ?? [],
    due_offset_days: dueOffsetDays === undefined ? (existing?.due_offset_days ?? null) : dueOffsetDays,
    sort_order: sortOrder ?? existing?.sort_order ?? 100,
    description: description === undefined ? (existing?.description ?? null) : description,
    payload: (payload === undefined ? (existing?.payload ?? {}) : (payload ?? {})) as Record<string, unknown>,
    required: required ?? existing?.required ?? true,
    active: active ?? existing?.active ?? true,
  });
  return { template: toTemplate(saved), created: !existing };
}

/** DELETE /onboarding-templates/:key. Runs already made from it keep their tasks. */
export async function deleteTemplateFromApp(key: string): Promise<{ key: string; deleted: true }> {
  const existing = key ? await templateByKey(key) : null;
  if (!existing) throw notFound("That template");
  await deleteTemplate(existing.id);
  return { key: existing.key, deleted: true };
}
