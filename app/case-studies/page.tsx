import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Section } from "@/components/Section";
import { JsonLd } from "@/components/JsonLd";
import { business, proofWins } from "@/config/site";
import { crumbsJsonLd } from "@/lib/seo";
import { CASE_STUDIES_PATH, caseStudiesHub, publishedCaseStudies } from "@/config/case-studies";

const URL = `${business.url}${CASE_STUDIES_PATH}`;

export const metadata: Metadata = {
  title: caseStudiesHub.metaTitle,
  description: caseStudiesHub.metaDescription,
  alternates: { canonical: URL },
  openGraph: {
    title: caseStudiesHub.metaTitle,
    description: caseStudiesHub.metaDescription,
    url: URL,
    type: "website",
  },
};

export default function CaseStudiesIndex() {
  const studies = publishedCaseStudies();

  return (
    <Section className="pb-24 pt-32 sm:pt-40">
      <JsonLd
        data={crumbsJsonLd([
          { name: "Home", url: business.url },
          { name: "Case studies", url: URL },
        ])}
      />

      <div className="mx-auto max-w-3xl">
        <p className="eyebrow">{caseStudiesHub.eyebrow}</p>
        <h1 className="display-xl mt-6 text-balance text-4xl sm:text-5xl lg:text-6xl">
          {caseStudiesHub.title}
        </h1>
        <p className="mt-6 text-pretty text-lg leading-relaxed text-ink-2">{caseStudiesHub.sub}</p>

        <ul className="mt-12 flex flex-col">
          {studies.map((c) => (
            <li key={c.slug} className="border-t border-line last:border-b">
              <Link href={`${CASE_STUDIES_PATH}/${c.slug}`} className="group block py-7">
                <p className="eyebrow">
                  {c.industry} · {c.location}
                </p>
                <h2 className="display-m mt-3 text-xl text-ink transition-colors group-hover:text-gold sm:text-2xl">
                  {c.card.title}
                </h2>
                <p className="mt-2.5 text-base leading-relaxed text-ink-3">{c.card.blurb}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {c.card.highlights.map((h) => (
                    <span key={h} className="rounded-full border border-line-strong bg-bg-2 px-2.5 py-0.5 text-xs text-ink-3">
                      {h}
                    </span>
                  ))}
                </div>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-gold">
                  Read the case study
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          ))}
        </ul>

        {/* The installs that fit in one number, until their write-ups land */}
        <section className="mt-20">
          <p className="eyebrow">{caseStudiesHub.moreHeading}</p>
          <p className="mt-3 text-base text-ink-3">{caseStudiesHub.moreSub}</p>
          <ul className="mt-6 flex flex-col">
            {proofWins.map((w) => (
              <li key={w.company} className="flex flex-col gap-1 border-t border-line py-5 last:border-b sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                <div>
                  <p className="text-xs uppercase tracking-wide text-ink-4">{w.industry}</p>
                  {w.url ? (
                    <a
                      href={w.url}
                      target="_blank"
                      rel="noopener"
                      className="mt-1 inline-flex items-center gap-1 text-base font-semibold text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:text-gold hover:decoration-gold"
                    >
                      {w.company}
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </a>
                  ) : (
                    <p className="mt-1 text-base font-semibold text-ink">{w.company}</p>
                  )}
                </div>
                <p className="text-sm text-ink-2 sm:text-right">
                  <span className="number-tabular font-semibold text-ink">
                    {w.prefix}
                    {w.metric.toLocaleString("en-US")}
                    {w.suffix}
                  </span>{" "}
                  {w.framing.toLowerCase()}: {w.before} to {w.after}. {w.note}.
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Section>
  );
}
