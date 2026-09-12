import Link from "next/link";
import { CalendarCheck, Check, ClipboardList, Mail, Phone, Sparkles } from "lucide-react";
import { business, portal } from "@/config/site";
import type { Client, ClientMember } from "@/lib/clients-data";
import type { ClientIntake } from "@/lib/onboarding-data";
import { intakeCompletion, type IntakeAnswers } from "@/lib/intake-schema";
import { Badge, Notice, PageHeader, Panel, ProgressBar, btnPrimary, btnSecondary } from "@/components/portal/ui";
import { LinkPending } from "@/components/portal/LinkPending";
import { AwaitOnboarding } from "@/components/portal/AwaitOnboarding";

/**
 * Dashboard for a free account (signed up, not paid). Three things to do,
 * in the order that helps a sale most: tell us about the business, book the
 * audit, pick a plan. Paying flips this into the onboarding dashboard.
 */
export function LeadHome({
  client,
  member,
  intake,
  welcome,
  checkout,
}: {
  client: Client;
  member: ClientMember;
  intake: ClientIntake | null;
  welcome: boolean;
  checkout?: string;
}) {
  const answers = (intake?.answers ?? {}) as IntakeAnswers;
  const completion = intakeCompletion(answers);
  const percent = Math.round((completion.answered / Math.max(1, completion.total)) * 100);
  const submitted = intake?.status === "submitted" || intake?.status === "reviewed";
  const firstName = (member.name || "").split(" ")[0];
  const canBuy = member.role === "owner" || member.role === "admin";

  const steps = [
    {
      n: 1,
      icon: ClipboardList,
      title: "Tell us about your business",
      body: submitted
        ? "Submitted. When you pick a plan, this step is already done and your build starts faster."
        : "Fifteen minutes. Your services, your ideal customer, how leads reach you today. We use it to show you exactly what your system would look like.",
      cta: submitted ? "Review your answers" : completion.answered > 0 ? "Continue the form" : "Start the form",
      href: "/intake",
      done: submitted,
      progress: submitted ? null : percent,
    },
    {
      n: 2,
      icon: CalendarCheck,
      title: "Book a free 45-minute audit",
      body: "We map your pipeline live and tell you where the leaks are. No pitch deck. If the system does not fit, we say so.",
      cta: "Pick a time",
      href: portal.kickoffCalUrl,
      external: true,
      done: false,
      progress: null,
    },
    {
      n: 3,
      icon: Sparkles,
      title: "Pick your plan",
      body: "Convert, Grow, or a Webline website. Pay and your onboarding starts the same minute: agreement, kickoff, build, live in 14 days.",
      cta: "See plans",
      href: "/plans",
      done: false,
      progress: null,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={firstName ? `Welcome, ${firstName}` : `Welcome, ${client.business_name}`}
        subtitle={`${client.business_name} · free account`}
      />

      {checkout === "success" && <AwaitOnboarding />}
      {checkout === "cancelled" && <Notice kind="info">Checkout cancelled. No charge was made. Your plans are here whenever you are ready.</Notice>}
      {welcome && checkout !== "success" && (
        <Notice kind="ok">
          Your account is ready. No card, no commitment. Tell us about your business and we will show you what a booked-call system looks like for you.
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {steps.map((st) => {
          const Icon = st.icon;
          const cls = st.n === 1 && !submitted ? btnPrimary : btnSecondary;
          return (
            <Panel key={st.n}>
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/15">
                  <Icon className="h-5 w-5 text-gold-deep" />
                </span>
                {st.done ? (
                  <Badge tone="ok">
                    <Check className="mr-1 inline h-3 w-3" />
                    Done
                  </Badge>
                ) : (
                  <span className="text-xs uppercase tracking-wide text-ink-4">Step {st.n}</span>
                )}
              </div>
              <h2 className="mt-4 font-display text-lg font-bold text-ink">{st.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-3">{st.body}</p>
              {st.progress != null && st.progress > 0 && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-ink-4">
                    <span>
                      {completion.answered} of {completion.total} answered
                    </span>
                    <span>{st.progress}%</span>
                  </div>
                  <div className="mt-1.5">
                    <ProgressBar percent={st.progress} />
                  </div>
                </div>
              )}
              <div className="mt-5">
                {st.external ? (
                  <a href={st.href} target="_blank" rel="noopener" className={cls}>
                    {st.cta}
                  </a>
                ) : st.n === 3 && !canBuy ? (
                  <p className="text-xs text-ink-4">Only account owners and admins can choose a plan.</p>
                ) : (
                  <Link href={st.href} className={cls}>
                    {st.cta}
                    <LinkPending />
                  </Link>
                )}
              </div>
            </Panel>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Panel title="What happens when you pay" className="lg:col-span-3">
          <ul className="flex flex-col gap-3 text-sm text-ink-2">
            {[
              "Your onboarding checklist appears here the same minute, with dates.",
              "You accept the agreement and book the kickoff (growth plans) or approve your design concept (Webline).",
              "We build. You approve. We go live within 14 days of having what we need.",
              "On Grow, the 30-booked-calls-in-60-days guarantee clock starts the day you go live.",
            ].map((line) => (
              <li key={line} className="flex items-start gap-3">
                <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold/15">
                  <Check className="h-3 w-3 text-gold-deep" />
                </span>
                {line}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Talk to a human" className="lg:col-span-2">
          <p className="text-sm text-ink-3">Questions before you commit? Reach us directly.</p>
          <div className="mt-4 flex flex-col gap-2">
            <a href={`mailto:${business.email}`} className="flex min-h-11 items-center gap-2.5 text-sm text-ink-2 hover:text-gold">
              <Mail className="h-4 w-4 text-gold" />
              {business.email}
            </a>
            <a href={`tel:${business.phone.tel}`} className="flex min-h-11 items-center gap-2.5 text-sm text-ink-2 hover:text-gold">
              <Phone className="h-4 w-4 text-gold" />
              {business.phone.display}
            </a>
          </div>
        </Panel>
      </div>
    </div>
  );
}
