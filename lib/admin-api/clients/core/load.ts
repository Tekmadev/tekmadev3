import { getTierMeta } from "@/config/pricing";
import { getProductMeta, offerName } from "@/config/products";
import { dbError, instant, isUuid, money, notFound, requireDb, type ApiContext } from "@/lib/admin-api";
import { loadClientSections, loadPeople, type ClientSections, type People } from "@/lib/admin-api/clients/sections";
import { careIsSetUp, type Client, type ClientMember } from "@/lib/clients-data";
import type { ClientIntake, ClientOnboarding, OnboardingTask } from "@/lib/onboarding-data";
import { getLatestOrderForClient, paymentMethodLabel } from "@/lib/orders-data";
import { orderStatusToApp, subscriptionStatusToApp } from "./enums";
import {
  contactNameOf,
  sortTasks,
  toClient,
  toIntake,
  toRun,
  toTask,
  type ApiBilling,
  type ApiClient,
  type ApiIntake,
  type ApiRun,
  type ApiTask,
} from "./serialize";

/**
 * Reads for the clients domain. Every query checks its error and fails the
 * request (500 "Could not load this just now..."), because an empty section
 * that is really a failed read is fake data. Lookups by id answer 404 for
 * anything the caller may not see: deleted clients, and test clients without
 * `testdata.view`.
 */

/* ------------------------------------------------------------------ */
/* Lookups                                                             */
/* ------------------------------------------------------------------ */

export const CLIENT_MISSING = "That client";

/** Whether this caller may see this client at all (test clients need testdata.view). */
export const canSeeClient = (ctx: ApiContext, client: Pick<Client, "is_test" | "deleted_at">): boolean =>
  !client.deleted_at && (!client.is_test || ctx.can("testdata.view"));

/** A client the caller may see, or null (a failed read still throws). */
async function visibleClient(ctx: ApiContext, id: string | null | undefined): Promise<Client | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await requireDb().from("clients").select("*").eq("id", id).maybeSingle();
  if (error) throw dbError("client read", error);
  const client = data as Client | null;
  return client && canSeeClient(ctx, client) ? client : null;
}

/** A client the caller may see, or 404 "That client no longer exists.". */
export async function findClient(ctx: ApiContext, id: string | undefined): Promise<Client> {
  const client = await visibleClient(ctx, id);
  if (!client) throw notFound(CLIENT_MISSING);
  return client;
}

/** A client row by id with no visibility rule (after a write the caller already passed). */
export async function readClient(id: string): Promise<Client> {
  const { data, error } = await requireDb().from("clients").select("*").eq("id", id).maybeSingle();
  if (error) throw dbError("client read", error);
  if (!data) throw notFound(CLIENT_MISSING);
  return data as Client;
}

/** An onboarding run of a client the caller may see, or 404 "That onboarding run no longer exists.". */
export async function findRun(ctx: ApiContext, id: string | undefined): Promise<{ run: ClientOnboarding; client: Client }> {
  const missing = notFound("That onboarding run");
  if (!isUuid(id)) throw missing;
  const { data, error } = await requireDb().from("client_onboardings").select("*").eq("id", id).maybeSingle();
  if (error) throw dbError("onboarding read", error);
  if (!data) throw missing;
  const run = data as ClientOnboarding;
  const client = await visibleClient(ctx, run.client_id);
  if (!client) throw missing;
  return { run, client };
}

/** A task (with its run and client) the caller may see, or 404 "That task no longer exists.". */
export async function findTask(ctx: ApiContext, id: string | undefined): Promise<{ task: OnboardingTask; run: ClientOnboarding; client: Client }> {
  const missing = notFound("That task");
  if (!isUuid(id)) throw missing;
  const db = requireDb();
  const { data, error } = await db.from("onboarding_tasks").select("*").eq("id", id).maybeSingle();
  if (error) throw dbError("task read", error);
  if (!data) throw missing;
  const task = data as OnboardingTask;
  const { data: runRow, error: runError } = await db.from("client_onboardings").select("*").eq("id", task.onboarding_id).maybeSingle();
  if (runError) throw dbError("onboarding read", runError);
  const client = runRow ? await visibleClient(ctx, (runRow as ClientOnboarding).client_id) : null;
  if (!runRow || !client) throw missing;
  return { task, run: runRow as ClientOnboarding, client };
}

