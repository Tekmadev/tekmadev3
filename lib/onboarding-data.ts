import { db, type Client, type GuaranteeCountRule } from "@/lib/clients-data";
import type { AccessMethod, AccessProviderKey } from "@/lib/access-providers";
import type { AgreementKind } from "@/config/agreements";

/**
 * Everything an onboarding produces: runs, the task checklist (instantiated
 * from editable templates), intake answers, the delegated-access registry,
 * uploaded assets, deliverable approvals, agreements, and the booked-call
 * guarantee counter. Server-only, same rules as clients-data.
 */

export type OnboardingStage = "welcome" | "intake" | "kickoff" | "build" | "review" | "go_live" | "optimizing" | "complete";
export type TaskStage = Exclude<OnboardingStage, "complete">;
export type TaskOwner = "client" | "tekmadev";
export type TaskKind = "form" | "upload" | "access_grant" | "approval" | "esign" | "call" | "internal" | "checklist";
export type TaskStatus = "todo" | "in_progress" | "waiting_on_client" | "done" | "skipped" | "blocked";

export const STAGES: { key: OnboardingStage; label: string; short: string; blurb: string; days: string }[] = [
  { key: "welcome", label: "Welcome", short: "Welcome", blurb: "Accept your agreement and book the kickoff.", days: "Day 0" },
  { key: "intake", label: "Intake", short: "Intake", blurb: "Tell us about your business and grant access.", days: "Day 0 to 1" },
  { key: "kickoff", label: "Kickoff", short: "Kickoff", blurb: "Discovery call, audit readout, quick win switched on.", days: "Day 1 to 3" },
  { key: "build", label: "Build", short: "Build", blurb: "We build your website, receptionist, pipeline, and follow-ups.", days: "Day 3 to 10" },
  { key: "review", label: "Review", short: "Review", blurb: "You approve everything before it goes live.", days: "Day 10 to 12" },
  { key: "go_live", label: "Go live", short: "Live", blurb: "Everything switched on. Your guarantee clock starts.", days: "Day 12 to 14" },
  { key: "optimizing", label: "Optimizing", short: "Optimize", blurb: "Weekly tuning toward your booked-call target.", days: "Day 14 to 74" },
  { key: "complete", label: "Complete", short: "Done", blurb: "Onboarding finished. Ongoing growth.", days: "" },
];

export function stageIndex(stage: OnboardingStage): number {
  return STAGES.findIndex((s) => s.key === stage);
}

export function stageLabel(stage: string): string {
  return STAGES.find((s) => s.key === stage)?.label ?? stage;
}

