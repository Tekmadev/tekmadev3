import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * Client accounts, their people, the activity trail, and notifications.
 * Server-only: every function uses the service-role client and callers are
 * responsible for authorization (requireClient / requireAdmin) and for scoping
 * queries to the right client_id.
 */

export type ClientStatus = "pending" | "onboarding" | "live" | "paused" | "churned";
export type GuaranteeStatus = "not_started" | "running" | "met" | "extended" | "waived" | "not_eligible";
export type GuaranteeCountRule = "booked" | "showed";

export type Client = {
  id: string;
  slug: string;
  business_name: string;
  legal_name: string | null;
  website_url: string | null;
  primary_email: string;
  primary_phone: string | null;
  industry: string | null;
  service_area: string | null;
  timezone: string;
  address: Record<string, unknown>;
  status: ClientStatus;
  plan_id: string | null;
  stripe_customer_id: string | null;
  lead_id: string | null;
  guarantee_eligible: boolean;
  guarantee_target: number;
  guarantee_window_days: number;
  guarantee_count_rule: GuaranteeCountRule;
  guarantee_status: GuaranteeStatus;
  guarantee_started_at: string | null;
  guarantee_met_at: string | null;
  live_at: string | null;
  churned_at: string | null;
  assigned_strategist: string | null;
  internal_notes: string | null;
  settings: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type MemberRole = "owner" | "admin" | "member";
export type MemberStatus = "invited" | "active" | "disabled";

export type ClientMember = {
  id: string;
  client_id: string;
  user_id: string | null;
  email: string;
  name: string | null;
  title: string | null;
  role: MemberRole;
  status: MemberStatus;
  notifications: Record<string, unknown>;
  invited_by: string | null;
  invited_at: string;
  accepted_at: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ActivityActor = "client" | "admin" | "system";

export type ClientActivity = {
  id: string;
  client_id: string;
  actor_type: ActivityActor;
  actor_email: string | null;
  event: string;
  entity_type: string | null;
  entity_id: string | null;
  summary: string | null;
  visibility: "internal" | "client";
  data: Record<string, unknown>;
  created_at: string;
};

export type ClientNotification = {
  id: string;
  client_id: string;
  member_id: string | null;
  channel: "email" | "sms" | "in_app";
  template_key: string | null;
  subject: string | null;
  body: string | null;
  action_url: string | null;
  status: "queued" | "sent" | "delivered" | "failed" | "read";
  provider: string | null;
  provider_message_id: string | null;
  error: string | null;
  sent_at: string | null;
  read_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export function db() {
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  return client;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export const CLIENT_STATUS_LABEL: Record<ClientStatus, string> = {
  pending: "Pending",
  onboarding: "Onboarding",
  live: "Live",
  paused: "Paused",
  churned: "Churned",
};

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

export async function listClients(opts: { status?: ClientStatus; includeDeleted?: boolean } = {}): Promise<Client[]> {
  let q = db().from("clients").select("*").order("created_at", { ascending: false });
  if (!opts.includeDeleted) q = q.is("deleted_at", null);
  if (opts.status) q = q.eq("status", opts.status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Client[];
}

export async function getClientById(id: string): Promise<Client | null> {
  const { data } = await db().from("clients").select("*").eq("id", id).maybeSingle();
  return (data as Client | null) ?? null;
}

export async function getClientByStripeCustomer(stripeCustomerId: string): Promise<Client | null> {
  const { data } = await db()
    .from("clients")
    .select("*")
    .eq("stripe_customer_id", stripeCustomerId)
    .is("deleted_at", null)
    .maybeSingle();
  return (data as Client | null) ?? null;
}

export async function getClientByEmail(email: string): Promise<Client | null> {
  const { data } = await db()
    .from("clients")
    .select("*")
    .ilike("primary_email", email.trim().toLowerCase())
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Client | null) ?? null;
}

export async function uniqueClientSlug(name: string): Promise<string> {
  const base = slugify(name) || "client";
  const { data } = await db().from("clients").select("slug").like("slug", `${base}%`);
  const taken = new Set((data ?? []).map((r) => (r as { slug: string }).slug));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

export type ClientInsert = Partial<Omit<Client, "id" | "created_at" | "updated_at">> & {
  business_name: string;
  primary_email: string;
};

export async function createClient(input: ClientInsert): Promise<Client> {
  const slug = input.slug || (await uniqueClientSlug(input.business_name));
  const { data, error } = await db()
    .from("clients")
    .insert({ ...input, slug, primary_email: input.primary_email.trim().toLowerCase() })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Client;
}

export async function updateClient(id: string, patch: Partial<Client>, updatedBy?: string): Promise<Client> {
  const { data, error } = await db()
    .from("clients")
    .update({ ...patch, ...(updatedBy ? { updated_by: updatedBy } : {}) })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Client;
}

export async function softDeleteClient(id: string, by: string): Promise<void> {
  const { error } = await db()
    .from("clients")
    .update({ deleted_at: new Date().toISOString(), updated_by: by })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export type ClientSubscription = {
  id: string;
  created_at: string;
  email: string | null;
  tier: string | null;
  status: string | null;
  current_period_end: string | null;
  amount_total: number | null;
  currency: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};

/** Most recent Stripe subscription for a client (by link, then by customer id). */
export async function getLatestSubscriptionForClient(client: Client): Promise<ClientSubscription | null> {
  const cols = "id,created_at,email,tier,status,current_period_end,amount_total,currency,stripe_customer_id,stripe_subscription_id";
  const supabase = db();
  const byLink = await supabase
    .from("subscriptions")
    .select(cols)
    .eq("client_id", client.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (byLink.data) return byLink.data as ClientSubscription;
  if (!client.stripe_customer_id) return null;
  const byCustomer = await supabase
    .from("subscriptions")
    .select(cols)
    .eq("stripe_customer_id", client.stripe_customer_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (byCustomer.data as ClientSubscription | null) ?? null;
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

export async function listMembers(clientId: string): Promise<ClientMember[]> {
  const { data, error } = await db()
    .from("client_members")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as ClientMember[];
}

export async function getMemberById(id: string): Promise<ClientMember | null> {
  const { data } = await db().from("client_members").select("*").eq("id", id).maybeSingle();
  return (data as ClientMember | null) ?? null;
}

export async function getMember(clientId: string, email: string): Promise<ClientMember | null> {
  const { data } = await db()
    .from("client_members")
    .select("*")
    .eq("client_id", clientId)
    .ilike("email", email.trim().toLowerCase())
    .maybeSingle();
  return (data as ClientMember | null) ?? null;
}

export type MembershipWithClient = ClientMember & { client: Client };

/**
 * All active memberships for a signed-in user. Matches by auth user id first,
 * then by email for members invited before their auth account existed, and
 * backfills user_id so the next lookup is by id.
 */
export async function getMembershipsForUser(userId: string, email: string | null | undefined): Promise<MembershipWithClient[]> {
  const supabase = db();
  const select = "*, client:clients(*)";
  const rows: MembershipWithClient[] = [];

  const byId = await supabase.from("client_members").select(select).eq("user_id", userId).neq("status", "disabled");
  for (const r of (byId.data ?? []) as MembershipWithClient[]) rows.push(r);

  if (email) {
    const byEmail = await supabase
      .from("client_members")
      .select(select)
      .is("user_id", null)
      .ilike("email", email.toLowerCase())
      .neq("status", "disabled");
    for (const r of (byEmail.data ?? []) as MembershipWithClient[]) {
      await supabase.from("client_members").update({ user_id: userId }).eq("id", r.id);
      rows.push({ ...r, user_id: userId });
    }
  }

  return rows.filter((r) => r.client && !r.client.deleted_at);
}

export async function upsertMember(input: {
  client_id: string;
  email: string;
  name?: string | null;
  title?: string | null;
  role?: MemberRole;
  invited_by?: string | null;
  user_id?: string | null;
}): Promise<ClientMember> {
  const email = input.email.trim().toLowerCase();
  const existing = await getMember(input.client_id, email);
  if (existing) {
    const patch: Partial<ClientMember> = {};
    if (input.name && !existing.name) patch.name = input.name;
    if (input.title && !existing.title) patch.title = input.title;
    if (input.user_id && !existing.user_id) patch.user_id = input.user_id;
    if (Object.keys(patch).length === 0) return existing;
    const { data, error } = await db().from("client_members").update(patch).eq("id", existing.id).select("*").single();
    if (error) throw new Error(error.message);
    return data as ClientMember;
  }
  const { data, error } = await db()
    .from("client_members")
    .insert({
      client_id: input.client_id,
      email,
      name: input.name ?? null,
      title: input.title ?? null,
      role: input.role ?? "member",
      invited_by: input.invited_by ?? null,
      user_id: input.user_id ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as ClientMember;
}

export async function updateMember(id: string, patch: Partial<ClientMember>): Promise<ClientMember> {
  const { data, error } = await db().from("client_members").update(patch).eq("id", id).select("*").single();
  if (error) throw new Error(error.message);
  return data as ClientMember;
}

export async function touchMemberSeen(id: string): Promise<void> {
  await db().from("client_members").update({ last_seen_at: new Date().toISOString() }).eq("id", id);
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

export async function logActivity(input: {
  client_id: string;
  actor_type: ActivityActor;
  actor_email?: string | null;
  event: string;
  entity_type?: string | null;
  entity_id?: string | null;
  summary?: string | null;
  visibility?: "internal" | "client";
  data?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await db().from("client_activity").insert({
    client_id: input.client_id,
    actor_type: input.actor_type,
    actor_email: input.actor_email ?? null,
    event: input.event,
    entity_type: input.entity_type ?? null,
    entity_id: input.entity_id ?? null,
    summary: input.summary ?? null,
    visibility: input.visibility ?? "internal",
    data: input.data ?? {},
  });
  if (error) console.error("[client_activity] insert failed", error.message);
}

export async function listActivity(
  clientId: string,
  opts: { visibility?: "client" | "all"; limit?: number } = {},
): Promise<ClientActivity[]> {
  let q = db()
    .from("client_activity")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 50);
  if (opts.visibility === "client") q = q.eq("visibility", "client");
  const { data } = await q;
  return (data ?? []) as ClientActivity[];
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export async function createNotification(input: {
  client_id: string;
  member_id?: string | null;
  channel?: "email" | "sms" | "in_app";
  template_key?: string | null;
  subject: string;
  body?: string | null;
  action_url?: string | null;
  status?: ClientNotification["status"];
  provider?: string | null;
  provider_message_id?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const channel = input.channel ?? "in_app";
  const { error } = await db().from("client_notifications").insert({
    client_id: input.client_id,
    member_id: input.member_id ?? null,
    channel,
    template_key: input.template_key ?? null,
    subject: input.subject,
    body: input.body ?? null,
    action_url: input.action_url ?? null,
    status: input.status ?? (channel === "in_app" ? "delivered" : "queued"),
    provider: input.provider ?? null,
    provider_message_id: input.provider_message_id ?? null,
    sent_at: channel === "in_app" ? new Date().toISOString() : null,
    metadata: input.metadata ?? {},
  });
  if (error) console.error("[client_notifications] insert failed", error.message);
}

export async function listInAppNotifications(clientId: string, memberId: string, limit = 20): Promise<ClientNotification[]> {
  const { data } = await db()
    .from("client_notifications")
    .select("*")
    .eq("client_id", clientId)
    .eq("channel", "in_app")
    .or(`member_id.eq.${memberId},member_id.is.null`)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as ClientNotification[];
}

export async function markNotificationsRead(clientId: string, memberId: string): Promise<void> {
  await db()
    .from("client_notifications")
    .update({ read_at: new Date().toISOString(), status: "read" })
    .eq("client_id", clientId)
    .eq("channel", "in_app")
    .is("read_at", null)
    .or(`member_id.eq.${memberId},member_id.is.null`);
}