/** An intake of a client the caller may see, or 404 "That intake no longer exists.". */
export async function findIntake(ctx: ApiContext, id: string | undefined): Promise<{ intake: ClientIntake; client: Client }> {
  const missing = notFound("That intake");
  if (!isUuid(id)) throw missing;
  const { data, error } = await requireDb().from("client_intakes").select("*").eq("id", id).maybeSingle();
  if (error) throw dbError("intake read", error);
  if (!data) throw missing;
  const intake = data as ClientIntake;
  const client = await visibleClient(ctx, intake.client_id);
  if (!client) throw missing;
  return { intake, client };
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

export async function listMembersOf(clientId: string): Promise<ClientMember[]> {
  const { data, error } = await requireDb().from("client_members").select("*").eq("client_id", clientId).order("created_at").order("id");
  if (error) throw dbError("members read", error);
  return (data ?? []) as ClientMember[];
}

/** The client as the app sees it (the contact name comes from its portal people). */
export async function clientView(client: Client, members?: readonly ClientMember[]): Promise<ApiClient> {
  return toClient(client, contactNameOf(client, members ?? (await listMembersOf(client.id))));
}

/** Display names for one client's records: staff plus the client's portal people. */
export async function peopleFor(ctx: ApiContext, clientId: string): Promise<People> {
  return loadPeople(ctx, await listMembersOf(clientId));
}

/** The client's latest onboarding run (a completed one included), or null. */
export async function latestRunOf(clientId: string): Promise<ClientOnboarding | null> {
  const { data, error } = await requireDb()
    .from("client_onboardings")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw dbError("latest run read", error);
  return (data as ClientOnboarding | null) ?? null;
}

export async function tasksOfRun(runId: string): Promise<OnboardingTask[]> {
  const { data, error } = await requireDb().from("onboarding_tasks").select("*").eq("onboarding_id", runId);
  if (error) throw dbError("tasks read", error);
  return sortTasks((data ?? []) as OnboardingTask[]);
}

/** A run with its derived stage and progress recomputed from its tasks. */
export async function runView(run: ClientOnboarding): Promise<ApiRun> {
  return toRun(run, await tasksOfRun(run.id));
}

export async function readRun(runId: string): Promise<ClientOnboarding> {
  const { data, error } = await requireDb().from("client_onboardings").select("*").eq("id", runId).maybeSingle();
  if (error) throw dbError("onboarding read", error);
  if (!data) throw notFound("That onboarding run");
  return data as ClientOnboarding;
}

export async function latestIntakeOf(clientId: string): Promise<ClientIntake | null> {
  const { data, error } = await requireDb()
    .from("client_intakes")
    .select("*")
    .eq("client_id", clientId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw dbError("intake read", error);
  return (data as ClientIntake | null) ?? null;
}

/* ---------- billing ---------- */

type SubscriptionRow = {
  id: string;
  kind: string | null;
  tier: string | null;
  product_id: string | null;
  status: string | null;
  cancel_at_period_end: boolean | null;
  cancel_at: string | null;
  current_period_end: string | null;
  amount_total: number | null;
  currency: string | null;
  created_at: string;
};

const SUBSCRIPTION_COLUMNS = "id,kind,tier,product_id,status,cancel_at_period_end,cancel_at,current_period_end,amount_total,currency,created_at";

/** The client's subscriptions, newest first: linked by client, else by its Stripe customer (as the web admin reads them). */
async function subscriptionsOf(client: Client): Promise<SubscriptionRow[]> {
  const db = requireDb();
  const byLink = await db.from("subscriptions").select(SUBSCRIPTION_COLUMNS).eq("client_id", client.id).order("created_at", { ascending: false }).limit(20);
  if (byLink.error) throw dbError("client subscriptions read", byLink.error);
  if ((byLink.data ?? []).length > 0 || !client.stripe_customer_id) return (byLink.data ?? []) as SubscriptionRow[];
  const byCustomer = await db
    .from("subscriptions")
    .select(SUBSCRIPTION_COLUMNS)
    .eq("stripe_customer_id", client.stripe_customer_id)
    .order("created_at", { ascending: false })
    .limit(20);
  if (byCustomer.error) throw dbError("client subscriptions read", byCustomer.error);
  return (byCustomer.data ?? []) as SubscriptionRow[];
}

const isRunning = (s: SubscriptionRow) => s.status !== "canceled" && s.status !== "incomplete_expired";

/**
 * The billing block: the growth plan's subscription (else the care plan's),
 * the latest one-time order (lib/orders-data, in the client's own mode), and
 * whether a required care plan is set up (the website's careIsSetUp). Null
 * when the client has no subscription and no order at all. Every plan bills
 * monthly.
 */
export async function loadBilling(client: Client): Promise<ApiBilling | null> {
  const [subs, order] = await Promise.all([subscriptionsOf(client), getLatestOrderForClient(client)]);
  const plans = subs.filter((s) => (s.kind ?? "plan") !== "care");
  const cares = subs.filter((s) => s.kind === "care");
  const sub = plans.find(isRunning) ?? cares.find(isRunning) ?? plans[0] ?? cares[0] ?? null;
  const careRequired = Boolean(getProductMeta(client.plan_id)?.care);
  const careActive = careRequired && careIsSetUp(cares[0] ?? null);
  if (!sub && !order) return null;

  let subscription: ApiBilling["subscription"] = null;
  if (sub) {
    const isCare = sub.kind === "care";
    // Cancelling: the plan runs to the end of the paid period (or the cancel date) and then stops.
    const scheduled = sub.status !== "canceled" && (Boolean(sub.cancel_at_period_end) || Boolean(sub.cancel_at));
    subscription = {
      id: sub.id,
      kind: isCare ? "care" : "plan",
      productName: isCare
        ? (getProductMeta(sub.product_id ?? client.plan_id)?.care?.name ?? "Care plan")
        : (getTierMeta(sub.tier ?? "")?.name ?? offerName(client.plan_id) ?? "Plan"),
      status: subscriptionStatusToApp(sub.status),
      cancelAtPeriodEnd: scheduled,
      currentPeriodEnd: instant(scheduled && sub.cancel_at ? sub.cancel_at : sub.current_period_end),
      amount: money(sub.amount_total, sub.currency),
      interval: "month",
    };
  }

  let latestOrder: ApiBilling["latestOrder"] = null;
  if (order) {
    const method = paymentMethodLabel(order.payment_method_type);
    latestOrder = {
      id: order.id,
      productName: offerName(order.product_id) ?? "One-time purchase",
      status: orderStatusToApp(order.status),
      amount: money(order.amount_total, order.currency),
      paymentMethod: method === "-" ? null : method,
      paidAt: instant(order.paid_at),
      createdAt: instant(order.created_at),
    };
  }

  return { subscription, latestOrder, carePlan: { required: careRequired, active: careActive } };
}

/* ------------------------------------------------------------------ */
/* The detail bundle                                                   */
/* ------------------------------------------------------------------ */

export type ApiBundle = {
  client: ApiClient;
  billing: ApiBilling | null;
  onboarding: { run: ApiRun; tasks: ApiTask[] } | null;
  intake: ApiIntake | null;
} & ClientSections;

/**
 * GET /clients/:id: everything the client screen shows in one answer. The
 * account, billing, the latest run (a completed one included) and the latest
 * intake are built here; the sections (access, files, approvals, agreements,
 * calls and the guarantee, the CRM mapping, people, the first activity page)
 * come from lib/admin-api/clients/sections. Billing only for roles with
 * `clients.billing` (null otherwise); the CRM mapping key only with
 * `clients.crm`.
 */
export async function loadBundle(ctx: ApiContext, client: Client): Promise<ApiBundle> {
  const [members, run, intake, billing, sections] = await Promise.all([
    listMembersOf(client.id),
    latestRunOf(client.id),
    latestIntakeOf(client.id),
    ctx.can("clients.billing") ? loadBilling(client) : Promise.resolve(null),
    loadClientSections(ctx, client),
  ]);
  const [tasks, people] = await Promise.all([run ? tasksOfRun(run.id) : Promise.resolve([] as OnboardingTask[]), loadPeople(ctx, members)]);
  return {
    client: toClient(client, contactNameOf(client, members)),
    billing,
    onboarding: run ? { run: toRun(run, tasks), tasks: tasks.map((t) => toTask(t, people)) } : null,
    intake: intake ? toIntake(intake, people) : null,
    ...sections,
  };
}
