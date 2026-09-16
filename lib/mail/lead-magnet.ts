import { business } from "@/config/site";
import { renderMail } from "@/lib/mail/layout";
import { formatDollars, type LeakAnswers, type LeakResult } from "@/lib/revenue-leak";
import { revenueLeakCopy } from "@/config/lead-magnets";

/**
 * The Revenue Leak Calculator report, sent the moment someone submits.
 *
 * Rebuilt from the stored answers and result, never from a cached HTML blob,
 * so a resend years later renders exactly the numbers that were shown on the
 * page. The maths is pure (lib/revenue-leak.ts), which is what makes that safe.
 */

export type LeadMagnetEmail = {
  subject: string;
  html: string;
  tags: { name: string; value: string }[];
};

const c = revenueLeakCopy;

function replyLabel(band: LeakAnswers["replyBand"]): string {
  return c.fields.replyBand.options.find((o) => o.value === band)?.label ?? String(band);
}

function followUpLabel(band: LeakAnswers["followUpBand"]): string {
  return c.fields.followUpBand.options.find((o) => o.value === band)?.label ?? String(band);
}

export function revenueLeakReportEmail(opts: {
  firstName?: string | null;
  company?: string | null;
  answers: LeakAnswers;
  result: LeakResult;
}): LeadMagnetEmail {
  const { answers, result } = opts;
  const monthly = formatDollars(result.monthlyLeak);
  const annual = formatDollars(result.annualLeak);
  const who = opts.firstName ? `${opts.firstName}, here` : "Here";

  // A business already replying fast with deep follow-up gets an honest email
  // saying so, not a manufactured emergency.
  const tight = result.monthlyLeak < Math.max(500, result.currentRevenue * 0.02);

  const steps = tight
    ? [
        {
          title: `You reply ${replyLabel(answers.replyBand).toLowerCase()} and chase ${followUpLabel(answers.followUpBand).toLowerCase()} times`,
          body: "That is better than almost every service business we audit. There is very little left to recover in the pipeline you already have.",
        },
        {
          title: "Your money is in lead volume, not lead handling",
          body: "More of the right inquiries into a process that already converts them. That is a different problem, and a cheaper one to fix than most people expect.",
        },
      ]
    : [
        {
          title: `Slow replies: ${formatDollars(result.slowReplyLoss)} a month`,
          body: `You reply ${replyLabel(answers.replyBand).toLowerCase()}. Leads that were real when they arrived are cold by the time they hear a human voice.`,
        },
        {
          title: `Calls nobody answers: ${formatDollars(result.missedCallLoss)} a month`,
          body: `${answers.missedCallsPerWeek} calls a week ring out. We count four in ten of those as a real prospect, and six in ten of those never ring back: they call the next name on the list.`,
        },
        {
          title: `Follow-up that stops early: ${formatDollars(result.followUpLoss)} a month`,
          body: `You chase a quiet lead ${followUpLabel(answers.followUpBand).toLowerCase()} times. Most deals that need chasing close after the fifth attempt.`,
        },
        {
          title: `Fix all three: ${result.recoveredCloseRate}% close rate`,
          body: `Up from ${answers.closeRate}% today. That is ${result.extraDealsPerMonth} more jobs a month and about ${result.extraAppointmentsPerMonth} more appointments to close them, from leads you have already paid for.`,
        },
      ];

  return {
    subject: tight
      ? `${opts.company || "Your"} numbers: almost nothing leaking`
      : `${monthly} a month is leaking out of your pipeline`,
    tags: [
      { name: "template", value: "lead-magnet-report" },
      { name: "magnet", value: "revenue-leak-calculator" },
    ],
    html: renderMail({
      preheader: tight
        ? "Your response process is tight. Here is what that means and where the money actually is."
        : `${monthly} a month, ${annual} a year. Here is the breakdown, line by line.`,
      heading: tight ? "Almost nothing is leaking" : `${monthly} a month`,
      paragraphs: tight
        ? [
            `${who} is your Revenue Leak breakdown${opts.company ? ` for ${opts.company}` : ""}. The short version: your response process is already tight, and we are not going to invent a problem to sell you something.`,
            "Here is what your answers actually say.",
          ]
        : [
            `${who} is your Revenue Leak breakdown${opts.company ? ` for ${opts.company}` : ""}. Based on what you entered, about ${monthly} a month, or ${annual} a year, never becomes revenue.`,
            "None of it is a lead problem. Every dollar below comes from leads that already found you.",
          ],
      steps,
      cta: { label: "Book the 45-minute audit", url: `${business.url}/#book` },
      note: `We map your pipeline live and show you the leak in your own numbers. No deck, no pressure, and if it is not a fit we say so. The figures above are estimates built from your answers and the assumptions listed on ${business.domain}/tools/revenue-leak-calculator, not a projection of results.`,
      footerNote: "You are receiving this because you asked for your Revenue Leak breakdown.",
    }),
  };
}
