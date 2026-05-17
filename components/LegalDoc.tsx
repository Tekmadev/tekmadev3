"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import type { LegalDoc, LegalBlock } from "@/config/legal";
import { Section } from "@/components/Section";

type Props = { doc: LegalDoc };

export function LegalDocView({ doc }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });
  const progress = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);

  return (
    <div ref={ref} className="relative isolate pt-28 pb-32 sm:pt-36 sm:pb-44">
      <div className="pointer-events-none fixed inset-x-0 top-[72px] z-40 h-px bg-line">
        <motion.div style={{ width: progress }} className="h-full origin-left bg-ink" />
      </div>

      <Section>
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-16">
          <aside className="lg:col-span-3">
            <div className="lg:sticky lg:top-28">
              <p className="eyebrow">{doc.title}</p>
              <p className="mt-3 text-xs leading-relaxed text-ink-3">
                Effective {formatDate(doc.effectiveDate)}
                <br />
                Last updated {formatDate(doc.lastUpdated)}
              </p>

              <nav className="mt-8 hidden border-t border-line pt-6 lg:block">
                <p className="eyebrow">On this page</p>
                <ul className="mt-4 space-y-2">
                  {doc.sections.map((s) => (
                    <li key={s.id}>
                      <a
                        href={`#${s.id}`}
                        className="text-xs leading-snug text-ink-3 transition-colors hover:text-ink"
                      >
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>
          </aside>

          <article className="lg:col-span-9">
            <h1 className="display-xl text-balance text-5xl text-ink sm:text-6xl lg:text-7xl">
              {doc.title}
            </h1>
            <p className="mt-5 max-w-2xl text-balance text-lg leading-snug text-ink-2">
              {doc.subtitle}
            </p>
            <p className="mt-8 max-w-3xl text-base leading-relaxed text-ink-2">{doc.intro}</p>

            <div className="mt-16 flex flex-col gap-16">
              {doc.sections.map((section) => (
                <section key={section.id} id={section.id} className="scroll-mt-28">
                  <h2 className="display-m max-w-3xl text-balance text-2xl text-ink sm:text-3xl">
                    {section.title}
                  </h2>
                  <div className="mt-6 flex flex-col gap-5 text-base leading-relaxed text-ink-2">
                    {section.blocks.map((block, i) => (
                      <Block key={i} block={block} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </article>
        </div>
      </Section>
    </div>
  );
}

function Block({ block }: { block: LegalBlock }) {
  switch (block.type) {
    case "p":
      return <p className="max-w-3xl">{block.text}</p>;
    case "h3":
      return <h3 className="mt-4 text-base font-semibold text-ink">{block.text}</h3>;
    case "ul":
      return (
        <ul className="ml-1 flex max-w-3xl list-none flex-col gap-2.5">
          {block.items.map((it, i) => (
            <li key={i} className="flex items-start gap-3">
              <span aria-hidden className="mt-2.5 flex h-1 w-1 shrink-0 rounded-full bg-ink-3" />
              <span>{it}</span>
            </li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol className="ml-1 flex max-w-3xl list-none flex-col gap-2.5">
          {block.items.map((it, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="number-tabular mt-0.5 shrink-0 text-xs font-mono text-ink-4">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span>{it}</span>
            </li>
          ))}
        </ol>
      );
    case "note":
      return (
        <p className="max-w-3xl rounded-2xl border border-line bg-bg-2/60 p-5 text-sm text-ink-2">
          {block.text}
        </p>
      );
  }
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
