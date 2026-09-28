import { NextResponse, after, type NextRequest } from "next/server";
import { business } from "@/config/site";
import { getLeadMagnet, REVENUE_LEAK_SLUG } from "@/config/lead-magnets";
import { calculateLeak, normalizeAnswers } from "@/lib/revenue-leak";
import { recordLeadMagnetSubmission, markLeadMagnetDelivery } from "@/lib/lead-magnet-data";
import { revenueLeakReportEmail } from "@/lib/mail/lead-magnet";
import { sendMail } from "@/lib/mail/send";
import { addSubscriber, normalizeEmail } from "@/lib/subscribers-data";
import { runCrmOutbox } from "@/lib/crm/outbox";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { reportLead } from "@/lib/meta-conversions";
import { dayKey, hourKey, moneyLabel, notifyAdmins } from "@/lib/admin-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const str = (v: unknown, max: number) =>
  typeof v === "string" && v.trim().length > 0 ? v.trim().slice(0, max) : null;

/**
 * One endpoint for every lead magnet.
 *
 * The result is recomputed here from the submitted answers and never trusted
 * from the client, so the number we store, email and send onward is the number
 * the model produces, not one a browser made up.
 *
 * Order matters: store first-party first, then deliver. A dead Resend key loses
 * the email, never the lead, and the CRM sync is a queue row a database trigger
 * wrote inside the lead insert rather than a call made from here.
 */