export type ClientOnboarding = {
  id: string;
  client_id: string;
  kind: "initial" | "upgrade" | "reonboarding";
  plan_id: string | null;
  stage: OnboardingStage;
  stage_entered_at: string;
  kickoff_at: string | null;
  target_live_date: string | null;
  live_at: string | null;
  blocked: boolean;
  blocked_reason: string | null;
  completed_at: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type OnboardingTaskTemplate = {
  id: string;
  key: string;
  title: string;
  description: string | null;
  plan_ids: string[];
  stage: TaskStage;
  owner: TaskOwner;
  kind: TaskKind;
  required: boolean;
  due_offset_days: number | null;
  sort_order: number;
  payload: Record<string, unknown>;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type OnboardingTask = {
  id: string;
  onboarding_id: string;
  client_id: string;
  template_id: string | null;
  key: string;
  title: string;
  description: string | null;
  stage: TaskStage;
  owner: TaskOwner;
  kind: TaskKind;
  status: TaskStatus;
  required: boolean;
  sort_order: number;
  due_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ClientIntake = {
  id: string;
  client_id: string;
  onboarding_id: string | null;
  version: number;
  schema_version: string;
  answers: Record<string, unknown>;
  status: "draft" | "submitted" | "reviewed";
  submitted_at: string | null;
  submitted_by: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AccessGrantStatus =
  | "requested"
  | "pending_client"
  | "client_says_done"
  | "granted"
  | "verified"
  | "revoked"
  | "not_applicable";

export type AccessGrant = {
  id: string;
  client_id: string;
  task_id: string | null;
  provider: AccessProviderKey;
  label: string | null;
  account_identifier: string | null;
  method: AccessMethod;
  status: AccessGrantStatus;
  requested_at: string;
  client_marked_done_at: string | null;
  granted_at: string | null;
  verified_at: string | null;
  verified_by: string | null;
  revoked_at: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type AssetKind = "logo" | "photo" | "brand_guide" | "document" | "video" | "other";

export type ClientAsset = {
  id: string;
  client_id: string;
  onboarding_id: string | null;
  task_id: string | null;
  kind: AssetKind;
  bucket: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  caption: string | null;
  uploaded_by: string | null;
  uploaded_by_type: "client" | "admin" | "system";
  created_at: string;
  deleted_at: string | null;
};

export type ApprovalKind =
  | "website"
  | "receptionist_script"
  | "ad_creative"
  | "landing_page"
  | "follow_up_sequence"
  | "social_content"
  | "other";

export type ClientApproval = {
  id: string;
  client_id: string;
  onboarding_id: string | null;
  task_id: string | null;
  kind: ApprovalKind;
  title: string;
  description: string | null;
  preview_url: string | null;
  attachments: { label: string; url: string }[];
  version: number;
  status: "pending" | "approved" | "changes_requested" | "superseded";
  requested_by: string | null;
  requested_at: string;
  decided_by: string | null;
  decided_at: string | null;
  feedback: string | null;
  created_at: string;
  updated_at: string;
};

export type ClientAgreement = {
  id: string;
  client_id: string;
  task_id: string | null;
  kind: AgreementKind;
  title: string;
  version: string;
  document_url: string | null;
  content_hash: string | null;
  status: "draft" | "sent" | "viewed" | "signed" | "declined" | "expired" | "superseded";
  signature_method: "click_accept" | "docusign" | "manual" | "other";
  sent_at: string;
  viewed_at: string | null;
  signed_at: string | null;
  signer_name: string | null;
  signer_email: string | null;
  signer_title: string | null;
  evidence: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type BookedCallStatus = "booked" | "confirmed" | "showed" | "no_show" | "cancelled" | "rescheduled";
export type BookedCallSource =
  | "receptionist"
  | "web_form"
  | "calendar"
  | "missed_call_textback"
  | "ads"
  | "chat"
  | "manual"
  | "import"
  | "other";

export type BookedCall = {
  id: string;
  client_id: string;
  external_id: string | null;
  source: BookedCallSource;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  service_requested: string | null;
  booked_at: string;
  booked_for: string | null;
  status: BookedCallStatus;
  qualified: boolean;
  disqualified_reason: "spam" | "duplicate" | "out_of_area" | "wrong_service" | "fake" | "other" | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  notes: string | null;
  raw: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// Onboarding runs
// ---------------------------------------------------------------------------

export async function getActiveOnboarding(clientId: string): Promise<ClientOnboarding | null> {
  const { data } = await db()
    .from("client_onboardings")
    .select("*")
    .eq("client_id", clientId)
    .is("completed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ClientOnboarding | null) ?? null;
}

export async function listOnboardings(clientId: string): Promise<ClientOnboarding[]> {
  const { data } = await db()
    .from("client_onboardings")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  return (data ?? []) as ClientOnboarding[];
}

/** Every run still in progress, for the admin board. */
export async function listActiveOnboardings(): Promise<ClientOnboarding[]> {
  const { data } = await db().from("client_onboardings").select("*").is("completed_at", null);
  return (data ?? []) as ClientOnboarding[];
}

/** Tasks across many runs in one query (admin board). */
export async function listTasksForOnboardings(onboardingIds: string[]): Promise<OnboardingTask[]> {
  if (onboardingIds.length === 0) return [];
  const { data } = await db().from("onboarding_tasks").select("*").in("onboarding_id", onboardingIds);
  return (data ?? []) as OnboardingTask[];
}

/** Booked calls across many clients in one query (admin board). */
export async function listBookedCallsForClients(clientIds: string[]): Promise<BookedCall[]> {
  if (clientIds.length === 0) return [];
  const { data } = await db().from("client_booked_calls").select("*").in("client_id", clientIds).limit(5000);
  return (data ?? []) as BookedCall[];
}

export async function getOnboardingById(id: string): Promise<ClientOnboarding | null> {
  const { data } = await db().from("client_onboardings").select("*").eq("id", id).maybeSingle();
  return (data as ClientOnboarding | null) ?? null;
}

/**
 * Creates a run and instantiates the active templates that apply to the plan,
 * with due dates offset from today. Returns the run with its tasks.
 */
export async function createOnboardingRun(input: {
  client_id: string;
  plan_id: string | null;
  kind?: ClientOnboarding["kind"];
  created_by?: string | null;
  target_live_date?: string | null;
}): Promise<{ onboarding: ClientOnboarding; tasks: OnboardingTask[] }> {
  const supabase = db();
  const targetLive =
    input.target_live_date ?? new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);

  const { data: run, error } = await supabase
    .from("client_onboardings")
    .insert({
      client_id: input.client_id,
      plan_id: input.plan_id,
      kind: input.kind ?? "initial",
      created_by: input.created_by ?? null,
      target_live_date: targetLive,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  const onboarding = run as ClientOnboarding;

  const templates = (await listTemplates({ activeOnly: true })).filter(
    (t) => t.plan_ids.length === 0 || (input.plan_id ? t.plan_ids.includes(input.plan_id) : false),
  );

  const now = Date.now();
  const rows = templates.map((t) => ({
    onboarding_id: onboarding.id,
    client_id: input.client_id,
    template_id: t.id,
    key: t.key,
    title: t.title,
    description: t.description,
    stage: t.stage,
    owner: t.owner,
    kind: t.kind,
    required: t.required,
    sort_order: t.sort_order,
    due_at: t.due_offset_days != null ? new Date(now + t.due_offset_days * 86_400_000).toISOString() : null,
    payload: t.payload,
  }));

  let tasks: OnboardingTask[] = [];
  if (rows.length) {
    const { data, error: tErr } = await supabase.from("onboarding_tasks").insert(rows).select("*");
    if (tErr) throw new Error(tErr.message);
    tasks = (data ?? []) as OnboardingTask[];
  }
  return { onboarding, tasks };
}

export async function updateOnboarding(id: string, patch: Partial<ClientOnboarding>): Promise<ClientOnboarding> {
  const { data, error } = await db().from("client_onboardings").update(patch).eq("id", id).select("*").single();
  if (error) throw new Error(error.message);
  return data as ClientOnboarding;
}

export async function setOnboardingStage(id: string, stage: OnboardingStage): Promise<ClientOnboarding> {
  const patch: Partial<ClientOnboarding> = { stage, stage_entered_at: new Date().toISOString() };
  if (stage === "complete") patch.completed_at = new Date().toISOString();
  return updateOnboarding(id, patch);
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export async function listTemplates(opts: { activeOnly?: boolean } = {}): Promise<OnboardingTaskTemplate[]> {
  let q = db().from("onboarding_task_templates").select("*").order("stage").order("sort_order");
  if (opts.activeOnly) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  // Postgres orders stage alphabetically; re-sort by pipeline order.
  return ((data ?? []) as OnboardingTaskTemplate[]).sort(
    (a, b) => stageIndex(a.stage) - stageIndex(b.stage) || a.sort_order - b.sort_order,
  );
}

export async function getTemplateById(id: string): Promise<OnboardingTaskTemplate | null> {
  const { data } = await db().from("onboarding_task_templates").select("*").eq("id", id).maybeSingle();
  return (data as OnboardingTaskTemplate | null) ?? null;
}

export async function upsertTemplate(
  input: Partial<OnboardingTaskTemplate> & { key: string; title: string; stage: TaskStage },
): Promise<OnboardingTaskTemplate> {
  const { data, error } = await db()
    .from("onboarding_task_templates")
    .upsert(input, { onConflict: "key" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as OnboardingTaskTemplate;
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await db().from("onboarding_task_templates").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export async function listTasks(onboardingId: string): Promise<OnboardingTask[]> {
  const { data, error } = await db()
    .from("onboarding_tasks")
    .select("*")
    .eq("onboarding_id", onboardingId)
    .order("sort_order");
  if (error) throw new Error(error.message);
  return ((data ?? []) as OnboardingTask[]).sort(
    (a, b) => stageIndex(a.stage) - stageIndex(b.stage) || a.sort_order - b.sort_order,
  );
}

export async function getTaskById(id: string): Promise<OnboardingTask | null> {
  const { data } = await db().from("onboarding_tasks").select("*").eq("id", id).maybeSingle();
  return (data as OnboardingTask | null) ?? null;
}

/** Ad-hoc task added by an admin to one run (not from a template). */
export async function createTask(input: {
  onboarding_id: string;
  client_id: string;
  title: string;
  description?: string | null;
  stage: TaskStage;
  owner: TaskOwner;
  kind: TaskKind;
  required?: boolean;
  due_at?: string | null;
  payload?: Record<string, unknown>;
}): Promise<OnboardingTask> {
  const { data, error } = await db()
    .from("onboarding_tasks")
    .insert({
      onboarding_id: input.onboarding_id,
      client_id: input.client_id,
      key: `custom.${Date.now().toString(36)}`,
      title: input.title,
      description: input.description ?? null,
      stage: input.stage,
      owner: input.owner,
      kind: input.kind,
      required: input.required ?? true,
      sort_order: 900,
      due_at: input.due_at ?? null,
      payload: input.payload ?? {},
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as OnboardingTask;
}

export async function updateTask(id: string, patch: Partial<OnboardingTask>): Promise<OnboardingTask> {
  const { data, error } = await db().from("onboarding_tasks").update(patch).eq("id", id).select("*").single();
  if (error) throw new Error(error.message);
  return data as OnboardingTask;
}

export async function setTaskStatus(id: string, status: TaskStatus, by: string | null): Promise<OnboardingTask> {
  const done = status === "done" || status === "skipped";
  return updateTask(id, {
    status,
    completed_at: done ? new Date().toISOString() : null,
    completed_by: done ? by : null,
  });
}

/** Marks a task done by its stable key within a run (used by automatic completions). */
export async function completeTaskByKey(onboardingId: string, key: string, by: string | null): Promise<void> {
  await db()
    .from("onboarding_tasks")
    .update({ status: "done", completed_at: new Date().toISOString(), completed_by: by })
    .eq("onboarding_id", onboardingId)
    .eq("key", key)
    .neq("status", "done");
}

export function isTaskOpen(t: OnboardingTask): boolean {
  return t.status !== "done" && t.status !== "skipped";
}

export type TaskProgress = { total: number; done: number; clientOpen: OnboardingTask[]; percent: number };

export function taskProgress(tasks: OnboardingTask[]): TaskProgress {
  const total = tasks.filter((t) => t.required).length;
  const done = tasks.filter((t) => t.required && !isTaskOpen(t)).length;
  const clientOpen = tasks.filter((t) => t.owner === "client" && isTaskOpen(t));
  return { total, done, clientOpen, percent: total ? Math.round((done / total) * 100) : 0 };
}

/**
 * Where the tracker should show the client. The stored stage is the admin's
 * authoritative position (set by hand or by "Go live"); the task-derived stage
 * (first stage with an open required task) lets the tracker move forward the
 * moment a client finishes something. We show whichever is further along, so
 * the tracker never lags and never slides backwards after go-live.
 */
/**
 * Stage keys that actually have tasks in this run, in pipeline order. Website
 * only checklists (Webline) skip kickoff and optimizing, so the tracker shows
 * five steps instead of seven.
 */
export function stagesInRun(tasks: OnboardingTask[]): OnboardingStage[] {
  const present = new Set(tasks.map((t) => t.stage));
  return STAGES.filter((s) => s.key !== "complete" && present.has(s.key)).map((s) => s.key);
}

export function derivedStage(onboarding: ClientOnboarding, tasks: OnboardingTask[]): OnboardingStage {
  if (onboarding.completed_at) return "complete";
  let fromTasks: OnboardingStage = onboarding.stage;
  for (const s of STAGES) {
    if (s.key === "complete") continue;
    if (tasks.some((t) => t.stage === s.key && t.required && isTaskOpen(t))) {
      fromTasks = s.key;
      break;
    }
  }
  return stageIndex(fromTasks) > stageIndex(onboarding.stage) ? fromTasks : onboarding.stage;
}

// ---------------------------------------------------------------------------
// Intake
// ---------------------------------------------------------------------------

export async function getLatestIntake(clientId: string): Promise<ClientIntake | null> {
  const { data } = await db()
    .from("client_intakes")
    .select("*")
    .eq("client_id", clientId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ClientIntake | null) ?? null;
}

export async function saveIntake(input: {
  client_id: string;
  onboarding_id: string | null;
  schema_version: string;
  answers: Record<string, unknown>;
  submit: boolean;
  by: string;
}): Promise<ClientIntake> {
  const supabase = db();
  const latest = await getLatestIntake(input.client_id);
  const now = new Date().toISOString();

  // Edit the draft in place; a submitted intake gets a new version on change.
  if (latest && latest.status === "draft") {
    const { data, error } = await supabase
      .from("client_intakes")
      .update({
        answers: input.answers,
        schema_version: input.schema_version,
        status: input.submit ? "submitted" : "draft",
        submitted_at: input.submit ? now : null,
        submitted_by: input.submit ? input.by : null,
      })
      .eq("id", latest.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as ClientIntake;
  }

  const { data, error } = await supabase
    .from("client_intakes")
    .insert({
      client_id: input.client_id,
      onboarding_id: input.onboarding_id,
      version: (latest?.version ?? 0) + 1,
      schema_version: input.schema_version,
      answers: input.answers,
      status: input.submit ? "submitted" : "draft",
      submitted_at: input.submit ? now : null,
      submitted_by: input.submit ? input.by : null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as ClientIntake;
}

export async function markIntakeReviewed(id: string, by: string): Promise<void> {
  await db()
    .from("client_intakes")
    .update({ status: "reviewed", reviewed_at: new Date().toISOString(), reviewed_by: by })
    .eq("id", id);
}

// ---------------------------------------------------------------------------
// Access grants
// ---------------------------------------------------------------------------

export async function listAccessGrants(clientId: string): Promise<AccessGrant[]> {
  const { data } = await db()
    .from("client_access_grants")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at");
  return (data ?? []) as AccessGrant[];
}

export async function getAccessGrant(id: string): Promise<AccessGrant | null> {
  const { data } = await db().from("client_access_grants").select("*").eq("id", id).maybeSingle();
  return (data as AccessGrant | null) ?? null;
}

export async function createAccessGrant(input: {
  client_id: string;
  provider: AccessProviderKey;
  method: AccessMethod;
  task_id?: string | null;
  label?: string | null;
  notes?: string | null;
}): Promise<AccessGrant> {
  const { data, error } = await db()
    .from("client_access_grants")
    .insert({
      client_id: input.client_id,
      provider: input.provider,
      method: input.method,
      task_id: input.task_id ?? null,
      label: input.label ?? null,
      notes: input.notes ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as AccessGrant;
}

export async function updateAccessGrant(id: string, patch: Partial<AccessGrant>): Promise<AccessGrant> {
  const { data, error } = await db().from("client_access_grants").update(patch).eq("id", id).select("*").single();
  if (error) throw new Error(error.message);
  return data as AccessGrant;
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

export const ASSET_BUCKET = "client-assets";

export async function listAssets(clientId: string): Promise<ClientAsset[]> {
  const { data } = await db()
    .from("client_assets")
    .select("*")
    .eq("client_id", clientId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  return (data ?? []) as ClientAsset[];
}

export async function getAsset(id: string): Promise<ClientAsset | null> {
  const { data } = await db().from("client_assets").select("*").eq("id", id).maybeSingle();
  return (data as ClientAsset | null) ?? null;
}

export async function createAssetRecord(input: {
  client_id: string;
  onboarding_id?: string | null;
  task_id?: string | null;
  kind: AssetKind;
  storage_path: string;
  file_name: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  uploaded_by: string;
  uploaded_by_type: "client" | "admin" | "system";
}): Promise<ClientAsset> {
  const { data, error } = await db()
    .from("client_assets")
    .insert({ ...input, bucket: ASSET_BUCKET })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as ClientAsset;
}

export async function softDeleteAsset(id: string): Promise<void> {
  await db().from("client_assets").update({ deleted_at: new Date().toISOString() }).eq("id", id);
}

/** Short-lived signed URL for viewing a private asset. */
export async function signedAssetUrl(storagePath: string, seconds = 60 * 15): Promise<string | null> {
  const { data } = await db().storage.from(ASSET_BUCKET).createSignedUrl(storagePath, seconds);
  return data?.signedUrl ?? null;
}

/** Signed upload target so the browser uploads straight to Storage. */
export async function createSignedUpload(storagePath: string): Promise<{ path: string; token: string } | null> {
  const { data, error } = await db().storage.from(ASSET_BUCKET).createSignedUploadUrl(storagePath);
  if (error) {
    console.error("[assets] signed upload failed", error.message);
    return null;
  }
  return { path: data.path, token: data.token };
}

export function safeFileName(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
  return base || "file";
}

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

export async function listApprovals(clientId: string): Promise<ClientApproval[]> {
  const { data } = await db()
    .from("client_approvals")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  return (data ?? []) as ClientApproval[];
}

export async function getApproval(id: string): Promise<ClientApproval | null> {
  const { data } = await db().from("client_approvals").select("*").eq("id", id).maybeSingle();
  return (data as ClientApproval | null) ?? null;
}

export async function createApproval(input: {
  client_id: string;
  onboarding_id?: string | null;
  task_id?: string | null;
  kind: ApprovalKind;
  title: string;
  description?: string | null;
  preview_url?: string | null;
  attachments?: { label: string; url: string }[];
  requested_by: string;
}): Promise<ClientApproval> {
  const supabase = db();
  // A new request for the same task supersedes the previous pending one.
  let version = 1;
  if (input.task_id) {
    const { data: prev } = await supabase
      .from("client_approvals")
      .select("id,version,status")
      .eq("client_id", input.client_id)
      .eq("task_id", input.task_id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (prev) {
      version = (prev as { version: number }).version + 1;
      if ((prev as { status: string }).status !== "approved") {
        await supabase.from("client_approvals").update({ status: "superseded" }).eq("id", (prev as { id: string }).id);
      }
    }
  }
  const { data, error } = await supabase
    .from("client_approvals")
    .insert({
      client_id: input.client_id,
      onboarding_id: input.onboarding_id ?? null,
      task_id: input.task_id ?? null,
      kind: input.kind,
      title: input.title,
      description: input.description ?? null,
      preview_url: input.preview_url ?? null,
      attachments: input.attachments ?? [],
      version,
      requested_by: input.requested_by,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as ClientApproval;
}

export async function decideApproval(
  id: string,
  decision: "approved" | "changes_requested",
  by: string,
  feedback: string | null,
): Promise<ClientApproval> {
  const { data, error } = await db()
    .from("client_approvals")
    .update({ status: decision, decided_by: by, decided_at: new Date().toISOString(), feedback })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as ClientApproval;
}

// ---------------------------------------------------------------------------
// Agreements
// ---------------------------------------------------------------------------

export async function listAgreements(clientId: string): Promise<ClientAgreement[]> {
  const { data } = await db()
    .from("client_agreements")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  return (data ?? []) as ClientAgreement[];
}

export async function getAgreement(id: string): Promise<ClientAgreement | null> {
  const { data } = await db().from("client_agreements").select("*").eq("id", id).maybeSingle();
  return (data as ClientAgreement | null) ?? null;
}

export async function createAgreement(input: {
  client_id: string;
  task_id?: string | null;
  kind: AgreementKind;
  title: string;
  version: string;
  document_url: string | null;
  content_hash: string | null;
}): Promise<ClientAgreement> {
  const { data, error } = await db()
    .from("client_agreements")
    .insert({ ...input, task_id: input.task_id ?? null })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as ClientAgreement;
}

export async function updateAgreement(id: string, patch: Partial<ClientAgreement>): Promise<ClientAgreement> {
  const { data, error } = await db().from("client_agreements").update(patch).eq("id", id).select("*").single();
  if (error) throw new Error(error.message);
  return data as ClientAgreement;
}

// ---------------------------------------------------------------------------
// Booked calls + guarantee
// ---------------------------------------------------------------------------

export async function listBookedCalls(clientId: string, limit = 500): Promise<BookedCall[]> {
  const { data } = await db()
    .from("client_booked_calls")
    .select("*")
    .eq("client_id", clientId)
    .order("booked_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as BookedCall[];
}

export async function createBookedCall(input: Partial<BookedCall> & { client_id: string }): Promise<BookedCall> {
  const { data, error } = await db()
    .from("client_booked_calls")
    .upsert(input, { onConflict: "client_id,external_id", ignoreDuplicates: false })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as BookedCall;
}

export async function updateBookedCall(id: string, patch: Partial<BookedCall>): Promise<BookedCall> {
  const { data, error } = await db().from("client_booked_calls").update(patch).eq("id", id).select("*").single();
  if (error) throw new Error(error.message);
  return data as BookedCall;
}

export type GuaranteeSummary = {
  eligible: boolean;
  target: number;
  windowDays: number;
  rule: GuaranteeCountRule;
  status: Client["guarantee_status"];
  startedAt: string | null;
  endsAt: string | null;
  daysElapsed: number;
  daysLeft: number;
  counted: number;
  /** Calls expected by now if pacing evenly to the target. */
  expectedByNow: number;
  onTrack: boolean;
  percent: number;
};

export function countsTowardGuarantee(client: Client, call: BookedCall, endsAtMs: number | null): boolean {
  if (!client.guarantee_started_at || !endsAtMs) return false;
  if (!call.qualified) return false;
  const t = new Date(call.booked_at).getTime();
  if (t < new Date(client.guarantee_started_at).getTime() || t > endsAtMs) return false;
  return client.guarantee_count_rule === "showed" ? call.status === "showed" : call.status !== "cancelled";
}

export function guaranteeSummary(client: Client, calls: BookedCall[], now = Date.now()): GuaranteeSummary {
  const startedAt = client.guarantee_started_at;
  const startMs = startedAt ? new Date(startedAt).getTime() : null;
  const endsAtMs = startMs ? startMs + client.guarantee_window_days * 86_400_000 : null;
  const counted = calls.filter((c) => countsTowardGuarantee(client, c, endsAtMs)).length;
  const daysElapsed = startMs ? Math.max(0, Math.min(client.guarantee_window_days, Math.floor((now - startMs) / 86_400_000))) : 0;
  const daysLeft = startMs ? Math.max(0, client.guarantee_window_days - daysElapsed) : client.guarantee_window_days;
  const expectedByNow = startMs ? Math.round((daysElapsed / client.guarantee_window_days) * client.guarantee_target) : 0;
  return {
    eligible: client.guarantee_eligible,
    target: client.guarantee_target,
    windowDays: client.guarantee_window_days,
    rule: client.guarantee_count_rule,
    status: client.guarantee_status,
    startedAt,
    endsAt: endsAtMs ? new Date(endsAtMs).toISOString() : null,
    daysElapsed,
    daysLeft,
    counted,
    expectedByNow,
    onTrack: counted >= expectedByNow,
    percent: Math.min(100, Math.round((counted / Math.max(1, client.guarantee_target)) * 100)),
  };
}
