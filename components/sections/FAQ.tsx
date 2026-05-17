"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { Section, Eyebrow } from "@/components/Section";
import { faqs } from "@/config/site";

export function FAQ() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  return (
    <Section id="faq" className="py-32 sm:py-44">
      <div ref={ref}>
        <div className="grid grid-cols-1 gap-16 lg:grid-cols-12 lg:gap-20">
          <div className="lg:col-span-4">
            <Eyebrow>Honest answers</Eyebrow>
            <h2 className="display-xl mt-6 text-balance text-5xl sm:text-6xl">
              The questions, <span className="gold-gradient-text">handled.</span>
            </h2>
            <p className="mt-7 max-w-sm text-base leading-relaxed text-ink-2">
              Anything not here gets answered on the audit call. No demo. No pressure. Just a
              45-minute look at your numbers.
            </p>
          </div>

          <ul className="lg:col-span-8">
            {faqs.map((f, i) => (
              <FAQRow key={i} q={f.q} a={f.a} index={i} total={faqs.length} progress={scrollYProgress} />
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}

function FAQRow({
  q,
  a,
  index,
  total,
  progress,
}: {
  q: string;
  a: string;
  index: number;
  total: number;
  progress: ReturnType<typeof useScroll>["scrollYProgress"];
}) {
  const start = 0.1 + (index / total) * 0.5;
  const opacity = useTransform(progress, [start, start + 0.06], [0.3, 1]);
  const y = useTransform(progress, [start, start + 0.06], [12, 0]);

  return (
    <motion.li
      style={{ opacity, y }}
      className="grid grid-cols-1 gap-3 border-t border-line py-7 sm:grid-cols-[1fr_2fr] sm:gap-10"
    >
      <p className="text-base font-semibold text-ink sm:text-lg">{q}</p>
      <p className="text-base leading-relaxed text-ink-2">{a}</p>
    </motion.li>
  );
}
