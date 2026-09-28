import { NextResponse, after, type NextRequest } from "next/server";
import { business } from "@/config/site";
import {
  GROW_PATH,
  isGrowNeed,
  isRevenueBand,
  needLabel,
  pathFor,
  revenueBandLabel,
} from "@/config/grow";
import { CLICK_ID_KEYS, UTM_KEYS } from "@/lib/attribution";
import { recordGrowLead } from "@/lib/grow-data";
import { growWelcomeEmail } from "@/lib/mail/grow";
import { sendMail } from "@/lib/mail/send";
import { addSubscriber, normalizeEmail } from "@/lib/subscribers-data";
import { runCrmOutbox } from "@/lib/crm/outbox";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { reportFormLead } from "@/lib/meta-conversions";
import { dayKey, hourKey, notifyAdmins } from "@/lib/admin-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The CRM pass in after() can make a few API calls of up to 10s each.
export const maxDuration = 30;

const str = (v: unknown, max: number) =>
  typeof v === "string" && v.trim().length > 0 ? v.trim().slice(0, max) : null;

/** 10 to 15 digits, the range a real phone number falls in with or without a country code. */
function validPhone(v: string | null): boolean {
  if (!v) return false;
  const digits = v.replace(/\D/g, "").length;
  return digits >= 10 && digits <= 15;
}

/** "fbclid:VALUE" (lib/attribution.ts clickId) into {"fbclid":"VALUE"}, the shape leads.click_ids uses. */
function parseClickId(v: unknown): Record<string, string> | null {
  const raw = str(v, 600);
  if (!raw) return null;
  const at = raw.indexOf(":");
  if (at < 1) return null;
  const key = raw.slice(0, at);
  const value = raw.slice(at + 1).slice(0, 480);
  if (!value || !(CLICK_ID_KEYS as readonly string[]).includes(key)) return null;
  return { [key]: value };
}

/** A first-touch snapshot from the browser, reduced to known keys and capped lengths. */
function cleanTouch(v: unknown): Record<string, string> | null {
  if (!v || typeof v !== "object") return null;
  const src = v as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const k of UTM_KEYS) {
    const val = str(src[k], 128);
    if (val) out[k] = val;
  }
  const clickId = str(src.clickId, 600);
  if (clickId) out.clickId = clickId;
  const referrer = str(src.referrer, 1024);
  if (referrer) out.referrer = referrer;
  const landingPath = str(src.landingPath, 512);
  if (landingPath) out.landingPath = landingPath;
  const capturedAt = str(src.capturedAt, 40);
  if (capturedAt) out.capturedAt = capturedAt;
  return Object.keys(out).length ? out : null;
}

/**
 * The /grow lead form.
 *
 * Validate, store the lead, answer. Everything that reacts to the lead (the
 * reply email, the newsletter opt-in, Meta, the admin inbox, the CRM) runs in
 * after(), so the visitor lands on their welcome page in the time one insert
 * takes. None of those calls throws, and the stored row is the record either
 * way. A double submit inside two minutes returns the first lead and triggers
 * nothing a second time.
 */
