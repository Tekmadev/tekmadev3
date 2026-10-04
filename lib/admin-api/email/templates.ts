import { marketingEmailTemplates } from "@/lib/email-templates.generated";

/**
 * GET /email/templates, in its own module so the other email routes do not
 * load the generated template HTML.
 */

export type ApiEmailTemplate = { key: string; name: string; subject: string; useWhen: string; html: string; previewHtml: string };

/** The open pixel (/api/e/o): previewing in the app must never count as an open. */
const OPEN_PIXEL = /<img\b[^>]*\bsrc="[^"]*\/api\/e\/o\b[^"]*"[^>]*>/gi;

let templatesCache: ApiEmailTemplate[] | null = null;

/**
 * GET /email/templates: the marketing emails the web admin's template gallery
 * shows (lib/email-templates.generated.ts). `html` is exactly what gets pasted
 * into the CRM, merge tags untouched; `previewHtml` is the generated preview
 * (sample values in place of merge tags) without the tracking pixel.
 */
export function listEmailTemplates(): ApiEmailTemplate[] {
  if (!templatesCache) {
    templatesCache = marketingEmailTemplates.map((t) => ({
      key: t.key,
      name: t.name,
      subject: t.subject,
      useWhen: t.useWhen,
      html: t.html,
      previewHtml: t.previewHtml.replace(OPEN_PIXEL, ""),
    }));
  }
  return templatesCache;
}
