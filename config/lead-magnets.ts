/**
 * Lead magnets: the free tools and downloads that trade real value for a name
 * and an email.
 *
 * This file owns the registry and the copy. The maths lives beside each magnet
 * (lib/revenue-leak.ts), the submissions live in one Supabase table
 * (lead_magnet_submissions), and the delivery is shared, so the next magnet is
 * a config entry plus a page, never a new pipeline.
 *
 * `published: false` keeps a magnet out of the hub, the sitemap and llms.txt
 * while its page is still being written.
 */

export type LeadMagnetKind = "calculator" | "download" | "report";

export type LeadMagnet = {
  /** URL segment under /tools and the value stored in lead_magnet_submissions.magnet. */
  slug: string;
  kind: LeadMagnetKind;
  /** Short name, used in lists, email subjects and GHL tags. */
  name: string;
  /** What someone gets, in one line, on the hub card. */
  cardBlurb: string;
  /** Time-to-value promise on the card. */
  cardMeta: string;
  metaTitle: string;
  metaDescription: string;
  published: boolean;
};

export const TOOLS_PATH = "/tools";

export const REVENUE_LEAK_SLUG = "revenue-leak-calculator";

export const leadMagnets: LeadMagnet[] = [
  {
    slug: REVENUE_LEAK_SLUG,
    kind: "calculator",
    name: "Revenue Leak Calculator",
    cardBlurb:
      "Six questions. See what slow replies, unanswered calls and follow-up that stops early cost you every month, in dollars.",
    cardMeta: "60 seconds",
    metaTitle: "Revenue Leak Calculator: what slow follow-up costs you",
    metaDescription:
      "Free calculator for service businesses. Enter your leads, average job value and response time to see the revenue you lose each month to slow replies, missed calls and follow-up that stops too early.",
    published: true,
  },
];

export function getLeadMagnet(slug: string): LeadMagnet | undefined {
  return leadMagnets.find((m) => m.slug === slug);
}

export function publishedLeadMagnets(): LeadMagnet[] {
  return leadMagnets.filter((m) => m.published);
}

/** The hub at /tools. */
export const toolsHub = {
  eyebrow: "Free tools",
  title: "Free tools that give you the number first.",
  sub: "No demo, no discovery call, no email wall in front of the answer. Use the tool, see what it says, and decide for yourself whether it is worth a conversation.",
  metaTitle: "Free growth tools for service businesses",
  metaDescription:
    "Free calculators and tools from Tekmadev for service businesses: work out what slow lead response, missed calls and thin follow-up are costing you, in dollars.",
};

