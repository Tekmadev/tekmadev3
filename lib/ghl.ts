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
