import { getProductMeta } from "@/config/products";
import { notifyAdmins, resolveAdminNotifications } from "@/lib/admin-notify";
import {
  careIsSetUp,
  createNotification,
  getCareSubscriptionForClient,
  getClientById,
  logActivity,
  softDeleteClient,
  updateClient,
  type Client,
} from "@/lib/clients-data";
import {
  completeTaskByKey,
  createTask,
  getActiveOnboarding,
  markIntakeReviewed,
  setOnboardingStage,
  setTaskStatus,
  stageIndex,
  updateOnboarding,
  type ClientOnboarding,
  type OnboardingStage,
  type OnboardingTask,
  type TaskKind,
  type TaskOwner,
  type TaskStage,
  type TaskStatus,
} from "@/lib/onboarding-data";

/**
 * Staff operations on a client account, shared by the web admin's server
 * actions (app/admin/(dashboard)/clients/actions.ts) and the admin API
 * (app/api/admin/v1). Each one is the write plus what the web admin always did
 * around it: the activity trail, the client's in-app notification, the admin
 * inbox. Callers check who is allowed first.
 */

/* ------------------------------------------------------------------ */
/* Go live and trash                                                   */
/* ------------------------------------------------------------------ */

/** The care plan a client's product needs before going live, when it is not set up. */
export type MissingCarePlan = { productName: string; careName: string };

export async function missingCarePlan(client: Pick<Client, "id" | "plan_id">): Promise<MissingCarePlan | null> {
  const product = getProductMeta(client.plan_id);
  if (!product?.care) return null;
  const care = await getCareSubscriptionForClient(client.id);
  return careIsSetUp(care) ? null : { productName: product.name, careName: product.care.name };
}

export type GoLiveOutcome =
  | { ok: true; client: Client; clockStarted: boolean }
  | { ok: false; reason: "care_required"; missing: MissingCarePlan };

/**
 * Flip the account live: status, milestones, and the guarantee clock in one go.
 *
 * A product with a required care plan (Webline) does not go live until the
 * client has set it up: once the site is public there is no leverage left to
 * collect the card. `override` goes live anyway (comped or invoiced sites) and
 * is written to the activity log.
 *
 * `strict` is the admin API's rule set (the app contract): the live date is
 * today, the guarantee clock starts only when it never started and is not
 * waived (going live again after a pause keeps the original window and its
 * status), and an open run moves to optimizing only from an earlier stage.
 * Without it, the web admin's original behaviour is kept exactly.
 */
export async function goLiveClient(client: Client, opts: { by: string; override?: boolean; strict?: boolean }): Promise<GoLiveOutcome> {
  const id = client.id;
  const now = new Date().toISOString();
  const product = getProductMeta(client.plan_id);
  const override = Boolean(opts.override);

  if (opts.strict) {
    const missing = await missingCarePlan(client);
    if (missing && !override) return { ok: false, reason: "care_required", missing };
    if (missing && product?.care) {
      await logActivity({
        client_id: id,
        actor_type: "admin",
        actor_email: opts.by,
        event: "care.go_live_override",
        summary: `Went live without ${product.care.name} (override)`,
      });
    }
  } else {
    if (product?.care && !override) {
      const missing = await missingCarePlan(client);
      if (missing) return { ok: false, reason: "care_required", missing };
    }
    if (product?.care && override) {
      await logActivity({
        client_id: id,
        actor_type: "admin",
        actor_email: opts.by,
        event: "care.go_live_override",
        summary: `Went live without ${product.care.name} (override)`,
      });
    }
  }

  let clockStarted: boolean;
  let patch: Partial<Client>;
  if (opts.strict) {
    clockStarted = client.guarantee_eligible && client.guarantee_status !== "waived" && !client.guarantee_started_at;
    patch = { status: "live", live_at: now, ...(clockStarted ? { guarantee_started_at: now, guarantee_status: "running" as const } : {}) };
  } else {
    clockStarted = client.guarantee_eligible;
    patch = {
      status: "live",
      live_at: client.live_at ?? now,
      guarantee_started_at: client.guarantee_eligible ? (client.guarantee_started_at ?? now) : client.guarantee_started_at,
      guarantee_status: client.guarantee_eligible ? "running" : "not_eligible",
    };
  }
  const updated = await updateClient(id, patch, opts.by);

  const onboarding = await getActiveOnboarding(id);
  if (onboarding) {
    const moveStage = !opts.strict || stageIndex(onboarding.stage) < stageIndex("optimizing");
    await updateOnboarding(onboarding.id, { live_at: now, ...(moveStage ? { stage: "optimizing" as const, stage_entered_at: now } : {}) });
    await completeTaskByKey(onboarding.id, "go_live.clock_start", opts.by);
    await completeTaskByKey(onboarding.id, "go_live.switch_on", opts.by);
    await completeTaskByKey(onboarding.id, "go_live.publish", opts.by);
  }
  await logActivity({
    client_id: id,
    actor_type: "admin",
    actor_email: opts.by,
    event: "client.live",
    summary: clockStarted ? "System live. Guarantee clock started." : "System live.",
    visibility: "client",
  });
  await createNotification({
    client_id: id,
    template_key: "go_live",
    subject: "You are live",
    body: clockStarted
      ? `Everything is switched on. Your ${client.guarantee_window_days}-day guarantee window starts today.`
      : "Everything is switched on. Booked appointments will start showing on your dashboard.",
    action_url: "/calls",
  });
  return { ok: true, client: updated, clockStarted };
}

