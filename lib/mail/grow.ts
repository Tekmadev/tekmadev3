import { business } from "@/config/site";
import { CALL_MINUTES, GROW_WELCOME_PATH, type GrowNeed, type GrowPath } from "@/config/grow";
import { renderMail } from "@/lib/mail/layout";

/**
 * The reply a /grow lead gets straight away. Its one job is the same as the
 * welcome page's: get the call booked while they are still warm. It is an
 * answer to their inquiry, so it carries no unsubscribe link and joins them to
 * no list; the newsletter is a separate, ticked opt-in.
 *
 * The opening line answers what they picked on /grow (each need has its own),
 * and the offer that fits (the path) only shapes it where the two differ: more
 * customers or "not sure" from a business with no revenue yet. The booking
 * link still goes to the welcome page for the path. Never say they asked for
 * something they did not pick.
 */

export type GrowEmail = {
  subject: string;
  html: string;
  tags: { name: string; value: string }[];
};

/** The first paragraph: what they picked, in their words, then how we help. */
export function growOpener(need: GrowNeed, path: GrowPath): string {
  switch (need) {
    case "customers":
      return path === "webline"
        ? "You want more customers. You are just starting out, so the first step is being easy to find: Webline gets you a professional website built to be found on Google and ChatGPT, and the call is where we plan what comes after it."
        : "You told us you want more customers. That is exactly what we build: a system that answers every call, follows up on every lead and fills your calendar, and we run it for you.";
    case "website":
      return "You want a website that brings in customers, whether you are just starting out or your current one is not pulling its weight. Webline gets you a professional website built to be found on Google and ChatGPT, ready before you are.";
    case "custom":
      return "You have something specific in mind: an AI tool, an automation, an app or software. We build all of it, and the call is where we scope yours.";
    case "content":
      return "You want content that makes people stop and watch: videos, reels and motion graphics for your brand. We make it with you, and the call is where we plan yours.";
    case "unsure":
      return path === "webline"
        ? "You are not sure yet what you need, and that is fine: that is what the call is for. You are just starting out, so we look at where you are and tell you honestly what to do first, and what can wait."
        : "You are not sure yet what you need, and that is fine: that is what the call is for. We look at your business first and tell you honestly what would bring in the most customers, whether that is a website, a growth system or something else.";
  }
}

export function growWelcomeEmail(opts: { firstName: string | null; need: GrowNeed; path: GrowPath }): GrowEmail {
  const hello = opts.firstName ? `Thanks, ${opts.firstName}.` : "Thanks.";
  const bookUrl = `${business.url}${GROW_WELCOME_PATH}?for=${opts.path}#book`;

  const html = renderMail({
    preheader: "Pick a time for your strategy call. You leave with a plan either way.",
    heading: `${hello} Here is what happens next.`,
    paragraphs: [
      growOpener(opts.need, opts.path),
      "Look, you need to make money. We know. So let us handle the marketing and the development, and you get back to running the business.",
    ],
    steps: [
      {
        title: "Book your strategy call",
        body: `${CALL_MINUTES} minutes with the people who would build it. Pick a time that suits you.`,
      },
      {
        title: "We come prepared",
        body: "We look at your business and your market before the call, so it is about you, not a pitch deck.",
      },
      {
        title: "You leave with a plan",
        body: "Whether you work with us or not, you leave knowing what to fix first and what it is worth.",
      },
    ],
    cta: { label: "Book my call", url: bookUrl },
    note: `Questions before then? Reply to this email or call ${business.phone.display}.`,
    context: `You are getting this because you asked ${business.name} about your business. It is a one-off reply, not a mailing list.`,
  });

  return {
    subject: "Your next step with Tekmadev",
    html,
    tags: [
      { name: "template", value: "grow-welcome" },
      { name: "path", value: opts.path },
      { name: "need", value: opts.need },
    ],
  };
}
