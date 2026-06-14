// Generates the Supabase auth email templates from one shared, on-brand layout.
// Run:  node docs/email-templates/build.mjs
// Output: one <name>.html per template (paste the body into Supabase) + INDEX.md.
// Edit the brand constants or copy below, then re-run to regenerate all of them.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DIR = dirname(fileURLToPath(import.meta.url));

const C = {
  bg: "#efeae0",
  card: "#ffffff",
  ink: "#0d0c0a",
  ink3: "#5a564d",
  ink4: "#8a857a",
  gold: "#a17a4f",
  line: "#e7e1d5",
  soft: "#f5f2eb",
};
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace";

const BUSINESS = {
  name: "Tekmadev",
  legalName: "Tekmadev Innovation Inc.",
  site: "https://tekmadev.com",
  // SVG rasterized to PNG by Cloudinary (email clients do not render SVG).
  // w_180 is a 2x asset for a ~60px display size.
  logo: "https://res.cloudinary.com/dnly2ngqc/image/upload/f_png,w_180/v1756916100/TMD2_logo_dom1iq.png",
};

function button(label, href) {
  return `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px;">
                <tr>
                  <td align="center" bgcolor="${C.gold}" style="border-radius:999px;">
                    <a href="${href}" target="_blank" style="display:inline-block;padding:14px 34px;font-family:${FONT};font-size:15px;font-weight:700;line-height:1;color:#ffffff;text-decoration:none;border-radius:999px;">${label}</a>
                  </td>
                </tr>
              </table>`;
}

function fallbackLink(href) {
  return `
              <p style="margin:22px 0 0;font-family:${FONT};font-size:13px;line-height:1.5;color:${C.ink4};">Or paste this link into your browser:</p>
              <p style="margin:6px 0 0;font-family:${FONT};font-size:13px;line-height:1.5;word-break:break-all;"><a href="${href}" target="_blank" style="color:${C.gold};text-decoration:none;">${href}</a></p>`;
}

function codeBlock(code) {
  return `
              <div style="margin:10px 0 4px;padding:18px;background:${C.soft};border:1px solid ${C.line};border-radius:12px;text-align:center;font-family:${MONO};font-size:30px;font-weight:700;letter-spacing:8px;color:${C.ink};">${code}</div>`;
}

