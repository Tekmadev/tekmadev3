// Generates Tekmadev's on-brand MARKETING email templates (the ones GHL sends).
// Run:  node docs/email-templates/marketing/build-marketing.mjs
// Output: one <name>.html per template + _preview-<name>.html + INDEX.md.
//
// These are separate from the Supabase AUTH emails in ../ (build.mjs). They share
// the same brand system but are wider, editorial, and carry first-party tracking:
//   - a 1x1 open pixel  -> /api/e/o?c=<campaignKey>
//   - every CTA wrapped -> /api/e/c?c=<campaignKey>&l=<label>&u=<destination>
// Register each campaign in the admin (/admin/email) with the SAME campaignKey so
// its opens and clicks roll up there. Edit copy/blocks below and re-run to rebuild.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DIR = dirname(fileURLToPath(import.meta.url));

// Brand tokens (mirror of docs/email-templates/build.mjs + config/site.ts theme).
const C = {
  bg: "#efeae0",
  card: "#ffffff",
  ink: "#0d0c0a",
  ink2: "#2a2722",
  ink3: "#5a564d",
  ink4: "#8a857a",
  gold: "#a17a4f",
  goldDeep: "#7a5b3a",
  line: "#e7e1d5",
  soft: "#f5f2eb",
  goldTint: "#f4ebd6",
};
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace";

const BUSINESS = {
  name: "Tekmadev",
  legalName: "Tekmadev Innovation Inc.",
  // www on purpose. The bare domain answers with a redirect to www, so every
  // link and the open pixel would take an extra hop, and some mail image proxies
  // do not follow redirects at all, which undercounts opens.
  site: "https://www.tekmadev.com",
  address: "40 Courtland Ave, Hamilton, Ontario L9B 1X6, Canada",
  // User-provided transparent logo, resized by Cloudinary (email clients cannot render SVG).
  logo: "https://res.cloudinary.com/dnly2ngqc/image/upload/f_png,w_200/v1756916099/TMD2_logo_tbg_1200_bxzkc8.png",
};

const SITE = BUSINESS.site;

// --- GHL merge fields / tracking (documented in INDEX.md) -------------------
// Set a default of "there" for first_name in GHL so an empty name still reads well.
const FNAME = "{{contact.first_name}}";
// GHL inserts its own unsubscribe link on send; this placeholder marks where it goes.
const UNSUB = "{{unsubscribe_link}}";

const openPixel = (c) => `${SITE}/api/e/o?c=${c}`;
const trackClick = (c, label, dest) =>
  `${SITE}/api/e/c?c=${c}&l=${label}&u=${encodeURIComponent(dest)}`;

// Common destinations.
const DEST = {
  book: `${SITE}/#book`,
  start: `${SITE}/start`,
  system: `${SITE}/#system`,
  proof: `${SITE}/#proof`,
  pricing: `${SITE}/#pricing`,
  guides: `${SITE}/guides`,
};

// --- Content helpers (email-safe inline styles) -----------------------------
const eyebrow = (t) =>
  `<p style="margin:0 0 14px;font-family:${MONO};font-size:12px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:${C.gold};">${t}</p>`;

const p = (t) =>
  `<p style="margin:0 0 20px;font-family:${FONT};font-size:16px;line-height:1.65;color:${C.ink3};">${t}</p>`;

const lead = (t) =>
  `<p style="margin:0 0 24px;font-family:${FONT};font-size:18px;line-height:1.6;color:${C.ink2};">${t}</p>`;

const h2 = (t) =>
  `<h2 style="margin:32px 0 14px;font-family:${FONT};font-size:20px;font-weight:800;letter-spacing:-0.2px;line-height:1.3;color:${C.ink};">${t}</h2>`;

function button(label, href) {
  // Bulletproof-ish button. Outlook (Word engine) ignores padding on inline
  // anchors and border-radius, so the fill + padding live on the <td> via
  // mso-padding-alt (the anchor's own padding is zeroed for Outlook only). Other
  // clients get the rounded pill. Handles variable-length labels without VML.
  return `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 6px;">
                <tr>
                  <td align="center" bgcolor="${C.gold}" style="border-radius:999px;mso-padding-alt:15px 38px;">
                    <a href="${href}" target="_blank" style="display:inline-block;background:${C.gold};padding:15px 38px;mso-padding-alt:0;font-family:${FONT};font-size:15px;font-weight:700;line-height:1;color:#ffffff;text-decoration:none;border-radius:999px;">${label}</a>
                  </td>
                </tr>
              </table>`;
}

