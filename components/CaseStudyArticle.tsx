import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { business } from "@/config/site";
import { CASE_STUDIES_PATH, publishedCaseStudies, type CaseStudy } from "@/config/case-studies";

function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-CA", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function CaseStudyArticle({ study }: { study: CaseStudy }) {
  const others = publishedCaseStudies().filter((c) => c.slug !== study.slug);

  return (
    <article className="mx-auto w-full max-w-3xl px-5 pt-32 pb-24 sm:px-8 sm:pt-40">
      <nav aria-label="Breadcrumb" className="mb-8 text-xs text-ink-4">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/" className="transition-colors hover:text-ink">
              Home
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li>
            <Link href={CASE_STUDIES_PATH} className="transition-colors hover:text-ink">
              Case studies
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li className="text-ink-3">{study.client}</li>
        </ol>
      </nav>

      <header>
        <p className="eyebrow">{study.eyebrow}</p>
        <h1 className="display-xl mt-6 text-balance text-4xl sm:text-5xl lg:text-6xl">
          {study.h1} <span className="gold-gradient-text">{study.h1Accent}</span>
        </h1>
        <p className="mt-7 text-pretty text-lg leading-relaxed text-ink-2 sm:text-xl">{study.intro}</p>
        <p className="mt-6 text-sm text-ink-4">
          By {business.privacyOfficer.name}, Founder · {longDate(study.datePublished)}
        </p>
      </header>

      {/* The facts, scannable before the story */}
      <dl className="mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
        {study.facts.map((f) => (
          <div key={f.label} className="bg-surface px-5 py-4">
            <dt className="eyebrow">{f.label}</dt>
            <dd className="mt-1.5 text-base font-semibold text-ink">
              {f.href ? (
                <a
                  href={f.href}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-1 underline decoration-line-strong underline-offset-4 transition-colors hover:text-gold hover:decoration-gold"
                >
                  {f.value}
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              ) : (
                f.value
              )}
            </dd>
          </div>
        ))}
      </dl>

      {/* Answer-first: the whole study in one paragraph, quotable on its own */}
      <p className="mt-12 border-l-2 border-gold pl-4 text-base font-medium leading-relaxed text-ink sm:text-lg">
        {study.summary}
      </p>

      <div className="mt-14 flex flex-col gap-14">
        {study.sections.map((s) => (
          <section key={s.heading}>
            <h2 className="display-m text-2xl text-ink sm:text-3xl">{s.heading}</h2>
            <p className="mt-5 border-l-2 border-gold pl-4 text-base font-medium leading-relaxed text-ink sm:text-lg">
              {s.answer}
            </p>
            {s.body.map((p, j) => (
              <p key={j} className="mt-5 text-base leading-relaxed text-ink-2">
                {p}
              </p>
            ))}
            {s.bullets && s.bullets.length > 0 && (
              <ul className="mt-5 flex flex-col gap-2.5">
                {s.bullets.map((b, k) => (
                  <li key={k} className="flex gap-3 text-base leading-relaxed text-ink-2">
                    <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      {study.stats.length > 0 && (
        <section className="mt-16 rounded-2xl border border-line bg-bg-2 p-6 sm:p-8">
          <p className="eyebrow">By the numbers</p>
          <ul className="mt-5 flex flex-col gap-4">
            {study.stats.map((st) => (
              <li key={st.sourceUrl} className="text-sm leading-relaxed text-ink-2">
                {st.text}{" "}
                <a
                  href={st.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex items-center gap-0.5 text-ink-4 underline decoration-line-strong underline-offset-2 transition-colors hover:text-gold"
                >
                  {st.source} <ArrowUpRight className="h-3 w-3" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {study.faqs.length > 0 && (
        <section className="mt-16">
          <h2 className="display-m text-2xl text-ink sm:text-3xl">Frequently asked questions</h2>
          <dl className="mt-7 flex flex-col">
            {study.faqs.map((f) => (
              <div key={f.q} className="border-t border-line py-6">
                <dt className="text-base font-semibold text-ink sm:text-lg">{f.q}</dt>
                <dd className="mt-2.5 text-base leading-relaxed text-ink-2">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section className="mt-16 rounded-3xl border border-line bg-surface p-8 sm:p-10">
        <h2 className="display-m text-2xl text-ink sm:text-3xl">{study.cta.heading}</h2>
        <p className="mt-4 text-base leading-relaxed text-ink-2">{study.cta.body}</p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <Link
            href={study.cta.primary.href}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-ink px-6 py-3.5 text-sm font-medium text-bg transition-colors hover:bg-ink-2"
          >
            {study.cta.primary.label}
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href={study.cta.secondary.href}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-line-strong px-6 py-3.5 text-sm font-medium text-ink transition-colors hover:border-gold hover:text-gold"
          >
            {study.cta.secondary.label}
          </Link>
        </div>
      </section>

      {others.length > 0 && (
        <section className="mt-16">
          <p className="eyebrow">More case studies</p>
          <ul className="mt-5 flex flex-col gap-3">
            {others.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`${CASE_STUDIES_PATH}/${c.slug}`}
                  className="group inline-flex items-center gap-2 text-base text-ink-2 transition-colors hover:text-gold"
                >
                  {c.card.title}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
