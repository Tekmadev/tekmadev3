import { business } from "@/config/site";

/**
 * Branded HTML shell for transactional email, matching the Supabase auth
 * templates in docs/email-templates/auth so every Tekmadev email looks the
 * same. Table-based and inline-styled, because that is what mail clients
 * render reliably. Light only: many clients invert dark palettes badly.
 */

const LOGO = "https://res.cloudinary.com/dnly2ngqc/image/upload/f_png,w_180/v1756916100/TMD2_logo_dom1iq.png";
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Escapes text destined for HTML. Every caller-supplied string goes through this. */
export function esc(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type MailStep = { title: string; body: string };

export type MailLayout = {
  /** Hidden line shown next to the subject in most inboxes. */
  preheader: string;
  heading: string;
  /** Lead paragraphs, in order. */
  paragraphs: string[];
  steps?: MailStep[];
  cta?: { label: string; url: string };
  /** Small print under the button. */
  note?: string;
  /** Extra footer line above the company block. */
  footerNote?: string;
};

function paragraph(text: string): string {
  return `<p style="margin:0 0 18px;font-family:${SANS};font-size:15px;line-height:1.65;color:#5a564d;">${esc(text)}</p>`;
}

function stepsBlock(steps: MailStep[]): string {
  const rows = steps
    .map(
      (s, i) => `
              <tr>
                <td width="28" valign="top" style="padding:0 12px 14px 0;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                    <td align="center" width="24" height="24" bgcolor="#f4ebd6" style="width:24px;height:24px;border-radius:12px;font-family:${SANS};font-size:12px;font-weight:700;color:#7a5b3a;">${i + 1}</td>
                  </tr></table>
                </td>
                <td valign="top" style="padding:0 0 14px;">
                  <p style="margin:0 0 3px;font-family:${SANS};font-size:15px;font-weight:700;line-height:1.4;color:#0d0c0a;">${esc(s.title)}</p>
                  <p style="margin:0;font-family:${SANS};font-size:14px;line-height:1.6;color:#5a564d;">${esc(s.body)}</p>
                </td>
              </tr>`,
    )
    .join("");

  return `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 8px;">${rows}
              </table>`;
}

function ctaBlock(cta: { label: string; url: string }): string {
  return `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0 4px;">
                <tr>
                  <td align="center" bgcolor="#a17a4f" style="border-radius:999px;">
                    <a href="${esc(cta.url)}" target="_blank" style="display:inline-block;padding:14px 34px;font-family:${SANS};font-size:15px;font-weight:700;line-height:1;color:#ffffff;text-decoration:none;border-radius:999px;">${esc(cta.label)}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:20px 0 0;font-family:${SANS};font-size:13px;line-height:1.5;color:#8a857a;">Or paste this link into your browser:</p>
              <p style="margin:6px 0 0;font-family:${SANS};font-size:13px;line-height:1.5;word-break:break-all;"><a href="${esc(cta.url)}" target="_blank" style="color:#a17a4f;text-decoration:none;">${esc(cta.url)}</a></p>`;
}

export function renderMail(l: MailLayout): string {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>${esc(l.heading)}</title>
</head>
<body style="margin:0;padding:0;background:#efeae0;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(l.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#efeae0;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="width:480px;max-width:480px;">
          <tr>
            <td align="center" style="padding:4px 0 24px;">
              <img src="${LOGO}" width="60" height="60" alt="${esc(business.name)}" style="display:block;border:0;outline:none;text-decoration:none;width:60px;height:60px;">
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;border:1px solid #e7e1d5;border-radius:16px;padding:40px;">
              <h1 style="margin:0 0 16px;font-family:${SANS};font-size:22px;font-weight:800;letter-spacing:-0.3px;line-height:1.25;color:#0d0c0a;">${esc(l.heading)}</h1>
              ${l.paragraphs.map(paragraph).join("\n              ")}
              ${l.steps?.length ? stepsBlock(l.steps) : ""}
              ${l.cta ? ctaBlock(l.cta) : ""}
              ${l.note ? `<p style="margin:24px 0 0;font-family:${SANS};font-size:13px;line-height:1.6;color:#8a857a;">${esc(l.note)}</p>` : ""}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 8px 8px;text-align:center;font-family:${SANS};font-size:12px;line-height:1.7;color:#8a857a;">
              ${l.footerNote ? `${esc(l.footerNote)}<br><br>` : ""}<strong style="color:#5a564d;">${esc(business.legalName)}</strong><br>
              <a href="${business.url}" target="_blank" style="color:#a17a4f;text-decoration:none;">${esc(business.domain)}</a>
              &nbsp;·&nbsp;<a href="mailto:${esc(business.email)}" style="color:#a17a4f;text-decoration:none;">${esc(business.email)}</a>
              &nbsp;·&nbsp;<a href="tel:${esc(business.phone.tel)}" style="color:#a17a4f;text-decoration:none;">${esc(business.phone.display)}</a><br><br>
              This is an automated message about your ${esc(business.name)} account.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