/** A gold-tinted callout box, good for a stat or a guarantee line. */
function callout(big, small) {
  return `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
                <tr>
                  <td style="background:${C.goldTint};border:1px solid ${C.line};border-radius:14px;padding:22px 24px;">
                    <p style="margin:0;font-family:${FONT};font-size:26px;font-weight:800;letter-spacing:-0.4px;color:${C.ink};">${big}</p>
                    <p style="margin:6px 0 0;font-family:${FONT};font-size:14px;line-height:1.5;color:${C.ink3};">${small}</p>
                  </td>
                </tr>
              </table>`;
}

/** A compact bullet list. */
function bullets(items) {
  const li = items
    .map(
      (t) =>
        `<tr><td valign="top" style="padding:0 10px 12px 0;font-family:${FONT};font-size:16px;line-height:1;color:${C.gold};">&bull;</td><td valign="top" style="padding:0 0 12px;font-family:${FONT};font-size:16px;line-height:1.55;color:${C.ink3};">${t}</td></tr>`,
    )
    .join("");
  return `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
                ${li}
              </table>`;
}

const divider = () =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid ${C.line};font-size:0;line-height:0;height:1px;">&nbsp;</td></tr></table>`;

/** Full email document. `blocks` is an array of the helper strings above. */
function base({ campaignKey, subject, preheader, eyebrowText, heading, blocks }) {
  const body = blocks.join("\n");
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
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
          <tr>
            <td align="center" style="padding:6px 0 26px;">
              <img src="${BUSINESS.logo}" width="64" height="64" alt="${BUSINESS.name}" style="display:block;border:0;outline:none;text-decoration:none;width:64px;height:64px;">
            </td>
          </tr>
          <tr>
            <td style="background:${C.card};border:1px solid ${C.line};border-radius:18px;padding:44px 44px 40px;">
              ${eyebrow(eyebrowText)}
              <h1 style="margin:0 0 20px;font-family:${FONT};font-size:28px;font-weight:800;letter-spacing:-0.5px;line-height:1.2;color:${C.ink};">${heading}</h1>
              ${body}
            </td>
          </tr>
          <tr>
            <td style="padding:26px 12px 8px;text-align:center;font-family:${FONT};font-size:12px;line-height:1.7;color:${C.ink4};">
              <strong style="color:${C.ink3};">${BUSINESS.legalName}</strong><br>
              ${BUSINESS.address}<br>
              <a href="${SITE}" target="_blank" style="color:${C.gold};text-decoration:none;">tekmadev.com</a>
              &nbsp;&bull;&nbsp;
              <a href="${UNSUB}" target="_blank" style="color:${C.ink4};text-decoration:underline;">Unsubscribe</a>
              <br><br>
              You're receiving this because you subscribed at tekmadev.com.
            </td>
          </tr>
        </table>
        <img src="${openPixel(campaignKey)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;overflow:hidden;">
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// --- Templates --------------------------------------------------------------
const templates = [
  {
    file: "welcome.html",
    key: "welcome",
    name: "Welcome email",
    subject: "Welcome to the Growth Memo",
    preheader: "The plays we use to book 30 qualified calls in 60 days, straight to your inbox.",
    eyebrowText: "The Growth Memo",
    heading: "You're in.",
    blocks: (k) => [
      lead("Thanks for subscribing. You just joined the operators we build for: B2B service businesses that would rather have a full calendar than a full to-do list."),
      p("Here is what lands in your inbox once or twice a month: the exact AI and automation plays we install to answer every lead in seconds, follow up until they book, and turn a quiet pipeline into 30 qualified calls in 60 days. No theory, no filler."),
      callout("30 booked calls in 60 days.", "That is the guarantee we build toward. If we miss it, we keep working for free until you hit it."),
      p("Want to see the system before the next memo? Take the 2 minute tour of how it works, or book a 45 minute pipeline audit and we will map exactly where your calls are leaking."),
      button("See how the system works", trackClick(k, "welcome-system", DEST.system)),
      p(`Talk soon,<br>The ${BUSINESS.name} team`),
    ],
  },
  {
    file: "newsletter.html",
    key: "newsletter",
    name: "Newsletter / broadcast",
    subject: "[Subject line goes here]",
    preheader: "[Preheader: one line that earns the open. Edit before sending.]",
    eyebrowText: "The Growth Memo",
    heading: "[Headline: the one idea of this issue]",
    blocks: (k) => [
      lead(`Hi ${FNAME}, [open with the hook. One or two sentences that make the reader feel the problem or the opportunity before you explain it.]`),
      p("[Body: deliver the single most useful idea of the issue. Keep it concrete. If you are making a claim, back it with a number or a real example.]"),
      h2("[Optional section heading]"),
      p("[More detail, a short story, or a step-by-step. This template is reusable: keep this structure, swap the copy each send.]"),
      callout("[Stat or result]", "[One line of context for the number above.]"),
      p("[Close with the single action you want them to take.]"),
      button("[Call to action]", trackClick(k, "newsletter-cta", DEST.book)),
    ],
  },
  {
    file: "nurture-1.html",
    key: "nurture-1",
    name: "Nurture 1 of 3 (the problem)",
    subject: "The most expensive number in your business",
    preheader: "It is the number of leads that reach out and never hear back in time.",
    eyebrowText: "Nurture · 1 of 3",
    heading: "Your leads are leaking. Here is where.",
    blocks: (k) => [
      lead(`Hi ${FNAME}, most service businesses do not have a lead problem. They have a follow-up problem.`),
      p("A prospect fills out your form or calls after hours. Five minutes pass, then an hour, then a day. By the time someone replies, they have already booked with whoever answered first. The lead was never bad. The response was just too slow."),
      bullets([
        "The average business takes hours to respond. The winner responds in seconds.",
        "Half of buyers pick the company that replies first, not the cheapest.",
        "Every missed call after hours is a booked job for a competitor.",
      ]),
      p("This is the leak we plug first. Not more ads, not more leads. A system that catches every inquiry the moment it lands and works it until it books."),
      p("Tomorrow, I will show you exactly how that system is built. For now, if you want to see where your own pipeline leaks, book a 45 minute audit and we will map it live."),
      button("Book my pipeline audit", trackClick(k, "nurture1-book", DEST.book)),
    ],
  },
  {
    file: "nurture-2.html",
    key: "nurture-2",
    name: "Nurture 2 of 3 (the system)",
    subject: "How the calendar fills itself",
    preheader: "The four pieces that turn a slow pipeline into 30 booked calls.",
    eyebrowText: "Nurture · 2 of 3",
    heading: "The system, in four moves.",
    blocks: (k) => [
      lead(`Hi ${FNAME}, yesterday we named the leak. Today, the fix.`),
      p("Here is the system we install, end to end. It runs whether you are on a job, asleep, or on vacation."),
      h2("1. Answer in seconds"),
      p("An AI voice and text agent picks up every call and message 24/7, trained on your offer. No lead waits."),
      h2("2. Follow up until they book"),
      p("A 12 touch follow-up sequence, written for your industry, works every lead until they schedule or say no."),
      h2("3. Book straight to your calendar"),
      p("Qualified prospects land on your calendar automatically, with the context you need to close them."),
      h2("4. Tune weekly"),
      p("We watch the dashboard daily and tighten the scripts weekly, so the number climbs instead of plateauing."),
      callout("Live in 14 days.", "That is the typical time from kickoff to a system that is booking calls."),
      button("See the full system", trackClick(k, "nurture2-system", DEST.system)),
    ],
  },
  {
    file: "nurture-3.html",
    key: "nurture-3",
    name: "Nurture 3 of 3 (the proof + offer)",
    subject: "480% more booked jobs. Same business.",
    preheader: "The proof, the guarantee, and how to start.",
    eyebrowText: "Nurture · 3 of 3",
    heading: "It works. Here is the proof.",
    blocks: (k) => [
      lead(`Hi ${FNAME}, you have seen the leak and the system. Now the receipts.`),
      p("Down2Detail, an auto detailing shop, went from 9 booked jobs a month to 52 in 42 days. Same team, same market. The only change was the system catching and working every lead."),
      bullets([
        "Carpet Masters: $8K to $31K monthly revenue in 5 months.",
        "KeyFoby: 2 to 3 calls a week to 30+, live in 12 days.",
        "94% of clients are still running the system 12 months later.",
      ]),
      callout("30 booked calls in 60 days, or we work free until you hit it.", "If the system stops booking, we stop billing. Cancel any month, no long-term contract."),
      p("If your pipeline could carry more, the next step is a 45 minute audit. We map your leaks, show you the system, and tell you straight whether it is a fit. Zero pressure."),
      button("Book my free audit", trackClick(k, "nurture3-book", DEST.book)),
    ],
  },
  {
    file: "promo.html",
    key: "promo",
    name: "Promo / limited offer",
    subject: "Your Build & Install is on us (this week)",
    preheader: "Free install plus a promo code, applied automatically. Ends Sunday.",
    eyebrowText: "Limited offer",
    heading: "Your Build & Install is on us.",
    blocks: (k) => [
      lead("This week only, we are waiving the Build & Install fee for new clients and applying a launch discount on top, automatically."),
      p("You get the full done-for-you system: the AI answering layer, the 12 touch follow-up, the CRM wiring, and weekly tuning. Same guarantee, none of the upfront build cost."),
      callout("Free Build & Install + auto-applied promo", "Applied at checkout when you start this week. No code to remember."),
      p("Spots are limited because every install is done by hand and done right. If your calendar has room to grow, claim it before Sunday."),
      button("Claim the offer", trackClick(k, "promo-start", DEST.start)),
      p("Prefer to talk it through first? Book a 45 minute audit and we will confirm the fit before you commit to anything."),
      button("Book a call instead", trackClick(k, "promo-book", DEST.book)),
    ],
  },
  {
    file: "reengage.html",
    key: "reengage",
    name: "Re-engagement / win-back",
    subject: "Still want the growth plays?",
    preheader: "A quick check-in. Stay on the list, or step off, your call.",
    eyebrowText: "Quick check-in",
    heading: "Are we still useful?",
    blocks: (k) => [
      lead(`Hi ${FNAME}, it has been a while since you opened one of these, so a fair question: is the Growth Memo still worth your inbox?`),
      p("If yes, here is what you have been missing. We now install a full AI answering and follow-up system that has taken service businesses from single-digit monthly bookings to 30+ qualified calls, with a performance guarantee behind it: we work free until you hit the target."),
      callout("One free audit could change the quarter.", "45 minutes, we map your pipeline leaks and show you the fix. No pressure."),
      button("Show me what's new", trackClick(k, "reengage-system", DEST.system)),
      p(`If it is not for you, no hard feelings. You can <a href="${UNSUB}" target="_blank" style="color:${C.gold};text-decoration:underline;">step off the list here</a> and we will stop emailing. Either way, thanks for being here.`),
    ],
  },
];

// Short "when to send this" note for the admin organizer, keyed by campaign key.
const USE_WHEN = {
  welcome: "Sent automatically when someone new subscribes from the site footer.",
  newsletter: "Reusable broadcast. Duplicate it each send and swap the copy blocks.",
  "nurture-1": "Step 1 of the 3-part lead nurture sequence (name the problem).",
  "nurture-2": "Step 2, about a day later (show the system).",
  "nurture-3": "Step 3, about two days later (proof plus the offer).",
  promo: "Time-boxed offer. Send to warm subscribers during a promotion.",
  reengage: "Win-back for subscribers who have gone quiet.",
};

// --- Emit -------------------------------------------------------------------
const generated = [];

for (const t of templates) {
  const html = base({
    campaignKey: t.key,
    subject: t.subject,
    preheader: t.preheader,
    eyebrowText: t.eyebrowText,
    heading: t.heading,
    blocks: t.blocks(t.key),
  });
  writeFileSync(join(DIR, t.file), html, "utf8");

  // Sample-filled preview: merge fields resolved so it renders like a real send.
  const preview = html
    .replaceAll(FNAME, "Sam")
    .replaceAll(UNSUB, "#unsubscribe");
  writeFileSync(join(DIR, `_preview-${t.file}`), preview, "utf8");

  generated.push({
    key: t.key,
    file: t.file,
    name: t.name,
    subject: t.subject,
    useWhen: USE_WHEN[t.key] || "",
    html, // GHL-ready: keeps {{merge fields}} and tracking URLs intact
    previewHtml: preview, // sample-filled, for the in-admin iframe preview
  });
}

// Bundled TS module so the admin can import the templates (loose docs/*.html
// files are NOT traced into the Vercel serverless function, so importing is the
// only production-safe way to read them). Regenerated on every build run.
const generatedTs =
  "// AUTO-GENERATED by docs/email-templates/marketing/build-marketing.mjs\n" +
  "// Do not edit by hand. Edit the templates in build-marketing.mjs and re-run:\n" +
  "//   node docs/email-templates/marketing/build-marketing.mjs\n\n" +
  "export type MarketingEmailTemplate = {\n" +
  "  key: string;\n" +
  "  file: string;\n" +
  "  name: string;\n" +
  "  subject: string;\n" +
  "  useWhen: string;\n" +
  "  html: string;\n" +
  "  previewHtml: string;\n" +
  "};\n\n" +
  "export const marketingEmailTemplates: MarketingEmailTemplate[] = " +
  JSON.stringify(generated, null, 2) +
  ";\n";

writeFileSync(join(DIR, "..", "..", "..", "lib", "email-templates.generated.ts"), generatedTs, "utf8");

const index =
  "# Tekmadev marketing email templates\n\n" +
  "On-brand marketing emails that **GHL sends**. Each carries first-party tracking: a 1x1 open pixel and CTA links that route through `www.tekmadev.com/api/e/*`, so opens and clicks show up in the admin at **/admin/email** (owned by you, independent of GHL's own stats).\n\n" +
  "Generated by `build-marketing.mjs`. Edit the copy/blocks there and re-run `node docs/email-templates/marketing/build-marketing.mjs` to rebuild all of them.\n\n" +
  "## Templates\n\n" +
  "| Template | Campaign key | Subject |\n|---|---|---|\n" +
  templates.map((t) => `| \`${t.file}\` | \`${t.key}\` | ${t.subject} |`).join("\n") +
  "\n\n" +
  "`_preview-<name>.html` files are sample-filled (merge fields resolved) for visual review only. Do not paste those into GHL.\n\n" +
  "## How to use each one in GHL\n\n" +
  "1. In GHL, create the email and paste the template HTML into a **Custom HTML / code** block (source view).\n" +
  "2. Set the **Subject** (see table). The first line of hidden preheader text is at the top of the `<body>`.\n" +
  "3. In the Tekmadev admin, go to **/admin/email > New campaign** and add a campaign with the **same campaign key** as the template. Opens and clicks then roll up under it.\n\n" +
  "## Personalization\n\n" +
  "Templates greet with `{{contact.first_name}}`. In GHL, set a **default/fallback value of `there`** for that field so an empty name still reads well (\"You're in, there.\").\n\n" +
  "## Unsubscribe\n\n" +
  "The footer has an unsubscribe link marked `{{unsubscribe_link}}`. GHL adds its own unsubscribe link on send. Either keep the placeholder and let GHL manage it, or select the word **Unsubscribe** in the GHL editor and insert GHL's unsubscribe link. (GHL's exact merge tag can vary by version, so confirm it in your account rather than trusting the placeholder verbatim.)\n\n" +
  "## Tracking (how it works)\n\n" +
  "- **Opens**: the pixel `" + SITE + "/api/e/o?c=<key>` logs an open when the email is viewed.\n" +
  "- **Clicks**: each CTA points to `" + SITE + "/api/e/c?c=<key>&l=<label>&u=<destination>`, which logs the click and forwards to the destination (destinations are host-allowlisted, so the link can't be abused as an open redirect).\n" +
  "- **Per-recipient (advanced, optional)**: both URLs accept an extra `&s=<id>` for per-subscriber attribution. It resolves only if `<id>` is a Tekmadev subscriber `public_id`, so it requires syncing that id into GHL as a custom field first. Without it, tracking is accurate at the campaign level.\n";

writeFileSync(join(DIR, "INDEX.md"), index, "utf8");

console.log(`Wrote ${templates.length} marketing templates + previews + INDEX.md to ${DIR}`);
