import { createHash } from "node:crypto";
import { AGREEMENTS } from "@/config/agreements";
import { getTierMeta } from "@/config/pricing";
import { getProductMeta } from "@/config/products";
import { accessProvider, type AccessProviderKey } from "@/lib/access-providers";
import {
  createClient,
  createNotification,
  db,
  getClientByEmail,
  getClientById,
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
  completeTaskByKey,
  createOnboardingRun,
  getActiveOnboarding,
  getLatestIntake,
  listAccessGrants,
  listAgreements,
  listTasks,
  type OnboardingTask,
} from "@/lib/onboarding-data";
import { portalUrl } from "@/lib/portal-host";
import { getDisplayProduct } from "@/lib/products-data";
import { formatMoney } from "@/lib/money";
import { weblineWelcomeEmail, type WelcomeEmail } from "@/lib/mail/welcome";

/**
 * Turns a paid checkout (or an admin's "add client") into a working portal
 * account: the client row, its owner membership, the Supabase auth invite, an
 * onboarding run with its checklist, plus the access-grant and agreement rows
 * the checklist needs. Idempotent: safe to call again for the same client
 * (Stripe retries webhooks).
 */

export type ProvisionInput = {
  /** Known account (Checkout's client_reference_id from a portal-started checkout). */
  client_id?: string | null;
  business_name: string;
  email: string;
  name?: string | null;
  phone?: string | null;
  plan_id: string | null;
  stripe_customer_id?: string | null;
  subscription_id?: string | null;
  /** One-time purchase (orders.id) that paid for this account. */
  order_id?: string | null;
  lead_id?: string | null;
  actor_type: ActivityActor;
  actor_email?: string | null;
  /** Skip the email (admin creating a record for an offline client). */
  send_invite?: boolean;
  /** True when this came from a Stripe sandbox purchase. Defaults to a real one. */
  is_test?: boolean;
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
  // One-time products (Webline) reuse plan_id; no guarantee, website-only checklist.
  const product = getProductMeta(input.plan_id);

  // 1. Find or create the client. A self-serve lead who pays is found by the
  //    id the portal put on the checkout, then by Stripe customer, then email.
  //    Every match must be in the same mode as the purchase. A sandbox
  //    purchase that landed on a real client would hang a sandbox order and a
  //    sandbox Stripe customer on them, and their billing would break the next
  //    time live Stripe was asked about an id it has never heard of.
  const isTest = input.is_test ?? false;
  const sameMode = (c: Client | null) => (c && Boolean(c.is_test) === isTest ? c : null);

  let client: Client | null = null;
  if (input.client_id) {
    const known = await getClientById(input.client_id);
    if (known && !known.deleted_at) {
      if (!sameMode(known)) {
        throw new Error(
          `Mode mismatch: a ${isTest ? "test" : "live"} purchase named ${known.is_test ? "test" : "live"} client ${known.id}. Nothing was changed.`,
        );
      }
      client = known;
    }
  }
  if (!client && input.stripe_customer_id) client = sameMode(await getClientByStripeCustomer(input.stripe_customer_id));
  if (!client) client = await getClientByEmail(email, isTest);

  let createdClient = false;
  if (!client) {
    client = await createClient({
      business_name: input.business_name || email.split("@")[1] || "New client",
      is_test: isTest,
      primary_email: email,
      primary_phone: input.phone ?? null,
      plan_id: input.plan_id,
      stripe_customer_id: input.stripe_customer_id ?? null,
      lead_id: input.lead_id ?? null,
      status: "pending",
      source: input.actor_type === "system" ? "stripe" : "admin",
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

  // 2. Link the Stripe billing record (subscription or one-time order).
  if (input.subscription_id) {
    await db().from("subscriptions").update({ client_id: client.id }).eq("id", input.subscription_id);
  }
  if (input.order_id) {
    await db().from("orders").update({ client_id: client.id }).eq("id", input.order_id);
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
  let hasKickoff = !product;
  let onboarding = await getActiveOnboarding(client.id);
  if (!onboarding) {
    const liveDays = product?.onboarding.targetLiveDays ?? 14;
    const run = await createOnboardingRun({
      client_id: client.id,
      plan_id: client.plan_id,
      created_by: input.actor_email ?? input.actor_type,
      target_live_date: new Date(Date.now() + liveDays * 86_400_000).toISOString().slice(0, 10),
    });
    hasKickoff = run.tasks.some((t) => t.key === "welcome.book_kickoff");

    // A lead who already told us about their business skips that step.
    const intake = await getLatestIntake(client.id);
    if (intake && (intake.status === "submitted" || intake.status === "reviewed")) {
      await completeTaskByKey(run.onboarding.id, "intake.business_profile", "system");
    }
    if (client.lead_id) {
      await db().from("leads").update({ status: "converted" }).eq("id", client.lead_id);
    }
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
    if (client.status === "pending" || client.status === "lead") {
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
    // A Webline buyer is welcomed by email now, at the moment of purchase. This
    // branch runs once per new onboarding, so a retried Stripe webhook cannot
    // send it twice. Skipped when an admin adds an offline client without an
    // invite. If building or sending it fails, nothing else here is affected,
    // and the first-sign-in welcome still goes out as the fallback, because
    // that one is only held back when this one is logged as sent.
    let welcome: WelcomeEmail | null = null;
    if (shouldInvite && product?.id === "webline") {
      try {
        const display = await getDisplayProduct(product.id);
        welcome = weblineWelcomeEmail({
          businessName: client.business_name,
          firstName: (input.name || "").trim().split(/\s+/)[0] || null,
          liveInDays: product.onboarding.targetLiveDays,
          access: member.status !== "invited" ? "signed_in" : invite?.ok ? "invited" : "self_serve",
          care:
            product.care && display?.monthly
              ? {
                  name: product.care.name,
                  monthly: formatMoney(display.monthly.amount, display.currency),
                  trialDays: display.monthly.trialDays,
                }
              : null,
        });
      } catch (err) {
        console.error("[provision] webline welcome not built", err instanceof Error ? err.message : String(err));
      }
    }

    await createNotification({
      client_id: client.id,
      member_id: member.id,
      template_key: "welcome",
      ...(welcome ? { email: { to: email, subject: welcome.subject, html: welcome.html, tags: welcome.tags } } : {}),
      subject: `Welcome to Tekmadev, ${client.business_name}`,
      body: hasKickoff
        ? "Your onboarding has started. Two quick things to do today: accept your agreement and book your kickoff call."
        : "Your build has started. Two quick things to do today: accept your agreement and tell us about your business. We start designing the moment we have them.",
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
