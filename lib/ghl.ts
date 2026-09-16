/**
 * Best-effort push of a new subscriber to GoHighLevel via an inbound webhook.
 *
 * Set GHL_INBOUND_WEBHOOK_URL (GHL -> Automation -> Workflow -> Inbound Webhook
 * trigger, copy its URL) to enable. No-op when unset, so the site works with or
 * without GHL. Never throws: the signup path must not fail because GHL is slow
 * or down. The subscriber is always stored first-party in Supabase either way.
 */
export async function pushSubscriberToGHL(sub: {
  email: string;
  name?: string | null;
  source?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
}): Promise<boolean> {
  const url = process.env.GHL_INBOUND_WEBHOOK_URL;
  if (!url) return false;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: sub.email,
        name: sub.name || undefined,
        source: sub.source || "tekmadev.com newsletter",
        tags: ["newsletter", "website"],
        utm_source: sub.utm_source || undefined,
        utm_medium: sub.utm_medium || undefined,
        utm_campaign: sub.utm_campaign || undefined,
      }),
      // Cap it so a slow GHL endpoint can never hold up the user's request.
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      console.error("[ghl] webhook returned", res.status);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[ghl] webhook push failed", err instanceof Error ? err.message : String(err));
    return false;
  }
}

/**
 * Best-effort push of a lead magnet submission to GoHighLevel.
 *
 * Posts to GHL_LEAD_WEBHOOK_URL when set, so the tool funnel can run its own
 * workflow, and otherwise falls back to the same inbound webhook the
 * newsletter uses. Every payload carries `event`, so one workflow can branch
 * on it rather than needing a second endpoint.
 *
 * `consent.marketing` is passed through deliberately: asking for a report is
 * an inquiry, ticking the box is consent to ongoing marketing, and the
 * workflow on the other side has to be able to tell them apart.
 *
 * Same contract as the subscriber push: no-op when unset, never throws, hard
 * timeout, and the submission is already stored first-party in Supabase.
 */
export async function pushLeadMagnetToGHL(sub: {
  magnet: string;
  magnetName: string;
  email: string;
  name?: string | null;
  company?: string | null;
  phone?: string | null;
  /** The one number worth routing on. Revenue leak calculator: dollars a month. */
  score?: number | null;
  /** Flattened answers and results, for GHL custom fields. */
  fields?: Record<string, string | number | null | undefined>;
  consentMarketing: boolean;
  source?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
}): Promise<boolean> {
  const url = process.env.GHL_LEAD_WEBHOOK_URL || process.env.GHL_INBOUND_WEBHOOK_URL;
  if (!url) return false;

  const tags = ["lead-magnet", sub.magnet, "website"];
  if (sub.consentMarketing) tags.push("newsletter");

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        event: "lead_magnet",
        magnet: sub.magnet,
        magnet_name: sub.magnetName,
        email: sub.email,
        name: sub.name || undefined,
        company: sub.company || undefined,
        phone: sub.phone || undefined,
        score: sub.score ?? undefined,
        source: sub.source || `tekmadev.com ${sub.magnetName}`,
        tags,
        consent: { marketing: sub.consentMarketing },
        utm_source: sub.utm_source || undefined,
        utm_medium: sub.utm_medium || undefined,
        utm_campaign: sub.utm_campaign || undefined,
        ...(sub.fields || {}),
      }),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      console.error("[ghl] lead magnet webhook returned", res.status);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[ghl] lead magnet push failed", err instanceof Error ? err.message : String(err));
    return false;
  }
}