export async function POST(req: NextRequest) {
  const limit = rateLimit(`grow:${clientIp(req.headers)}`, 6, 10 * 60 * 1000);
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

  // Honeypot, the same field names every public form uses. Real people never
  // see these; bots fill everything. Their real website field is `site_url`.
  if (str(body.website, 200) || str(body.company_url, 200)) {
    return NextResponse.json({ ok: true, path: "growth", duplicate: false });
  }

  const need = body.need;
  const band = body.revenue_band;
  if (!isGrowNeed(need)) return NextResponse.json({ ok: false, error: "invalid_need" }, { status: 422 });
  if (!isRevenueBand(band)) return NextResponse.json({ ok: false, error: "invalid_band" }, { status: 422 });

  const name = str(body.name, 120);
  if (!name) return NextResponse.json({ ok: false, error: "missing_name" }, { status: 422 });

  const email = normalizeEmail(body.email);
  if (!email) return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 422 });

  const phone = str(body.phone, 40);
  if (!validPhone(phone)) return NextResponse.json({ ok: false, error: "invalid_phone" }, { status: 422 });

  const businessName = str(body.business_name, 200);
  const website = str(body.site_url, 300);
  const message = str(body.message, 2000);
  const consentMarketing = body.consent_marketing === true;
  const path = pathFor(need, band);

  const ua = req.headers.get("user-agent") || "";
  const device = /mobile/i.test(ua) ? "mobile" : /tablet|ipad/i.test(ua) ? "tablet" : "desktop";
  const countryHeader = req.headers.get("x-vercel-ip-country");
  const country = countryHeader ? countryHeader.slice(0, 8) : null;

  const utm = {
    utm_source: str(body.utm_source, 128),
    utm_medium: str(body.utm_medium, 128),
    utm_campaign: str(body.utm_campaign, 128),
    utm_term: str(body.utm_term, 128),
    utm_content: str(body.utm_content, 128),
  };
  const referrer = str(body.referrer, 1024);
  const landingPage = str(body.path, 512) ?? GROW_PATH;

  const stored = await recordGrowLead({
    email,
    name,
    phone: phone as string,
    businessName,
    website,
    need,
    revenueBand: band,
    message,
    utm,
    clickIds: parseClickId(body.click_id),
    referrer,
    landingPage,
    form: {
      path,
      first_touch: cleanTouch(body.first_touch),
      device,
      country,
      consent_marketing: consentMarketing,
      consent_policy_version: business.legalDates.lastUpdated,
    },
  });

  if (!stored.ok) {
    console.error("[grow] lead not stored", stored.reason);
    // Someone asked us to call them and we lost it. Say so, with enough to call them anyway.
    await notifyAdmins({
      event: "lead.form_store_failed",
      title: `A lead form from ${name} (${email}) could not be saved`,
      body: [businessName, phone, needLabel(need), revenueBandLabel(band)].filter(Boolean).join(" · ") || null,
      url: "/admin/leads",
      actor: { type: "visitor", label: email },
      dedupeKey: hourKey(`grow_store_failed:${email}`),
      collapse: true,
      data: { email, name, phone, business_name: businessName, need, revenue_band: band, reason: stored.reason },
    });
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }

  if (!stored.duplicate) {
    const leadId = stored.id;
    const firstName = name.split(/\s+/)[0] || null;
    const afterLead = async () => {
      // The newsletter is its own ticked opt-in. Asking us to call is an inquiry
      // and never puts anyone on the list by itself.
      if (consentMarketing) {
        await addSubscriber({
          email,
          name,
          source: "form:grow",
          consentPolicyVersion: business.legalDates.lastUpdated,
          country,
          device,
          path: landingPage,
          referrer,
          ...utm,
        });
      }

      const mail = growWelcomeEmail({ firstName, path });
      const [mailResult] = await Promise.all([
        sendMail({ to: email, subject: mail.subject, html: mail.html, tags: mail.tags }),
        // Skipped unless the visitor accepted advertising cookies (no `mctx` without consent).
        reportFormLead({
          contextId: body.mctx,
          eventId: str(body.meta_event_id, 80),
          email,
          name,
          phone,
          sourceUrl: `${business.url}${GROW_PATH}`,
          form: "grow",
        }),
      ]);

      await notifyAdmins({
        event: "lead.form_submitted",
        title: `${name}${businessName ? ` (${businessName})` : ""} wants ${(needLabel(need) ?? need).toLowerCase()}`,
        body:
          [
            revenueBandLabel(band),
            email,
            phone,
            website,
            utm.utm_source ? `via ${utm.utm_source}${utm.utm_campaign ? ` / ${utm.utm_campaign}` : ""}` : null,
            consentMarketing ? "joined the newsletter" : null,
          ]
            .filter(Boolean)
            .join(" · ") || null,
        url: "/admin/leads",
        entity: { type: "lead", id: leadId },
        actor: { type: "visitor", label: email },
        // One row per submission: a second form from the same person with
        // different answers is news, and a collapsed row would keep the first answers.
        dedupeKey: `grow:${leadId}`,
        data: {
          lead_id: leadId,
          email,
          phone,
          business_name: businessName,
          website,
          need,
          revenue_band: band,
          path,
          message,
          consent_marketing: consentMarketing,
          ...utm,
        },
      });

      // They were promised an email with their next step. If it did not go out, someone should follow up by hand.
      if (!mailResult.ok) {
        const missingKey = "skipped" in mailResult && mailResult.skipped;
        await notifyAdmins({
          event: missingKey ? "email.not_configured" : "email.failed",
          title: missingKey
            ? "Email is not configured: a lead form reply was not sent"
            : `The reply to ${email}'s lead form failed to send`,
          body: missingKey ? "RESEND_API_KEY is missing, so no transactional email is going out." : "error" in mailResult ? mailResult.error : null,
          url: "/admin/leads",
          dedupeKey: missingKey ? dayKey("mail_not_configured") : dayKey(`mail:grow:${email}`),
          collapse: true,
          data: { to: email, template: "grow_welcome" },
        });
      }

      // The lead insert (and the opt-in, when ticked) queued CRM jobs inside
      // their own writes. With an opt-in that is up to four jobs for one person.
      await runCrmOutbox({ trigger: "inline", maxJobs: 6, budgetMs: 6000 });
    };

    after(async () => {
      try {
        await afterLead();
      } catch (err) {
        // Every call in afterLead is meant not to throw; this is the net if one does.
        console.error("[grow] follow-up after the lead failed", err instanceof Error ? err.message : String(err));
      }
    });
  }

  return NextResponse.json({ ok: true, path, lead: stored.id, duplicate: stored.duplicate });
}