function base({ subject, preheader, heading, body, action, note }) {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="width:480px;max-width:480px;">
          <tr>
            <td align="center" style="padding:4px 0 24px;">
              <img src="${BUSINESS.logo}" width="60" height="60" alt="${BUSINESS.name}" style="display:block;border:0;outline:none;text-decoration:none;width:60px;height:60px;">
            </td>
          </tr>
          <tr>
            <td style="background:${C.card};border:1px solid ${C.line};border-radius:16px;padding:40px;">
              <h1 style="margin:0 0 16px;font-family:${FONT};font-size:22px;font-weight:800;letter-spacing:-0.3px;line-height:1.25;color:${C.ink};">${heading}</h1>
              ${body}
              ${action}
              <p style="margin:24px 0 0;font-family:${FONT};font-size:13px;line-height:1.6;color:${C.ink4};">${note}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 8px 8px;text-align:center;font-family:${FONT};font-size:12px;line-height:1.7;color:${C.ink4};">
              <strong style="color:${C.ink3};">${BUSINESS.legalName}</strong><br>
              <a href="${BUSINESS.site}" target="_blank" style="color:${C.gold};text-decoration:none;">tekmadev.com</a><br><br>
              This is an automated message about your ${BUSINESS.name} account.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function p(text) {
  return `<p style="margin:0 0 22px;font-family:${FONT};font-size:15px;line-height:1.65;color:${C.ink3};">${text}</p>`;
}

const URL = "{{ .ConfirmationURL }}";

const templates = [
  {
    file: "confirm-signup.html",
    supabase: "Confirm sign up",
    subject: "Confirm your email for Tekmadev",
    preheader: "Confirm your email address to activate your account.",
    heading: "Confirm your email",
    body: p("Thanks for signing up. Confirm this email address to activate your account."),
    action: button("Confirm email", URL) + fallbackLink(URL),
    note: "If you didn't create a Tekmadev account, you can safely ignore this email.",
  },
  {
    file: "invite.html",
    supabase: "Invite user",
    subject: "You've been invited to Tekmadev",
    preheader: "You've been invited to join the Tekmadev dashboard.",
    heading: "You're invited",
    body: p("You've been invited to access the Tekmadev dashboard. Use the button below to set up your account."),
    action: button("Accept invitation", URL) + fallbackLink(URL),
    note: "If you weren't expecting this invitation, you can safely ignore this email.",
  },
  {
    file: "magic-link.html",
    supabase: "Magic link or OTP",
    subject: "Your Tekmadev sign-in link",
    preheader: "Your secure sign-in link for Tekmadev.",
    heading: "Sign in to Tekmadev",
    body: p("Use the button below to sign in. This link expires shortly and can only be used once."),
    action: button("Sign in", URL) + fallbackLink(URL),
    note: "If you didn't request this link, you can safely ignore this email.",
  },
  {
    file: "change-email.html",
    supabase: "Change email address",
    subject: "Confirm your new email address",
    preheader: "Confirm your new email address for Tekmadev.",
    heading: "Confirm your new email",
    body:
      p("We received a request to change the email on your Tekmadev account from <strong style=\"color:" + C.ink + ";\">{{ .Email }}</strong> to <strong style=\"color:" + C.ink + ";\">{{ .NewEmail }}</strong>.") +
      p("Confirm the change with the button below."),
    action: button("Confirm new email", URL) + fallbackLink(URL),
    note: "If you didn't request this change, please contact us right away at hi@tekmadev.com.",
  },
  {
    file: "reset-password.html",
    supabase: "Reset password",
    subject: "Reset your Tekmadev password",
    preheader: "Reset your Tekmadev password.",
    heading: "Reset your password",
    body: p("We received a request to reset your password. Choose a new one with the button below."),
    action: button("Reset password", URL) + fallbackLink(URL),
    note: "If you didn't request this, you can safely ignore this email. Your password won't change.",
  },
  {
    file: "reauthentication.html",
    supabase: "Reauthentication",
    subject: "Your Tekmadev verification code",
    preheader: "Your verification code: {{ .Token }}",
    heading: "Verify it's you",
    body: p("Enter this code to confirm a sensitive action on your account:"),
    action: codeBlock("{{ .Token }}"),
    note: "This code expires in a few minutes. If you didn't request it, you can ignore this email.",
  },
];

for (const t of templates) {
  writeFileSync(join(DIR, t.file), base(t), "utf8");
}

// Sample-filled copy of the reset template, for visual preview only (not for Supabase).
const sample = base(templates.find((t) => t.file === "reset-password.html"))
  .replaceAll("{{ .ConfirmationURL }}", "https://tekmadev.com/auth/confirm?token=SAMPLE")
  .replaceAll("{{ .Token }}", "482913")
  .replaceAll("{{ .Email }}", "you@example.com")
  .replaceAll("{{ .NewEmail }}", "new@example.com");
writeFileSync(join(DIR, "_preview-reset.html"), sample, "utf8");

const index =
  "# Tekmadev auth email templates\n\n" +
  "Generated by `build.mjs`. To use: in Supabase go to **Authentication > Emails > Templates**, open each template, set its **Subject**, and paste the file contents into the **Message body** (source/HTML).\n\n" +
  "| Supabase template | File | Subject |\n|---|---|---|\n" +
  templates.map((t) => `| ${t.supabase} | \`${t.file}\` | ${t.subject} |`).join("\n") +
  "\n\nVariables used: `{{ .ConfirmationURL }}`, `{{ .Token }}`, `{{ .Email }}`, `{{ .NewEmail }}`.\n" +
  "`_preview-reset.html` is a sample-filled preview only, do not paste it into Supabase.\n";
writeFileSync(join(DIR, "INDEX.md"), index, "utf8");

console.log(`Wrote ${templates.length} templates + preview + INDEX.md to ${DIR}`);
