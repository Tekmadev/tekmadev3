import type { User } from "@supabase/supabase-js";
import {
  createClient,
  createNotification,
  db,
  getClientByEmail,
  getMembershipsForUser,
  logActivity,
  updateMember,
  upsertMember,
  type MembershipWithClient,
} from "@/lib/clients-data";

/**
 * Self-serve accounts. A person who signs up on the portal (email + password,
 * or Google) becomes a client with status `lead` and an owner membership,
 * plus a `leads` row so the funnel view in the admin stays in one place. No
 * plan, no payment, no onboarding: they can fill in the business intake,
 * upload a logo, book a call, and pick a plan. When they pay, the webhook's
 * provisionClient() finds this same account and starts onboarding.
 *
 * Only called for a user whose email is verified (a confirmed sign-up, or
 * Google), never at the moment of an unconfirmed sign-up: otherwise anyone
 * could pre-create an account on someone else's email.
 */

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;
const CLICK_ID_KEYS = ["gclid", "fbclid", "ttclid", "msclkid", "li_fat_id"] as const;

function str(v: unknown, max = 200): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}

function attributionFrom(meta: Record<string, unknown>): Record<string, string> {
  const raw = meta.attribution;
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const k of [...UTM_KEYS, ...CLICK_ID_KEYS, "referrer", "landing_page"]) {
    const v = str((raw as Record<string, unknown>)[k], 480);
    if (v) out[k] = v;
  }
  return out;
}

/**
 * Returns the user's memberships, creating a lead account first when they
 * have none. Idempotent: a second call finds the membership and returns.
 */
export async function ensureLeadAccount(user: User): Promise<MembershipWithClient[]> {
  const existing = await getMembershipsForUser(user.id, user.email);
  if (existing.length) return existing;

  const email = (user.email || "").trim().toLowerCase();
  if (!email) return [];

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const name = str(meta.name, 120) ?? str(meta.full_name, 120);
  const provider = str(user.app_metadata?.provider) ?? "email";
  const attribution = attributionFrom(meta);
  const now = new Date().toISOString();

  // A record staff created for this email (no member yet) is theirs: attach
  // rather than duplicate. Email ownership is proven at this point.
  let client = await getClientByEmail(email);
  let created = false;

  if (!client) {
    const businessName = str(meta.business_name, 200) ?? (name ? `${name}'s business` : email.split("@")[1] || "New business");

    const { data: lead } = await db()
      .from("leads")
      .insert({
        source: "portal_signup",
        status: "signed_up",
        name,
        email,
        phone: null,
        utm_source: attribution.utm_source ?? null,
        utm_medium: attribution.utm_medium ?? null,
        utm_campaign: attribution.utm_campaign ?? null,
        utm_term: attribution.utm_term ?? null,
        utm_content: attribution.utm_content ?? null,
        click_ids: Object.fromEntries(CLICK_ID_KEYS.filter((k) => attribution[k]).map((k) => [k, attribution[k]])),
        referrer: attribution.referrer ?? null,
        landing_page: attribution.landing_page ?? null,
        raw: { user_id: user.id, business_name: businessName, provider },
      })
      .select("id")
      .maybeSingle();

    client = await createClient({
      business_name: businessName,
      primary_email: email,
      plan_id: null,
      status: "lead",
      source: "self_serve",
      lead_id: (lead as { id: string } | null)?.id ?? null,
      guarantee_eligible: false,
      guarantee_status: "not_eligible",
      created_by: email,
      metadata: {
        attribution,
        signup: { at: now, provider, terms_accepted_at: str(meta.terms_accepted_at, 40) },
      },
    });
    created = true;
  }

  const member = await upsertMember({
    client_id: client.id,
    email,
    name,
    role: "owner",
    invited_by: "self_serve",
    user_id: user.id,
  });
  if (member.status !== "active") await updateMember(member.id, { status: "active", accepted_at: now });

  await logActivity({
    client_id: client.id,
    actor_type: "client",
    actor_email: email,
    event: created ? "client.signed_up" : "member.self_joined",
    entity_type: "client",
    entity_id: client.id,
    summary: created ? `${name || email} created a free account (${client.business_name})` : `${name || email} signed in to their account`,
    visibility: "client",
  });

  if (created) {
    await createNotification({
      client_id: client.id,
      member_id: member.id,
      template_key: "lead_welcome",
      subject: `Welcome to Tekmadev, ${client.business_name}`,
      body: "Tell us about your business and we can show you exactly what a booked-call system looks like for you. No card, no commitment.",
      action_url: "/intake",
    });
  }

  return getMembershipsForUser(user.id, email);
}
