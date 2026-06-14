import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { getGuide, guides, guideTitle, type Guide } from "@/lib/content";

function isUrl(s: string) {
  return /^https?:\/\//i.test(s);
}

export function GuideArticle({ guide }: { guide: Guide }) {
  // Use the article's own cross-links when they resolve to real guides; otherwise
  // fall back to the rest of the cluster so every page stays interlinked.
  const validLinks = (guide.internalLinks ?? [])
    .filter((l) => l.targetSlug !== guide.slug && getGuide(l.targetSlug))
    .map((l) => ({ slug: l.targetSlug, label: l.anchor || guideTitle(l.targetSlug) }));
  const related =
    validLinks.length > 0
      ? validLinks
      : guides
          .filter((g) => g.slug !== guide.slug)
          .map((g) => ({ slug: g.slug, label: g.h1 }));

  return (
    <article className="mx-auto w-full max-w-3xl px-5 pt-32 pb-24 sm:px-8 sm:pt-40">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-8 text-xs text-ink-4">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/" className="transition-colors hover:text-ink">
              Home
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li>
            <Link href="/guides" className="transition-colors hover:text-ink">
              Guides
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li className="text-ink-3">{guide.h1}</li>
        </ol>
      </nav>

      <header>
        <h1 className="display-xl text-balance text-4xl sm:text-5xl lg:text-6xl">{guide.h1}</h1>
        <p className="mt-7 text-pretty text-lg leading-relaxed text-ink-2 sm:text-xl">
          {guide.intro}
        </p>
      </header>

      <div className="mt-14 flex flex-col gap-14">
        {guide.sections.map((s, i) => (
          <section key={i}>
            <h2 className="display-m text-2xl text-ink sm:text-3xl">{s.heading}</h2>

            {/* Answer-first, visually distinct so it reads (and gets quoted) clean */}
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

            {s.table && (
              <div className="mt-6 overflow-x-auto rounded-2xl border border-line">
                <table className="w-full border-collapse text-left text-sm">
                  {s.table.caption && (
                    <caption className="px-4 pt-4 text-left text-xs text-ink-4">
                      {s.table.caption}
                    </caption>
                  )}
                  <thead>
                    <tr className="border-b border-line">
                      {s.table.headers.map((h, h2) => (
                        <th key={h2} className="px-4 py-3 font-semibold text-ink">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {s.table.rows.map((row, r) => (
                      <tr key={r} className="border-b border-line-soft last:border-0">
                        {row.map((cell, c) => (
                          <td key={c} className="px-4 py-3 align-top text-ink-2">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}
      </div>

      {/* Sourced stats */}
      {guide.stats && guide.stats.length > 0 && (
        <section className="mt-16 rounded-2xl border border-line bg-bg-2 p-6 sm:p-8">
          <p className="eyebrow">By the numbers</p>
          <ul className="mt-5 flex flex-col gap-4">
            {guide.stats.map((st, i) => (
              <li key={i} className="text-sm leading-relaxed text-ink-2">
                {st.text}{" "}
                {isUrl(st.source) ? (
                  <a
                    href={st.source}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex items-center gap-0.5 text-ink-4 underline decoration-line-strong underline-offset-2 transition-colors hover:text-gold"
                  >
                    Source <ArrowUpRight className="h-3 w-3" />
                  </a>
                ) : (
                  <span className="text-ink-4">({st.source})</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* FAQs */}
      {guide.faqs.length > 0 && (
        <section className="mt-16">
          <h2 className="display-m text-2xl text-ink sm:text-3xl">Frequently asked questions</h2>
          <dl className="mt-7 flex flex-col">
            {guide.faqs.map((f, i) => (
              <div key={i} className="border-t border-line py-6">
                <dt className="text-base font-semibold text-ink sm:text-lg">{f.q}</dt>
                <dd className="mt-2.5 text-base leading-relaxed text-ink-2">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* Related guides */}
      {related.length > 0 && (
        <section className="mt-16">
          <p className="eyebrow">Keep reading</p>
          <ul className="mt-5 flex flex-col gap-3">
            {related.map((l) => (
              <li key={l.slug}>
                <Link
                  href={`/guides/${l.slug}`}
                  className="group inline-flex items-center gap-2 text-base text-ink-2 transition-colors hover:text-gold"
                >
                  {l.label}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* CTA */}
      <section className="mt-16 overflow-hidden rounded-3xl border border-line-strong bg-surface p-8 sm:p-10">
        <h2 className="display-m text-2xl text-ink sm:text-3xl">{guide.cta.heading}</h2>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-2">{guide.cta.body}</p>
        <a
          href="/#book"
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3.5 text-sm font-medium text-bg transition-colors hover:bg-ink-2"
        >
          {guide.cta.buttonLabel}
          <ArrowRight className="h-4 w-4" />
        </a>
      </section>
    </article>
  );
}
