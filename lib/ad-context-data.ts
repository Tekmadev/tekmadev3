import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * The browser context of a visitor who accepted advertising cookies.
 *
 * A Cal or Stripe webhook has no browser, so it cannot know the ad click that
 * led to a booking or a sale. Rather than pushing Meta's ids, the IP and the
 * user agent through Cal and Stripe metadata, the browser registers them here
 * once and only a short id travels. No row is ever written without consent,
 * which makes "is there a context?" the consent check for every server event.
 */

export type AdContext = {
  id: string;
  created_at: string;
  fbp: string | null;
  fbc: string | null;
  client_ip: string | null;
  client_user_agent: string | null;
  landing_url: string | null;
  country: string | null;
  booking_uid: string | null;
};

const COLS = "id,created_at,fbp,fbc,client_ip,client_user_agent,landing_url,country,booking_uid";
const RETENTION_DAYS = 90;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isContextId(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

export async function createAdContext(input: {
  fbp: string | null;
  fbc: string | null;
  clientIp: string | null;
  clientUserAgent: string | null;
  landingUrl: string | null;
  country: string | null;
  consentVersion: string | null;
}): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("ad_contexts")
    .insert({
      fbp: input.fbp,
      fbc: input.fbc,
      client_ip: input.clientIp,
      client_user_agent: input.clientUserAgent,
      landing_url: input.landingUrl,
      country: input.country,
      consent_version: input.consentVersion,
      consent_marketing: true,
    })
    .select("id")
    .single();
  if (error) {
    console.error("[ad_contexts] insert failed", error.message);
    return null;
  }

  // Housekeeping rides along on a fraction of inserts, so retention holds
  // without a cron job and without a delete on every request.
  if (Math.random() < 0.05) {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    void supabase.from("ad_contexts").delete().lt("created_at", cutoff).then(() => undefined);
  }

  return data.id as string;
}

export async function getAdContext(id: unknown): Promise<AdContext | null> {
  if (!isContextId(id)) return null;
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data } = await supabase.from("ad_contexts").select(COLS).eq("id", id).maybeSingle();
  return (data as AdContext | null) ?? null;
}

/** The browser calls this when a Cal booking completes, so the webhook can find the context. */
export async function linkBookingToContext(id: string, bookingUid: string): Promise<boolean> {
  if (!isContextId(id)) return false;
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  const { error } = await supabase.from("ad_contexts").update({ booking_uid: bookingUid }).eq("id", id);
  if (error) console.error("[ad_contexts] booking link failed", error.message);
  return !error;
}

export async function getAdContextByBooking(bookingUid: string): Promise<AdContext | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data } = await supabase.from("ad_contexts").select(COLS).eq("booking_uid", bookingUid).maybeSingle();
  return (data as AdContext | null) ?? null;
}
