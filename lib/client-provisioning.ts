import { createHash } from "node:crypto";
import { AGREEMENTS } from "@/config/agreements";
import { getTierMeta } from "@/config/pricing";
import { accessProvider, type AccessProviderKey } from "@/lib/access-providers";
import {
  createClient,
  createNotification,
  db,
  getClientByEmail,
  getClientByStripeCustomer,
  logActivity,
  updateClient,
  upsertMember,
  type ActivityActor,
  type Client,
  type ClientMember,
  type MemberRole,
} from "@/lib/clients-data";
import {
  createAccessGrant,
  createAgreement,
  createOnboardingRun,
  getActiveOnboarding,
  listAccessGrants,
  listAgreements,
  listTasks,
  type OnboardingTask,
} from "@/lib/onboarding-data";
import { portalUrl } from "@/lib/portal-host";

/**
 * Turns a paid checkout (or an admin's "add client") into a working portal
 * account: the client row, its owner membership, the Supabase auth invite, an
 * onboarding run with its checklist, plus the access-grant and agreement rows
 * the checklist needs. Idempotent: safe to call again for the same client
 * (Stripe retries webhooks).
 */

export type ProvisionInput = {
  business_name: string;
  email: string;
  name?: string | null;
  phone?: string | null;
  plan_id: string | null;
  stripe_customer_id?: string | null;
  subscription_id?: string | null;
  lead_id?: string | null;
  actor_type: ActivityActor;
  actor_email?: string | null;
  /** Skip the email (admin creating a record for an offline client). */
  send_invite?: boolean;
};

export type ProvisionResult = {
  client: Client;
  member: ClientMember;
  createdClient: boolean;
  createdOnboarding: boolean;
  invite: InviteResult | null;
};

export type InviteResult = { ok: true; mode: "invite" | "recovery" } | { ok: false; error: string };

/**
 * Sends the "set your password" email. New auth users get the Invite
 * template; existing ones get the Reset template (same landing page). Both
 * point at the portal host so the session cookie lands on the right domain.
 */
export async function sendPortalInvite(email: string, name?: string | null): Promise<InviteResult> {
  const supabase = db();
  const redirectTo = portalUrl("/auth/confirm");
  const target = email.trim().toLowerCase();

  const { error } = await supabase.auth.admin.inviteUserByEmail(target, {
    data: name ? { name } : undefined,
    redirectTo,
  });
  if (!error) return { ok: true, mode: "invite" };

  if (/already|exist|registered/i.test(error.message)) {
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(target, { redirectTo });
    if (resetErr) return { ok: false, error: resetErr.message };
    return { ok: true, mode: "recovery" };
  }
  return { ok: false, error: error.message };
}

