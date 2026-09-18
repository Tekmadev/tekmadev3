import { business, portal } from "@/config/site";
import { portalUrl } from "@/lib/portal-host";
import { renderMail } from "@/lib/mail/layout";

/**
 * The welcome email, in two flavours. Both are sent at the moment the person
 * can actually use the portal, never before: a free account the moment their
 * email is verified, and a client account the moment their membership goes
 * active (they set a password, or signed in with Google). That way the link
 * in the email always works.
 */

export type WelcomeEmail = { subject: string; html: string; tags: { name: string; value: string }[] };

/** Someone who signed up on their own. No plan, no payment, no checklist yet. */
export function leadWelcomeEmail(opts: { businessName: string; firstName?: string | null }): WelcomeEmail {
  const hello = opts.firstName ? `${opts.firstName}, your` : "Your";

  return {
    subject: `Welcome to ${business.name}, ${opts.businessName}`,
    tags: [{ name: "template", value: "welcome-lead" }],
    html: renderMail({
      preheader: "Your free account is ready. Three things to do first, no card needed.",
      heading: `${hello} account is ready`,
      paragraphs: [
        `Welcome to ${business.name}. Your free account for ${opts.businessName} is open: no card, no commitment, nothing to cancel.`,
        "Here is how to get something useful out of it this week.",
      ],
      steps: [
        {
          title: "Tell us about your business",
          body: "Fifteen minutes in the portal. Your services, your ideal customer, and how leads reach you today. We use it to show you exactly what a booked-call system would look like for you.",
        },
        {
          title: "Book a free 45-minute audit",
          body: "We map your pipeline live and show you where leads are leaking. No slide deck. If the system is not a fit for you, we will say so.",
        },
        {
          title: "Pick a plan when you are ready",
          body: "The moment you do, your onboarding starts: agreement, kickoff, build, live in 14 days. Everything you already filled in carries over.",
        },
      ],
      cta: { label: "Open your portal", url: portalUrl("/") },
      note: "Questions before you commit to anything? Reply to this email or call us. A human answers.",
      footerNote: `You are receiving this because you created a ${business.name} account.`,
    }),
  };
}

/** Someone who joined a paying account: the buyer, or a teammate they invited. */
export function clientWelcomeEmail(opts: {
  businessName: string;
  firstName?: string | null;
  planName?: string | null;
  /** Owners and admins bought it; members were invited onto it. */
  isOwner: boolean;
}): WelcomeEmail {
  const plan = opts.planName ? `${opts.planName} ` : "";

  if (!opts.isOwner) {
    return {
      subject: `You now have access to ${opts.businessName} on ${business.name}`,
      tags: [{ name: "template", value: "welcome-teammate" }],
      html: renderMail({
        preheader: `Your ${business.name} portal access for ${opts.businessName} is live.`,
        heading: "You're in",
        paragraphs: [
          `You have been added to the ${business.name} portal for ${opts.businessName}.`,
          "The portal is where the work happens: the onboarding checklist, the things we need from you, what we build for you to approve, and your booked calls as they come in.",
        ],
        cta: { label: "Open the portal", url: portalUrl("/") },
        note: "Anything unclear, reply to this email and we will walk you through it.",
        footerNote: `You are receiving this because you were added to the ${opts.businessName} account.`,
      }),
    };
  }

  return {
    subject: `Your ${business.name} onboarding has started`,
    tags: [{ name: "template", value: "welcome-client" }],
    html: renderMail({
      preheader: "You're in. Two things to do today, and we handle the rest.",
      heading: opts.firstName ? `Welcome aboard, ${opts.firstName}` : "Welcome aboard",
      paragraphs: [
        `Your ${plan}account for ${opts.businessName} is live and your onboarding has already started. Your checklist is waiting in the portal, with every step dated.`,
        "Two of those steps are yours today. The rest is on us.",
      ],
      steps: [
        {
          title: "Accept your agreement",
          body: "What we deliver, what it covers, and when. Two minutes in the portal.",
        },
        {
          title: "Tell us about your business",
          body: "The intake form is what we build everything from: your services, your service area, and your ideal customer. The sooner it lands, the sooner we start.",
        },
        {
          title: "Then watch it get built",
          body: "Your checklist shows every step, who owns it, and when it is due. We handle everything marked Tekmadev and tell you the moment something needs you.",
        },
      ],
      cta: { label: "Open your onboarding", url: portalUrl("/onboarding") },
      note: `Need us before then? Reply to this email, call ${business.phone.display}, or book time at ${portal.kickoffCalUrl}.`,
      footerNote: `You are receiving this because you have a ${business.name} account for ${opts.businessName}.`,
    }),
  };
}

