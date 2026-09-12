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
