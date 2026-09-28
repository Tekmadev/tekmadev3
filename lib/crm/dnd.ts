/**
 * Do Not Disturb, in both directions, with the casing and the polarity in one
 * place so there is exactly one line either can be got wrong on.
 *
 * The polarity is inverted from intuition: status "active" means DND is ON,
 * that is SUPPRESSED. "inactive" means contactable. "permanent" is terminal
 * (hard bounce, spam complaint, carrier opt-out) and per the CRM's own docs
 * needs a contact-initiated opt-in or a support ticket to clear, so we never
 * try to clear it.
 *
 * The casing differs by direction. The v3 REST API uses lowercase channel keys
 * (call, email, sms, whatsApp, gmb, fb). Webhook payloads are NOT version
 * negotiated and arrive with the legacy capitalised keys (Call, Email, SMS,
 * WhatsApp, GMB, FB). So: read both, write lowercase only.
 */

export type CrmDndState = "unknown" | "inactive" | "active" | "permanent";

/** The email channel's settings under whichever spelling this payload used. */
function emailChannel(dndSettings: unknown): { status?: unknown; code?: unknown } | null {
  if (!dndSettings || typeof dndSettings !== "object") return null;
  const bag = dndSettings as Record<string, unknown>;
  for (const key of Object.keys(bag)) {
    if (key.toLowerCase() !== "email") continue;
    const channel = bag[key];
    if (channel && typeof channel === "object") return channel as { status?: unknown; code?: unknown };
  }
  return null;
}

/**
 * The CRM's email DND state, normalised, plus a tripwire.
 *
 * `conflict` is set when the unambiguous global `dnd` boolean disagrees with
 * our reading of the email channel. That flag matters more than it looks: if
 * the polarity were ever backwards, a DND-ON event would read as "contactable"
 * and we would quietly do nothing, leaving someone who opted out marked
 * active. Corroborating against the boolean turns that silent failure into an
 * alert. The probe catches an inverted reading at setup; this catches a
 * mid-flight change to their schema.
 *
 * Pass `globalDnd` whenever the payload carried it. When it is absent there is
 * nothing to corroborate against and `conflict` stays false.
 */
export function readEmailDnd(
  dndSettings: unknown,
  globalDnd?: unknown,
): { state: CrmDndState; code: string | null; conflict: boolean } {
  const channel = emailChannel(dndSettings);
  const raw = typeof channel?.status === "string" ? channel.status.trim().toLowerCase() : "";
  const state: CrmDndState =
    raw === "active" ? "active" : raw === "inactive" ? "inactive" : raw === "permanent" ? "permanent" : "unknown";
  const code = typeof channel?.code === "string" && channel.code.trim() !== "" ? channel.code.trim() : null;

  // Only a literal boolean is evidence. A missing or string-valued `dnd` says
  // nothing, and treating it as false would flag every ordinary contact.
  const suppressed = state === "active" || state === "permanent";
  const conflict = typeof globalDnd === "boolean" && state !== "unknown" && globalDnd !== suppressed;

  return { state, code, conflict };
}

/**
 * The body for a write. Lowercase key, lowercase status, email channel only.
 *
 * "permanent" is not writable on purpose: it is the CRM's own terminal state
 * and asserting it would claim a hard bounce or a spam complaint we cannot
 * prove. `code` records why we suppressed (OPTED_OUT, BOUNCED, COMPLAINED) and
 * is omitted when there is nothing to say.
 */
export function writeEmailDnd(
  state: "active" | "inactive",
  code?: string,
): { dndSettings: { email: { status: string; code?: string } } } {
  const trimmed = code?.trim();
  return { dndSettings: { email: { status: state, ...(trimmed ? { code: trimmed } : {}) } } };
}