/**
 * Someone who just bought Webline. Unlike the two above, this one goes out at
 * the moment of purchase, not at first sign-in: a person who has just paid
 * should hear from us before they have done anything. That means the portal
 * link may not work for them yet, so the first step is how to get in.
 *
 * The steps mirror the Webline checklist in the portal. If that checklist
 * changes (onboarding_task_templates), change this with it. The care plan's
 * price and first-charge delay are passed in from the products table, never
 * written here, because both are editable in the admin.
 */
export function weblineWelcomeEmail(opts: {
  businessName: string;
  firstName?: string | null;
  liveInDays: number;
  /**
   * How they reach the portal: `invited` got a separate set-password email,
   * `self_serve` did not (or it failed) and uses the reset link, `signed_in`
   * bought from inside the portal and is already there.
   */
  access: "invited" | "self_serve" | "signed_in";
  care: { name: string; monthly: string; trialDays: number } | null;
}): WelcomeEmail {
  const resetRoute = 'open the portal, choose "Forgot password, or never set one?" and enter this email address';
  const getIn =
    opts.access === "signed_in"
      ? "You are already signed in, so your checklist is waiting for you now."
      : opts.access === "invited"
        ? `We just sent a separate email with a secure link to set your password. If it does not show up, ${resetRoute}.`
        : `To set your password, ${resetRoute}. You will get a secure link within a minute.`;

  const steps = [
    { title: "Get into your portal", body: getIn },
    {
      title: "This week: the four things we build from",
      body: "Accept your agreement, tell us about your business, upload your logo and photos, and give us access to your domain. Each one is a short step in the portal. We start designing the moment they land, so the sooner they arrive, the sooner you launch.",
    },
    ...(opts.care
      ? [
          {
            title: `Set up ${opts.care.name}`,
            body: `This one is required. ${opts.care.name} is the hosting and maintenance that keeps your site online, secure and backed up, at ${opts.care.monthly} a month. You add a card in the portal and nothing is charged today: the first charge is ${opts.care.trialDays} days from now, and you can cancel anytime. Your site goes live once it is set up.`,
          },
        ]
      : []),
    {
      title: "Approve the design, then the site",
      body: "We send your homepage design for approval within the first week, with one round of revisions included. Then we build the rest, and you approve the finished site before anything goes live. The copy, the SEO, GEO and AEO foundation, the launch on your domain, and submitting you to Google and Bing are all on us.",
    },
  ];

  return {
    subject: "Your Webline site is underway: what happens next",
    tags: [{ name: "template", value: "welcome-webline" }],
    html: renderMail({
      preheader: `Payment received. A few things we need from you this week, and your site is live in ${opts.liveInDays} days.`,
      heading: opts.firstName ? `${opts.firstName}, your site is underway` : "Your site is underway",
      paragraphs: [
        `Thank you for choosing Webline. Your payment is confirmed and the build for ${opts.businessName} has started. The plan from here is simple: you give us what we need this week, we design and build, and your site is live in ${opts.liveInDays} days.`,
        "Everything below lives in your client portal, with dates, so you never have to guess what is next.",
      ],
      steps,
      cta: { label: "Open your portal", url: portalUrl("/onboarding") },
      note: `Want to talk it through first? There is an optional 20-minute design brief you can book from the portal. Or reply to this email, or call ${business.phone.display}. A human answers.`,
      footerNote: `You are receiving this because you purchased Webline for ${opts.businessName}.`,
    }),
  };
}
