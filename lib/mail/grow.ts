import { business } from "@/config/site";
import { CALL_MINUTES, GROW_WELCOME_PATH, type GrowPath } from "@/config/grow";
import { WEBLINE_LIVE_DAYS } from "@/config/webline-delivery";
import { renderMail } from "@/lib/mail/layout";

/**
 * The reply a /grow lead gets straight away. Its one job is the same as the
 * welcome page's: get the call booked while they are still warm. It is an
 * answer to their inquiry, so it carries no unsubscribe link and joins them to
 * no list; the newsletter is a separate, ticked opt-in.
 */

export type GrowEmail = {
  subject: string;
  html: string;
  tags: { name: string; value: string }[];
};

const OPENERS: Record<GrowPath, string> = {
  growth:
    "You told us you want more customers. That is exactly what we build: a system that answers every call, follows up on every lead and fills your calendar, and we run it for you.",
  webline: `You want a website that brings in customers, whether you are just starting out or your current one is not pulling its weight. Webline gets you a professional website built to be found on Google and ChatGPT, live within ${WEBLINE_LIVE_DAYS} days.`,
  custom:
    "You have something specific in mind. AI tools and automations, apps and software, content and motion graphics: we build all of it, and the call is where we scope yours.",
};

export function growWelcomeEmail(opts: { firstName: string | null; path: GrowPath }): GrowEmail {
  const hello = opts.firstName ? `Thanks, ${opts.firstName}.` : "Thanks.";
  const bookUrl = `${business.url}${GROW_WELCOME_PATH}?for=${opts.path}#book`;

  const html = renderMail({
    preheader: "Pick a time for your strategy call. You leave with a plan either way.",
    heading: `${hello} Here is what happens next.`,
    paragraphs: [
      OPENERS[opts.path],
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
    ],
  };
}