export async function POST(req: NextRequest) {
  const limit = rateLimit(`lead-magnet:${clientIp(req.headers)}`, 8, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "retry-after": String(limit.retryAfter) } },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  // Honeypot: real people leave it empty, bots fill everything. Pretend success.
  if (str(body.website, 200) || str(body.company_url, 200)) {
    return NextResponse.json({ ok: true });
  }

  const magnet = getLeadMagnet(String(body.magnet || ""));
  if (!magnet || !magnet.published) {
    return NextResponse.json({ ok: false, error: "unknown_magnet" }, { status: 404 });
  }

  const email = normalizeEmail(body.email);
  if (!email) {
    return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 422 });
  }

  // Only one magnet exists so far. When the second arrives this becomes a
  // lookup on magnet.slug rather than another branch in the caller.
  if (magnet.slug !== REVENUE_LEAK_SLUG) {
    return NextResponse.json({ ok: false, error: "unknown_magnet" }, { status: 404 });
  }

  const rawAnswers = (body.answers && typeof body.answers === "object" ? body.answers : {}) as Record<
    string,
    unknown
  >;
  const answers = normalizeAnswers(rawAnswers);
  const result = calculateLeak(answers);

  const name = str(body.name, 120);
  const company = str(body.company, 200);
  const phone = str(body.phone, 40);
  const consentMarketing = body.consent_marketing === true;

  const ua = req.headers.get("user-agent") || "";
  const device = /mobile/i.test(ua) ? "mobile" : /tablet|ipad/i.test(ua) ? "tablet" : "desktop";
  const country = req.headers.get("x-vercel-ip-country");

  const attribution = {
    path: str(body.path, 512),
    referrer: str(body.referrer, 1024),
    utm_source: str(body.utm_source, 128),
    utm_medium: str(body.utm_medium, 128),
    utm_campaign: str(body.utm_campaign, 128),
    utm_term: str(body.utm_term, 128),
    utm_content: str(body.utm_content, 128),
  };

  const stored = await recordLeadMagnetSubmission({
    magnet: magnet.slug,
    email,
    name,
    company,
    phone,
    answers: answers as unknown as Record<string, unknown>,
    result: result as unknown as Record<string, unknown>,
    score: result.monthlyLeak,
    consentMarketing,
    consentPolicyVersion: business.legalDates.lastUpdated,
    country: country ? country.slice(0, 8) : null,
    device,
    ...attribution,
  });

  if (!stored.ok) {
    // A lead typed their numbers and their email and we lost it. Say so, with
    // enough to follow up by hand.
    await notifyAdmins({
      event: "lead_magnet.store_failed",
      title: `A ${magnet.name} submission from ${email} could not be saved`,
      body: [name, company, phone].filter(Boolean).join(" · ") || null,
      url: "/admin/tools",
      actor: { type: "visitor", label: email },
      dedupeKey: hourKey(`magnet_store_failed:${magnet.slug}`),
      collapse: true,
      data: { email, name, company, phone, reason: stored.reason },
    });
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }

  // The newsletter is a separate, explicit opt-in. Asking for the report is an
  // inquiry and never puts anyone on the list by itself.
  if (consentMarketing) {
    await addSubscriber({
      email,
      name,
      source: `magnet:${magnet.slug}`,
      consentPolicyVersion: business.legalDates.lastUpdated,
      country: country ? country.slice(0, 8) : null,
      device,
      ...attribution,
    });
  }

  const [mailResult] = await Promise.all([
    (async () => {
      const mail = revenueLeakReportEmail({
        firstName: name,
        company,
        answers,
        result,
      });
      return sendMail({ to: email, subject: mail.subject, html: mail.html, tags: mail.tags });
    })(),
    // Skipped unless the visitor accepted advertising cookies: `mctx` only
    // exists after consent, and reportLead sends nothing without it.
    reportLead({
      contextId: body.mctx,
      eventId: str(body.meta_event_id, 80),
      email,
      name,
      phone,
      sourceUrl: attribution.path ? `${business.url}${attribution.path}` : null,
      magnet: magnet.slug,
    }),
  ]);

  // Only the email is stamped from here now. `ghl_synced_at` used to record the
  // return value of a fire-and-forget POST made moments earlier, which is a
  // claim this request cannot make: the CRM push is a queue row that may still
  // be pending, and markLeadMagnetDelivery only ever writes a stamp for a true
  // flag, so passing `false` wrote nothing anyway. The outbox owns that column
  // now and stamps it when a contact really reaches the CRM.
  await markLeadMagnetDelivery(stored.id, { emailed: mailResult.ok });

  // Drain what the leads insert (and the newsletter opt-in, when it was ticked)
  // enqueued, after the response so the visitor gets their report without
  // waiting on the CRM.
  after(() => runCrmOutbox({ trigger: "inline", maxJobs: 3, budgetMs: 4000 }));

  // A lead with a dollar figure attached is the warmest kind. The key collapses
  // a double submit from the same person on the same day.
  await notifyAdmins({
    event: "lead.magnet_submitted",
    title: `${name || email} ran the ${magnet.name}: ${moneyLabel(Math.round(result.monthlyLeak * 100), "cad")} a month leaking`,
    body: [company, email, phone, consentMarketing ? "joined the newsletter" : null].filter(Boolean).join(" · "),
    url: "/admin/tools",
    entity: { type: "lead_magnet_submission", id: stored.id },
    actor: { type: "visitor", label: email },
    dedupeKey: dayKey(`magnet:${magnet.slug}:${email}`),
    collapse: true,
    data: {
      magnet: magnet.slug,
      email,
      company,
      phone,
      monthly_leak: result.monthlyLeak,
      annual_leak: result.annualLeak,
      consent_marketing: consentMarketing,
      utm_source: attribution.utm_source ?? null,
    },
  });
  // The visitor was promised a report. If it did not go out, someone should send it by hand.
  if (!mailResult.ok) {
    const missingKey = "skipped" in mailResult && mailResult.skipped;
    await notifyAdmins({
      event: missingKey ? "email.not_configured" : "email.failed",
      title: missingKey
        ? "Email is not configured: a free tool report was not sent"
        : `The ${magnet.name} report to ${email} failed to send`,
      body: missingKey ? "RESEND_API_KEY is missing, so no transactional email is going out." : "error" in mailResult ? mailResult.error : null,
      url: "/admin/tools",
      dedupeKey: missingKey ? dayKey("mail_not_configured") : dayKey(`mail:lead_magnet:${email}`),
      collapse: true,
      data: { to: email, template: "lead_magnet_report" },
    });
  }

  return NextResponse.json({ ok: true, result, emailed: mailResult.ok });
}
