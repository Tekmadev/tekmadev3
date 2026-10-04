import { route } from "@/lib/admin-api";
import { listEmailTemplates } from "@/lib/admin-api/email/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /email/templates -> { key, name, subject, useWhen, html, previewHtml }[].
 * email.view (owner and staff). `html` is copied exactly (merge tags intact);
 * `previewHtml` has sample values and no tracking pixel.
 */
export const GET = route({ method: "GET", capability: "email.view" }, () => listEmailTemplates());