export async function provisionClient(input: ProvisionInput): Promise<ProvisionResult> {
  const email = input.email.trim().toLowerCase();
  const tier = input.plan_id ? getTierMeta(input.plan_id) : undefined;

  // 1. Find or create the client.
  let client: Client | null = null;
  if (input.stripe_customer_id) client = await getClientByStripeCustomer(input.stripe_customer_id);
  if (!client) client = await getClientByEmail(email);

  let createdClient = false;
  if (!client) {
    client = await createClient({
      business_name: input.business_name || email.split("@")[1] || "New client",
      primary_email: email,
      primary_phone: input.phone ?? null,
      plan_id: input.plan_id,
      stripe_customer_id: input.stripe_customer_id ?? null,
      lead_id: input.lead_id ?? null,
      status: "pending",
      guarantee_eligible: tier?.guarantee ?? false,
      guarantee_status: tier?.guarantee ? "not_started" : "not_eligible",
      created_by: input.actor_email ?? input.actor_type,
    });
    createdClient = true;
    await logActivity({
      client_id: client.id,
      actor_type: input.actor_type,
      actor_email: input.actor_email,
      event: "client.created",
      entity_type: "client",
      entity_id: client.id,
      summary: `Account created (${input.plan_id ?? "no plan"})`,
      visibility: "client",
    });
  } else {
    // Backfill anything we learned later (e.g. Stripe customer on an admin-created record).
    const patch: Partial<Client> = {};
    if (input.stripe_customer_id && !client.stripe_customer_id) patch.stripe_customer_id = input.stripe_customer_id;
    if (input.plan_id && !client.plan_id) {
      patch.plan_id = input.plan_id;
      patch.guarantee_eligible = tier?.guarantee ?? false;
      patch.guarantee_status = tier?.guarantee ? "not_started" : "not_eligible";
    }
    if (input.phone && !client.primary_phone) patch.primary_phone = input.phone;
    if (Object.keys(patch).length) client = await updateClient(client.id, patch, input.actor_email ?? undefined);
  }

  // 2. Link the Stripe subscription record.
  if (input.subscription_id) {
    await db().from("subscriptions").update({ client_id: client.id }).eq("id", input.subscription_id);
  }

  // 3. Owner membership.
  const member = await upsertMember({
    client_id: client.id,
    email,
    name: input.name ?? null,
    role: "owner",
    invited_by: input.actor_email ?? input.actor_type,
  });

  // 4. Onboarding run + checklist.
  let createdOnboarding = false;
  let onboarding = await getActiveOnboarding(client.id);
  if (!onboarding) {
    const run = await createOnboardingRun({
      client_id: client.id,
      plan_id: client.plan_id,
      created_by: input.actor_email ?? input.actor_type,
    });
    onboarding = run.onboarding;
    createdOnboarding = true;
    await ensureSupportingRows(client, run.tasks);
    await logActivity({
      client_id: client.id,
      actor_type: "system",
      event: "onboarding.started",
      entity_type: "onboarding",
      entity_id: onboarding.id,
      summary: "Onboarding started",
      visibility: "client",
    });
    if (client.status === "pending") {
      client = await updateClient(client.id, { status: "onboarding" });
    }
  } else {
    await ensureSupportingRows(client, await listTasks(onboarding.id));
  }

  // 5. Invite (only on first provisioning of this member, or when asked).
  let invite: InviteResult | null = null;
  const shouldInvite = input.send_invite ?? true;
  if (shouldInvite && member.status === "invited" && !member.accepted_at) {
    invite = await sendPortalInvite(email, input.name ?? null);
    await logActivity({
      client_id: client.id,
      actor_type: "system",
      event: invite.ok ? "member.invited" : "member.invite_failed",
      entity_type: "member",
      entity_id: member.id,
      summary: invite.ok ? `Portal invite sent to ${email}` : `Invite failed: ${invite.error}`,
      data: invite.ok ? { mode: invite.mode } : {},
    });
  }

  if (createdOnboarding) {
    await createNotification({
      client_id: client.id,
      member_id: member.id,
      template_key: "welcome",
      subject: `Welcome to Tekmadev, ${client.business_name}`,
      body: "Your onboarding has started. Two quick things to do today: accept your agreement and book your kickoff call.",
      action_url: "/onboarding",
    });
  }

  return { client, member, createdClient, createdOnboarding, invite };
}

/**
 * Creates the access-grant and agreement rows that the checklist's
 * access_grant / esign tasks refer to, if they do not exist yet.
 */
async function ensureSupportingRows(client: Client, tasks: OnboardingTask[]): Promise<void> {
  const [grants, agreements] = await Promise.all([listAccessGrants(client.id), listAgreements(client.id)]);

  for (const t of tasks) {
    if (t.kind === "access_grant") {
      const provider = String(t.payload?.provider ?? "other") as AccessProviderKey;
      if (grants.some((g) => g.provider === provider && g.status !== "revoked")) continue;
      const def = accessProvider(provider);
      await createAccessGrant({ client_id: client.id, provider, method: def.method, task_id: t.id, label: def.label });
    }
    if (t.kind === "esign") {
      const kind = String(t.payload?.agreement_kind ?? "service_agreement");
      const def = AGREEMENTS[kind as keyof typeof AGREEMENTS];
      if (!def) continue;
      if (agreements.some((a) => a.kind === def.kind && a.version === def.version && a.status !== "superseded")) continue;
      await createAgreement({
        client_id: client.id,
        task_id: t.id,
        kind: def.kind,
        title: def.title,
        version: def.version,
        document_url: def.url,
        content_hash: agreementHash(def.kind, def.version, def.url),
      });
    }
  }
}

export function agreementHash(kind: string, version: string, url: string): string {
  return createHash("sha256").update(`${kind}:${version}:${url}`).digest("hex");
}

/** Adds a teammate to a client's portal and emails them the invite. */
export async function inviteMember(input: {
  client_id: string;
  email: string;
  name?: string | null;
  title?: string | null;
  role: MemberRole;
  invited_by: string;
  actor_type: ActivityActor;
}): Promise<{ member: ClientMember; invite: InviteResult }> {
  const member = await upsertMember({
    client_id: input.client_id,
    email: input.email,
    name: input.name ?? null,
    title: input.title ?? null,
    role: input.role,
    invited_by: input.invited_by,
  });
  const invite = await sendPortalInvite(input.email, input.name ?? null);
  await logActivity({
    client_id: input.client_id,
    actor_type: input.actor_type,
    actor_email: input.invited_by,
    event: invite.ok ? "member.invited" : "member.invite_failed",
    entity_type: "member",
    entity_id: member.id,
    summary: invite.ok ? `${input.email} invited as ${input.role}` : `Invite failed: ${invite.error}`,
    visibility: "client",
  });
  return { member, invite };
}
