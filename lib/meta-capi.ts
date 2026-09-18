import crypto from "node:crypto";
import { tracking } from "@/config/site";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { AdContext } from "@/lib/ad-context-data";

/**
 * Meta Conversions API: conversions reported from our server.
 *
 * The browser pixel misses what ad blockers and iOS hide, and it cannot see a
 * Cal booking or a Stripe payment at all. This reports those from the source
 * of truth. Callers pass the visitor's AdContext, which only exists if they
 * accepted advertising cookies, so without one nothing is sent.
 *
 * Contact details are SHA-256 hashed before they leave, as Meta requires.
 * Never throws: a Meta outage must not fail a webhook or lose a lead.
 */

const GRAPH_VERSION = "v25.0";
const TIMEOUT_MS = 4000;

export type MetaServerEvent = "Lead" | "Schedule" | "Purchase";

export type MetaUser = {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

export type MetaSendResult = { status: "sent" | "failed" | "skipped"; reason?: string };

const sha256 = (v: string) => crypto.createHash("sha256").update(v).digest("hex");

function hashed(v: string | null | undefined, normalize: (s: string) => string): string[] | undefined {
  if (!v) return undefined;
  const n = normalize(v);
  return n ? [sha256(n)] : undefined;
}

const lower = (s: string) => s.trim().toLowerCase();

/** Digits only, with a country code. A bare 10-digit number is North American. */
function phoneDigits(s: string): string {
  const d = s.replace(/\D/g, "");
  return d.length === 10 ? `1${d}` : d;
}

export function splitName(name: string | null | undefined): { firstName: string | null; lastName: string | null } {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  return { firstName: parts[0], lastName: parts.length > 1 ? parts[parts.length - 1] : null };
}

export function metaConfigured(): boolean {
  return Boolean(tracking.metaPixelId && process.env.META_CAPI_ACCESS_TOKEN);
}

export async function sendMetaEvent(input: {
  event: MetaServerEvent;
  /** Must equal the eventID the browser pixel used for the same conversion, if it fired one. */
  eventId: string;
  context: AdContext | null;
  user: MetaUser;
  sourceUrl?: string | null;
  eventTime?: Date;
  value?: number | null;
  currency?: string | null;
  custom?: Record<string, unknown>;
}): Promise<MetaSendResult> {
  // No context means no consent. This is the gate, not a missing-data fallback.
  if (!input.context) return { status: "skipped", reason: "no_consent_context" };
  if (!metaConfigured()) return { status: "skipped", reason: "not_configured" };

  const ctx = input.context;
  const user_data: Record<string, unknown> = {
    em: hashed(input.user.email, lower),
    ph: hashed(input.user.phone, phoneDigits),
    fn: hashed(input.user.firstName, lower),
    ln: hashed(input.user.lastName, lower),
    country: hashed(ctx.country, lower),
    fbp: ctx.fbp ?? undefined,
    fbc: ctx.fbc ?? undefined,
    client_ip_address: ctx.client_ip ?? undefined,
    client_user_agent: ctx.client_user_agent ?? undefined,
  };
  for (const k of Object.keys(user_data)) if (user_data[k] === undefined) delete user_data[k];
  const matchedOn = Object.keys(user_data).filter((k) => ["em", "ph", "fn", "ln", "fbp", "fbc"].includes(k));

  const testCode = process.env.META_TEST_EVENT_CODE || null;
  const supabase = getSupabaseAdmin();

  // Claim the conversion before sending. Stripe and Cal both retry webhooks;
  // the unique index on (platform, event_name, event_id) means a retry finds
  // the row and stops. A row left as `failed` may be tried again.
  let logId: string | null = null;
  if (supabase) {
    const claim = await supabase
      .from("ad_conversion_events")
      .insert({
        platform: "meta",
        event_name: input.event,
        event_id: input.eventId,
        context_id: ctx.id,
        matched_on: matchedOn,
        value: input.value ?? null,
        currency: input.currency ?? null,
        status: "failed",
        is_test: Boolean(testCode),
      })
      .select("id")
      .single();
    if (claim.error) {
      const { data: existing } = await supabase
        .from("ad_conversion_events")
        .select("id,status")
        .eq("platform", "meta")
        .eq("event_name", input.event)
        .eq("event_id", input.eventId)
        .maybeSingle();
      if (existing?.status === "sent") return { status: "skipped", reason: "already_sent" };
      logId = (existing?.id as string | undefined) ?? null;
    } else {
      logId = claim.data.id as string;
    }
  }

  const custom_data: Record<string, unknown> = { ...(input.custom ?? {}) };
  if (input.value != null) custom_data.value = input.value;
  if (input.currency) custom_data.currency = input.currency.toUpperCase();

  const body: Record<string, unknown> = {
    data: [
      {
        event_name: input.event,
        event_time: Math.floor((input.eventTime ?? new Date()).getTime() / 1000),
        event_id: input.eventId,
        action_source: "website",
        event_source_url: input.sourceUrl ?? ctx.landing_url ?? undefined,
        user_data,
        ...(Object.keys(custom_data).length ? { custom_data } : {}),
      },
    ],
    access_token: process.env.META_CAPI_ACCESS_TOKEN,
    ...(testCode ? { test_event_code: testCode } : {}),
  };

  let httpStatus: number | null = null;
  let response: unknown = null;
  let ok = false;
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${tracking.metaPixelId}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    httpStatus = res.status;
    response = await res.json().catch(() => null);
    ok = res.ok;
    if (!ok) console.error("[meta capi]", input.event, res.status, JSON.stringify(response)?.slice(0, 400));
  } catch (err) {
    console.error("[meta capi]", input.event, err instanceof Error ? err.message : String(err));
    response = { error: err instanceof Error ? err.message : String(err) };
  }

  if (supabase && logId) {
    await supabase
      .from("ad_conversion_events")
      .update({ status: ok ? "sent" : "failed", http_status: httpStatus, response })
      .eq("id", logId);
  }

  return { status: ok ? "sent" : "failed" };
}
