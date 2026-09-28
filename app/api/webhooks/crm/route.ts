import { NextResponse, after, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { hourKey, notifyAdmins } from "@/lib/admin-notify";
import { crmWebhookKey } from "@/lib/crm/config";
import { processCrmDelivery, readDeliveryFacts, recordDelivery } from "@/lib/crm/inbox";

// Ed25519 verification needs the raw request bytes, so this must run on Node.
export const runtime = "nodejs";

/**
 * Inbound CRM webhooks: contact consent changes and client appointments.
 *
 * The path is neutral on purpose. The vendor may be named on an admin screen,
 * but a URL on our own domain is a needless disclosure.
 *
 * The order below is load-bearing:
 *
 *  1. Read the raw body text FIRST. Parsing and re-stringifying changes byte
 *     order and whitespace, and the signature is over the bytes they sent.
 *  2. Verify, and FAIL CLOSED. A missing or bad signature is always a 401. This
 *     endpoint can suppress arbitrary email addresses, so it does not copy the
 *     Cal route's skip-when-the-secret-is-absent pattern: the key here is a
 *     documented constant baked into lib/crm/config.ts, so there is no
 *     unconfigured state that opens the door.
 *  3. Store the delivery, verified or not.
 *  4. Reject a body outside the replay window.
 *  5. Insert the row synchronously. The unique dedupe_key is the whole replay
 *     defence, and a duplicate is answered at once with nothing reprocessed.
 *  6. Answer 200 NOW.
 *  7. Apply it in after().
 *
 * Six before seven is not a nicety. Their own reviews pause delivery to a
 * webhook URL whose success rate drops, and for a DND event a pause is a silent
 * compliance failure: a handler doing synchronous Supabase writes that
 * occasionally time out can switch itself off. So their retries are not our
 * retry mechanism. Ours is the crm_inbox row: anything left pending, failed or
 * unmapped is swept by the cron, which is strictly stronger than depending on
 * the sender.
 *
 * No rate limiting, matching the house rule for /api/webhooks/*: these are
 * gated by signature instead, and proxy.ts already leaves the path alone.
 */

/** Their retry queue can be slow, and the replay guard is measured one way only. */
const REPLAY_WINDOW_MS = 10 * 60 * 1000;

/** Credentials a prober might send us have no business in our database. */
const SKIP_HEADERS = new Set(["cookie", "authorization", "proxy-authorization"]);

// Anyone can POST junk here. The hourly dedupe key stops a flood of rows but
// not a flood of database calls, so this instance alerts at most once an hour.
let lastSignatureAlert = "";

// Rebuilt only when the key itself changes, so a rotation applied through the
// env var takes effect on a warm function without a deploy.
let cachedKeyB64 = "";
let cachedKey: crypto.KeyObject | null = null;

function publicKey(): crypto.KeyObject | null {
  const b64 = crmWebhookKey();
  if (cachedKey && cachedKeyB64 === b64) return cachedKey;
  try {
    const key = crypto.createPublicKey({ key: Buffer.from(b64, "base64"), format: "der", type: "spki" });
    cachedKeyB64 = b64;
    cachedKey = key;
    return key;
  } catch (err) {
    console.error("[crm webhook] the signing key will not load", err instanceof Error ? err.message : String(err));
    return null;
  }
}

/** Ed25519 over the raw body bytes, base64 signature. Never throws: a malformed one is simply invalid. */
function verifySignature(body: string, signature: string | null): boolean {
  if (!signature) return false;
  const key = publicKey();
  if (!key) return false;
  try {
    return crypto.verify(null, Buffer.from(body, "utf8"), key, Buffer.from(signature, "base64"));
  } catch (err) {
    console.error("[crm webhook] signature check failed", err instanceof Error ? err.message : String(err));
    return false;
  }
}

/**
 * Kept as evidence. Their signing documentation is demonstrably stale (it still
 * describes a deprecation in the future tense for a date that has passed), so
 * what actually arrives on the first real delivery beats guessing which header
 * carries the signature.
 */
function collectHeaders(req: NextRequest): Record<string, string> {
  const out: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    if (SKIP_HEADERS.has(key.toLowerCase())) return;
    out[key] = value.length > 512 ? `${value.slice(0, 512)}...` : value;
  });
  return out;
}