/** Move a client to the trash (soft delete) and tell the owner who did it. Returns the trashed row. */
export async function trashClient(client: Pick<Client, "id" | "business_name" | "is_test"> | null, id: string, by: string): Promise<Client | null> {
  await softDeleteClient(id, by);
  // Until now a deleted client left no trace of who did it. Owner only.
  await notifyAdmins({
    event: "client.deleted",
    title: `${client?.business_name ?? "A client"} was moved to the trash`,
    body: `By ${by}`,
    url: "/admin/clients",
    entity: { type: "client", id },
    actor: { type: "staff", label: by },
    isTest: Boolean(client?.is_test),
    data: { client_id: id, deleted_by: by },
  });
  return getClientById(id);
}

/* ------------------------------------------------------------------ */
/* Onboarding runs                                                     */
/* ------------------------------------------------------------------ */

/** Set the stored stage (`complete` completes the run) and log it for the client. */
export async function changeOnboardingStage(run: ClientOnboarding, stage: OnboardingStage, by: string): Promise<ClientOnboarding> {
  const updated = await setOnboardingStage(run.id, stage);
  await logActivity({
    client_id: run.client_id,
    actor_type: "admin",
    actor_email: by,
    event: "onboarding.stage_changed",
    entity_type: "onboarding",
    entity_id: run.id,
    summary: `Stage set to ${stage.replace("_", " ")}`,
    visibility: "client",
    data: { from: run.stage, to: stage },
  });
  return updated;
}

/** Complete a run for good. */
export async function completeOnboardingRun(run: ClientOnboarding, by: string): Promise<ClientOnboarding> {
  const updated = await setOnboardingStage(run.id, "complete");
  await logActivity({
    client_id: run.client_id,
    actor_type: "admin",
    actor_email: by,
    event: "onboarding.completed",
    entity_type: "onboarding",
    entity_id: run.id,
    summary: "Onboarding complete",
    visibility: "client",
  });
  return updated;
}

/** Block (with an optional reason) or unblock a run, and log it. Unblocking clears the reason. */
export async function setOnboardingBlocked(run: ClientOnboarding, blocked: boolean, reason: string | null, by: string): Promise<ClientOnboarding> {
  const updated = await updateOnboarding(run.id, { blocked, blocked_reason: blocked ? reason : null });
  await logActivity({
    client_id: run.client_id,
    actor_type: "admin",
    actor_email: by,
    event: blocked ? "onboarding.blocked" : "onboarding.unblocked",
    entity_type: "onboarding",
    entity_id: run.id,
    summary: blocked ? `Blocked: ${reason ?? "no reason given"}` : "Unblocked",
  });
  return updated;
}

/* ------------------------------------------------------------------ */
/* Tasks                                                               */
/* ------------------------------------------------------------------ */

/** Change a task's status (closing stamps who and when) and log it; a no-op when unchanged. */
export async function setTaskStatusByStaff(task: OnboardingTask, status: TaskStatus, by: string): Promise<OnboardingTask> {
  if (status === task.status) return task;
  const updated = await setTaskStatus(task.id, status, by);
  await logActivity({
    client_id: task.client_id,
    actor_type: "admin",
    actor_email: by,
    event: "task.status_changed",
    entity_type: "task",
    entity_id: task.id,
    summary: `"${task.title}" set to ${status.replace(/_/g, " ")}`,
    visibility: status === "done" ? "client" : "internal",
  });
  return updated;
}

/**
 * Add a task to a run by hand. A client-owned task shows in the client's
 * portal checklist and timeline, and they get an in-app notification.
 */
export async function addTaskByStaff(
  run: ClientOnboarding,
  input: { title: string; description: string | null; stage: TaskStage; owner: TaskOwner; kind: TaskKind; required: boolean; due_at: string | null },
  by: string,
): Promise<OnboardingTask> {
  const task = await createTask({ onboarding_id: run.id, client_id: run.client_id, ...input });
  await logActivity({
    client_id: run.client_id,
    actor_type: "admin",
    actor_email: by,
    event: "task.created",
    entity_type: "task",
    entity_id: task.id,
    summary: `Task added: ${input.title}`,
    visibility: task.owner === "client" ? "client" : "internal",
  });
  if (task.owner === "client") {
    await createNotification({
      client_id: run.client_id,
      template_key: "task_added",
      subject: `New to-do: ${input.title}`,
      body: task.description,
      action_url: "/onboarding",
    });
  }
  return task;
}

/* ------------------------------------------------------------------ */
/* Intake                                                              */
/* ------------------------------------------------------------------ */

/** Mark an intake reviewed, close its "intake submitted" inbox item, and log it for the client. */
export async function reviewIntakeByStaff(intakeId: string, clientId: string, by: string): Promise<void> {
  await markIntakeReviewed(intakeId, by);
  await resolveAdminNotifications({ events: ["onboarding.intake_submitted"], clientId, by });
  await logActivity({ client_id: clientId, actor_type: "admin", actor_email: by, event: "intake.reviewed", summary: "Intake reviewed", visibility: "client" });
}
