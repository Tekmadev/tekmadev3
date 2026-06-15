"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { Check } from "lucide-react";
import { Section, Eyebrow } from "@/components/Section";
import { brand } from "@/config/site";

const promises = brand.promises;

export function Pricing() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const numberScale = useTransform(scrollYProgress, [0.1, 0.5], [0.85, 1]);
  const numberOpacity = useTransform(scrollYProgress, [0.05, 0.3], [0, 1]);

  return (
    <Section id="pricing" className="py-32 sm:py-44">
      <div ref={ref} className="relative">
        <div className="grid grid-cols-1 gap-16 lg:grid-cols-12 lg:gap-20">
          <div className="lg:col-span-7">
            <Eyebrow>The offer</Eyebrow>
            <h2 className="display-xl mt-6 text-balance text-5xl sm:text-6xl lg:text-7xl">
              If we don&apos;t fill your calendar,{" "}
              <span className="gold-gradient-text">you don&apos;t pay.</span>
            </h2>

            <p className="mt-8 max-w-xl text-lg leading-snug text-ink-2">
              Every other agency invoices for activity. We invoice for outcomes. If your calendar
              doesn&apos;t fill, our pipeline doesn&apos;t fill. Same incentive. Same side of the
              table.
            </p>

            <ul className="mt-12 flex flex-col gap-4">
              {promises.map((p, i) => (
                <motion.li
                  key={p}
                  initial={{ opacity: 0, x: -12 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, amount: 0.5 }}
                  transition={{ duration: 0.5, delay: i * 0.08, ease: [0.22, 0.61, 0.36, 1] }}
                  className="flex items-start gap-4"
                >
                  <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold/15">
                    <Check className="h-3 w-3 text-gold-deep" />
                  </span>
                  <span className="text-lg leading-snug text-ink">{p}</span>
                </motion.li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-5">
            <div className="relative overflow-hidden rounded-3xl border border-line-strong bg-surface p-8 sm:p-10">
              <p className="eyebrow">The guarantee</p>

              <motion.div
                style={{ scale: numberScale, opacity: numberOpacity }}
                className="mt-8 origin-left"
              >
                <p className="display-xxl text-7xl text-ink sm:text-8xl">30</p>
                <p className="mt-2 text-sm text-ink-3">booked calls in 60 days, guaranteed</p>
              </motion.div>

              <div className="my-10 h-px w-full bg-line" />

              <p className="text-base font-medium text-ink">Performance-guaranteed.</p>
              <p className="mt-2 text-base leading-relaxed text-ink-2">
                We don&apos;t get paid to keep busy. If the system doesn&apos;t put 30 qualified
                calls on your calendar in your first 60 days, you get your money back, and we keep
                working until it does.
              </p>

              <a
                href="#book"
                className="mt-10 inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink px-6 py-4 text-sm font-medium text-bg transition-colors hover:bg-ink-2"
              >
                Apply for the system
                <span aria-hidden>→</span>
              </a>

              <p className="mt-5 text-center text-xs text-ink-4">
                Qualification call required before kickoff
              </p>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}