export async function POST(req: NextRequest) {
  // 1. Raw bytes first, always.
  const body = await req.text();
  const signature = req.headers.get("x-ghl-signature");
  const headers = collectHeaders(req);

  let payload: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(body);
    payload = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    payload = null;
  }

  const facts = payload ? readDeliveryFacts(payload) : null;
  // A body we cannot read still needs a stable key, or a replayed junk POST
  // would write a new row every time it arrived.
  const dedupeKey = facts?.dedupeKey ?? `sha256:${crypto.createHash("sha256").update(body).digest("hex")}`;
  const evidence: Record<string, unknown> = payload ?? {
    unparseable: true,
    body_preview: body.slice(0, 2000),
  };

  // 2. Fail closed.
  if (!verifySignature(body, signature)) {
    // 3. Stored anyway, with its headers, because an unverified delivery is the
    // only evidence of what their platform actually sends.
    await recordDelivery({
      dedupeKey,
      eventType: facts?.eventType || "unverified",
      locationId: facts?.locationId ?? null,
      ghlContactId: facts?.ghlContactId ?? null,
      emailKey: facts?.emailKey ?? null,
      occurredAt: facts?.occurredAt ?? null,
      payload: evidence,
      headers,
      signatureOk: false,
    });

    console.error("[crm webhook] signature rejected", facts?.eventType ?? "unparseable");
    if (lastSignatureAlert !== hourKey("crm_sig")) {
      lastSignatureAlert = hourKey("crm_sig");
      await notifyAdmins({
        event: "crm.webhook_unverified",
        title: "A CRM webhook arrived that we could not verify",
        body: "Either the signing key on their side changed, or someone is probing the endpoint. Consent changes are not being applied if it is the key. The deliveries are stored on the CRM page.",
        url: "/admin/crm",
        dedupeKey: hourKey("crm_sig"),
        collapse: true,
      });
    }
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  // Signed but unreadable. Recorded as dead rather than retried: a body that is
  // not JSON will not become JSON, and the stored copy is what makes it
  // diagnosable at all.
  if (!payload || !facts) {
    await recordDelivery({
      dedupeKey,
      eventType: "unparseable",
      payload: evidence,
      headers,
      signatureOk: true,
      status: "dead",
    });
    return NextResponse.json({ error: "Bad JSON." }, { status: 400 });
  }

  // 4. Replay guard. webhookId and timestamp are BODY fields on these webhooks,
  // not headers. A missing timestamp is not an old one, so it passes: the
  // dedupe key already makes a replay a no-op, and dropping every event whose
  // payload happens to omit the field would lose real consent changes.
  if (facts.timestamp && Date.now() - Date.parse(facts.timestamp) > REPLAY_WINDOW_MS) {
    await recordDelivery({
      dedupeKey,
      eventType: facts.eventType,
      locationId: facts.locationId,
      ghlContactId: facts.ghlContactId,
      emailKey: facts.emailKey,
      occurredAt: facts.occurredAt,
      payload,
      headers,
      signatureOk: true,
      status: "stale",
    });
    // 200, not an error: a genuine delivery held up in their retry queue must
    // not count against the success rate they review the URL on, and the
    // nightly reconcile is the backstop for anything dropped here.
    return NextResponse.json({ received: true, stale: true });
  }

  // 5. The row is committed before anything is understood.
  const stored = await recordDelivery({
    dedupeKey,
    eventType: facts.eventType,
    locationId: facts.locationId,
    ghlContactId: facts.ghlContactId,
    emailKey: facts.emailKey,
    occurredAt: facts.occurredAt,
    payload,
    headers,
    signatureOk: true,
  });

  if (!stored.ok) {
    // No durable row, so their retry is the only remaining copy of this event.
    // Answering 200 here would lose it, which is the one outcome this whole
    // design exists to make impossible.
    await notifyAdmins({
      event: "crm.sync_stuck",
      title: "A CRM webhook could not be stored",
      body: `${facts.eventType} · ${stored.error}. The sender will retry, and nothing is applied until one of those retries is saved.`,
      url: "/admin/crm",
      severity: "critical",
      dedupeKey: hourKey("crm_inbox_store"),
      collapse: true,
    });
    return NextResponse.json({ error: "Handler error." }, { status: 500 });
  }

  // Already seen. Nothing is reprocessed: the first delivery either applied it
  // or left a row the cron is still responsible for.
  if (stored.duplicate) return NextResponse.json({ received: true, duplicate: true });

  // 7. Applied after the response. If this never runs, or fails, the row stays
  // pending and the cron sweeps it.
  const id = stored.id;
  after(() => processCrmDelivery(id));

  // 6. Answered now.
  return NextResponse.json({ received: true });
}
