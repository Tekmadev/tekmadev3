import { business } from "@/config/site";
import { renderMail } from "@/lib/mail/layout";

/**
 * The client portal "set your password" email, sent by sendPortalInvite
 * (lib/client-provisioning.ts) through our own mailer, never Supabase's.
 * `invite` is for someone added to a client account (new or resent, whether
 * or not they already have a login); `reset` is the password link an admin
 * sends someone who already joined. The invite copy matches
 * docs/email-templates/auth/invite.html.
 */

export type PortalInvitePurpose = "invite" | "reset";

export type PortalInviteEmail = { subject: string; html: string; tags: { name: string; value: string }[] };

const EXPIRES = "This link works once and expires after a short time.";

export function portalInviteEmail(opts: { link: string; firstName?: string | null; purpose?: PortalInvitePurpose }): PortalInviteEmail {
  if (opts.purpose === "reset") {
    return {
      subject: `Set a new password for your ${business.name} portal`,
      tags: [{ name: "template", value: "portal-reset" }],
      html: renderMail({
        preheader: "Choose a new password for your client portal.",
        heading: "Set a new password",
        paragraphs: [`Use the button below to choose a new password for your ${business.name} client portal.`],
        cta: { label: "Set a new password", url: opts.link },
        note: `${EXPIRES} If you didn't ask for this, you can ignore this email and your password stays the same.`,
        footerNote: `You are receiving this because the ${business.name} team sent you a password link for your client portal.`,
      }),
    };
  }

  return {
    subject: `Your ${business.name} client portal is ready`,
    tags: [{ name: "template", value: "portal-invite" }],
    html: renderMail({
      preheader: "Set your password and start your onboarding.",
      heading: opts.firstName ? `${opts.firstName}, your client portal is ready` : "Your client portal is ready",
      paragraphs: [
        `Welcome to ${business.name}. Set your password to open your portal, where you'll see your onboarding checklist, approve what we build, and watch your booked calls come in.`,
      ],
      cta: { label: "Set your password", url: opts.link },
      note: `${EXPIRES} If it has expired, use "Forgot password" on the portal sign-in page to get a new one. If you weren't expecting this invitation, you can safely ignore this email.`,
      footerNote: `You are receiving this because you were added to a ${business.name} client account.`,
    }),
  };
}