/** Everything the Revenue Leak Calculator page says. */
export const revenueLeakCopy = {
  eyebrow: "Free tool · 60 seconds · No card",
  headline: "Find the money already sitting in",
  headlineAccent: "your pipeline.",
  sub: "Most service businesses do not have a lead problem. They have a response problem. Answer six questions and see, in dollars, what slow replies, unanswered calls and follow-up that stops early are costing you every month.",

  fields: {
    leadsPerMonth: {
      label: "New leads a month",
      help: "Calls, forms, DMs, referrals. Every inquiry, from every source.",
      suffix: "leads",
    },
    dealValue: {
      label: "Average value of one closed job",
      help: "What one customer is worth to you the first time they buy.",
      prefix: "$",
    },
    closeRate: {
      label: "Leads you close today",
      help: "Out of 100 inquiries, how many end up paying you?",
      suffix: "%",
    },
    missedCallsPerWeek: {
      label: "Calls a week nobody answers",
      help: "Rings out, voicemail, after hours, or while you are on a job. Do not count these in the leads above.",
      suffix: "calls",
    },
    replyBand: {
      label: "How fast a new lead hears back from a human",
      help: "Be honest. An automated thank-you page does not count.",
      options: [
        { value: "under_5m", label: "Under 5 minutes" },
        { value: "under_30m", label: "5 to 30 minutes" },
        { value: "under_2h", label: "30 minutes to 2 hours" },
        { value: "under_24h", label: "2 to 24 hours" },
        { value: "over_24h", label: "Next day or later" },
      ],
    },
    followUpBand: {
      label: "Times you chase a lead that goes quiet",
      help: "Most deals that need chasing close after the fifth attempt.",
      options: [
        { value: "six_plus", label: "Six or more" },
        { value: "three_five", label: "Three to five" },
        { value: "one_two", label: "One or two" },
        { value: "none", label: "We do not chase" },
      ],
    },
  },

  result: {
    eyebrow: "Your leak",
    heading: "You are leaking about",
    perMonth: "a month",
    annualPrefix: "That is",
    annualSuffix: "a year, out of leads you have already paid for.",
    tightHeading: "Your response game is already tight.",
    tightBody:
      "At your speed and follow-up depth there is very little left on the table in the pipeline you have. The money is in getting more of the right leads into it. That is a different conversation, and we are happy to have it.",
  },

  gate: {
    eyebrow: "The breakdown",
    heading: "See exactly where it is going.",
    body: "Three line items, your recovered close rate, and the 60-day plan to get it back. Straight to your inbox, and on this page the second you submit.",
    emailLabel: "Work email",
    nameLabel: "First name",
    companyLabel: "Business name",
    submit: "Show me the breakdown",
    submitting: "Working it out...",
    consentLabel:
      "Send me the Growth Memo as well: one or two emails a month on the plays that fill calendars. Unsubscribe in one click.",
    fine: "We email you the report and nothing else unless you tick the box. We never sell or share your details.",
  },

  breakdown: {
    heading: "Where the money goes",
    slowReply: {
      label: "Slow replies",
      body: "Leads that were real when they arrived and cold by the time you answered.",
    },
    missedCalls: {
      label: "Calls nobody answers",
      body: "They ring, nobody picks up, and most of them never ring back. They call the next name on the list.",
    },
    followUp: {
      label: "Follow-up that stops early",
      body: "Leads that went quiet once and were never chased again.",
    },
    rateNow: "Your close rate today",
    rateFixed: "With speed and follow-up fixed",
    extra: "more jobs a month, from leads you already have",
    appointments: "more appointments a month to close them",
  },

  plan: {
    eyebrow: "What we would do about it",
    heading: "This is exactly the leak we install against.",
    steps: [
      {
        title: "Every lead answered in seconds",
        body: "AI voice and text pick up the moment an inquiry lands, day or night, and qualify it before it goes cold.",
      },
      {
        title: "Nothing rings out",
        body: "Missed calls get an instant text back, so the caller is in a conversation with you instead of dialling your competitor.",
      },
      {
        title: "Twelve touches, automatically",
        body: "Every lead that goes quiet is chased on a schedule written for your industry until they book or tell you to stop.",
      },
      {
        title: "Booked, not just replied to",
        body: "The system puts real appointments on your calendar and shows you where each one came from.",
      },
    ],
    cta: "Book the 45-minute audit",
    ctaHref: "/#book",
    ctaNote: "We map your pipeline live and show you the leak in your own numbers. If it is not a fit, we say so.",
  },

  assumptions: {
    heading: "How this is calculated",
    body: "This is an estimate built from your answers and four stated assumptions. Nothing here is a projection of what Tekmadev will deliver for you, and your real numbers will differ.",
    items: [
      "Replying faster lifts your close rate by a multiplier tied to your current response band. We use a conservative fraction of what the published lead response research reports, because that research measures the odds of qualifying a lead, not of closing one.",
      "Chasing a quiet lead more than five times lifts your close rate again. A business already doing six or more touches gets no credit here.",
      "Four in ten unanswered calls are a new prospect rather than a supplier, a wrong number, a robocall or an existing customer, and six in ten of those prospects never call back. The figure usually quoted for callers who never ring back is closer to eight and a half in ten.",
      "The recovered close rate is capped at 60%, and can never fall below what you already do.",
    ],
  },

  faqs: [
    {
      q: "Is this just a lead magnet?",
      a: "Yes, and it is also the real model we use. The assumptions are listed on the page, the maths is the same maths we walk through on an audit call, and the headline number is free whether or not you give us an email.",
    },
    {
      q: "Why do you need my email to see the breakdown?",
      a: "Because the breakdown is worth something, and because we would like the chance to earn a conversation. You get the report by email so it is yours to keep and forward to a partner. Ticking the newsletter box is optional and separate.",
    },
    {
      q: "What if my numbers say I have almost no leak?",
      a: "Then we will tell you that, which is the point of showing the headline number for free. A tight response process means your money is in lead volume, not lead handling, and we will say so rather than sell you a system you do not need.",
    },
  ],
};
