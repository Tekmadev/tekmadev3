import { Resend } from "resend";
import { business } from "@/config/site";

/**
 * Transactional email (welcome, nudges, notifications we actually deliver).
 * Deliberately separate from the Supabase Auth emails, which Supabase sends
 * itself for invites, password resets, and sign-up confirmations.
 *
 * Degrades quietly: with no RESEND_API_KEY the call is skipped and reported,
 * never thrown, so a missing key can never break a sign-up or a checkout.
 * This module must not import lib/clients-data (that imports this one).
 */

export type MailResult =
  | { ok: true; id: string | null }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped?: false; error: string };

export type MailInput = {
  to: string;
  subject: string;
  html: string;
  /** Plain-text fallback. Generated from the HTML when omitted. */
  text?: string;
  replyTo?: string;
  /** Resend tags for filtering in their dashboard. Values must be ASCII letters, numbers, _ or -. */
  tags?: { name: string; value: string }[];
  /** Extra mail headers. For List-Unsubscribe pass `unsubscribeToken` instead, so no caller has to remember the pair. */
  headers?: Record<string, string>;
  /**
   * The recipient's `subscribers.unsubscribe_token`. Set it on marketing-class
   * mail, anything a person may opt out of, and the List-Unsubscribe pair is
   * added for them. Leave it unset on transactional mail: a receipt or a
   * password link is not something to invite an opt-out from.
   */
  unsubscribeToken?: string | null;
};

/**
 * The one-click List-Unsubscribe pair for one subscriber token. Gmail and
 * Yahoo expect both headers on bulk mail, and a message that carries them
 * gets the mailbox's own unsubscribe control instead of its spam button.
 *
 * www on purpose. The bare domain answers with a 307 to www, and a provider
 * firing the one-click POST is not obliged to follow a redirect, so the bare
 * host can turn a working unsubscribe into a silent failure.
 *
 * Never wrap this URL in /api/e/c. The click tracker writes the destination it
 * forwards to into `email_events.url`, which would file the person's
 * unsubscribe token in an engagement row.
 */
export function unsubscribeHeaders(token: string): Record<string, string> {
  const url = `${business.url}/unsubscribe?t=${encodeURIComponent(token)}`;
  return {
    "List-Unsubscribe": `<${url}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

/** The From header. Its domain must be verified in Resend before anything sends. */
export function mailFrom(): string {
  return process.env.MAIL_FROM || `${business.name} <${business.email}>`;
}

export function mailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/** Crude but reliable HTML to text, so every email has a plain-text part. */
function toPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h1|h2|h3|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .trim();
}

export async function sendMail(input: MailInput): Promise<MailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn(`[mail] RESEND_API_KEY not set; skipped "${input.subject}" to ${input.to}`);
    return { ok: false, skipped: true, reason: "RESEND_API_KEY not set" };
  }

  const to = input.to.trim().toLowerCase();
  if (!to.includes("@")) return { ok: false, error: "invalid recipient" };

  // Caller headers go last so an explicit List-Unsubscribe still wins.
  const token = input.unsubscribeToken?.trim();
  const headers = { ...(token ? unsubscribeHeaders(token) : {}), ...input.headers };

  try {
    const resend = new Resend(key);
    const { data, error } = await resend.emails.send({
      from: mailFrom(),
      to: [to],
      subject: input.subject,
      html: input.html,
      text: input.text ?? toPlainText(input.html),
      replyTo: input.replyTo ?? business.email,
      ...(input.tags?.length ? { tags: input.tags } : {}),
      ...(Object.keys(headers).length ? { headers } : {}),
    });

    if (error) {
      console.error("[mail] send failed", error.name, error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true, id: data?.id ?? null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[mail] send threw", message);
    return { ok: false, error: message };
  }
}
