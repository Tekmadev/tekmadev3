import type { Metadata } from "next";
import { Section, Eyebrow } from "@/components/Section";
import { Clients } from "@/components/sections/Clients";
import { GrowForm } from "@/components/grow/GrowForm";
import { aggregateStats, heroStats } from "@/config/site";
import { CALL_MINUTES } from "@/config/grow";

/**
 * /grow: the link for ads, the bio and DMs. Private like /start: no index, not
 * in the sitemap, so it never competes with the homepage in search and the
 * only way in is a link we chose to share.
 */
export const metadata: Metadata = {
  title: "Let us grow it for you",
  description:
    "Tell us where your business is today. See how we would grow it, then book a call with the team that builds it and runs it for you.",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  alternates: { canonical: undefined },
};

const stat = (list: readonly { label: string; value: string }[], label: string) =>
  list.find((s) => s.label === label)?.value ?? null;

const STEPS = [
  { title: "Tell us about the business", body: "One minute. Two questions, then where to reach you." },
  {
    title: "See how we would grow it",
    body: "Your next page lays out what fits: more customers, a new website, or something custom.",
  },
  {
    title: "Book a call with the builders",
    body: `${CALL_MINUTES} minutes. We map what is holding the business back and what we would build. No pressure.`,
  },
];

export default function GrowPage() {
  const installed = stat(heroStats, "Systems installed");
  const retained = stat(aggregateStats, "Clients running 12+ months");
  const response = stat(aggregateStats, "Avg lead response time");
  const proof = [
    installed && { value: installed, label: "systems installed" },
    retained && { value: retained, label: "of clients still running after 12 months" },
    response && { value: response, label: "average reply to a new lead" },
  ].filter((p): p is { value: string; label: string } => Boolean(p));

  return (
    <>
      <Section className="pb-16 pt-6 sm:pb-24 sm:pt-10">
        <div className="grid gap-12 lg:grid-cols-[1fr_minmax(0,30rem)] lg:gap-16">
          <div className="lg:pt-6">
            <Eyebrow>Done for you, start to finish</Eyebrow>
            <h1 className="display-xl mt-6 text-balance text-[2.5rem] leading-[1] sm:text-6xl lg:text-5xl xl:text-6xl">
              <span className="block text-ink">You need to make money.</span>
              <span className="gold-gradient-text mt-2 block">Let us handle the marketing and the development.</span>
            </h1>
            <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-ink-2">
              Tell us where the business is today. In a minute you will see exactly how we would grow it, and you can book a
              call with the team that builds it and runs it for you.
            </p>

            <Steps className="mt-10 hidden max-w-xl lg:flex" />
            <ProofStats proof={proof} className="mt-10 hidden max-w-xl lg:grid" />
          </div>

          <div id="form" className="scroll-mt-6">
            <div className="rounded-3xl border border-line-strong bg-surface p-6 shadow-[0_30px_80px_-50px_rgba(13,12,10,0.35)] sm:p-8">
              <p className="eyebrow">Let us see what fits</p>
              <div className="mt-5">
                <GrowForm />
              </div>
            </div>
          </div>
        </div>

        {/* On phones the form comes first; the reassurance follows it. */}
        <div className="mt-12 lg:hidden">
          <Steps />
          <ProofStats proof={proof} className="mt-10 grid" compact />
        </div>
      </Section>

      <Clients />
    </>
  );
}

function Steps({ className = "flex" }: { className?: string }) {
  return (
    <ol className={`flex-col gap-5 ${className}`}>
      {STEPS.map((s, i) => (
        <li key={s.title} className="flex gap-4">
          <span className="number-tabular flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold/15 font-mono text-xs font-semibold text-gold-deep dark:text-gold-soft">
            {i + 1}
          </span>
          <div>
            <p className="font-medium text-ink">{s.title}</p>
            <p className="mt-0.5 text-sm leading-relaxed text-ink-3">{s.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function ProofStats({
  proof,
  className,
  compact,
}: {
  proof: { value: string; label: string }[];
  className: string;
  compact?: boolean;
}) {
  if (proof.length === 0) return null;
  return (
    <dl className={`grid-cols-3 gap-4 border-t border-line pt-6 sm:gap-6 ${className}`}>
      {proof.map((p) => (
        <div key={p.label}>
          <dd className={`display-m number-tabular text-ink ${compact ? "text-xl" : "text-2xl"}`}>{p.value}</dd>
          <dt className={`mt-1 leading-snug text-ink-3 ${compact ? "text-[11px]" : "text-xs"}`}>{p.label}</dt>
        </div>
      ))}
    </dl>
  );
}
