"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { Phone } from "lucide-react";
import { Section } from "@/components/Section";
import { business, heroStats } from "@/config/site";

export function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });

  const y = useTransform(scrollYProgress, [0, 1], [0, -120]);
  const opacity = useTransform(scrollYProgress, [0, 0.6, 1], [1, 0.6, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.96]);
  const auroraY = useTransform(scrollYProgress, [0, 1], [0, 160]);
  const auroraRotate = useTransform(scrollYProgress, [0, 1], [0, 10]);
  const subY = useTransform(scrollYProgress, [0, 1], [0, -60]);
  const subOpacity = useTransform(scrollYProgress, [0, 0.7, 1], [1, 0.5, 0]);

  return (
    <div
      ref={ref}
      id="top"
      className="relative isolate min-h-[100svh] overflow-hidden pt-32 sm:pt-40"
    >
      <motion.div
        aria-hidden
        style={{ y: auroraY, rotate: auroraRotate }}
        className="pointer-events-none absolute -top-32 left-1/2 h-[700px] w-[1100px] -translate-x-1/2"
      >
        <div
          className="absolute inset-0 opacity-50 blur-3xl"
          style={{
            background:
              "radial-gradient(closest-side at 50% 35%, rgba(220, 195, 153, 0.55), rgba(220, 195, 153, 0.0) 70%)",
          }}
        />
      </motion.div>
      <div className="pointer-events-none absolute inset-0 grain" />

      <Section className="relative">
        <motion.div style={{ y, opacity, scale }} className="origin-top">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 0.61, 0.36, 1] }}
            className="inline-flex items-center gap-3"
          >
            <span className="h-px w-8 bg-ink-4" />
            <span className="eyebrow">Performance-based growth system</span>
          </motion.div>

          <h1 className="display-xxl mt-6 text-balance text-[12.5vw] sm:text-7xl md:text-[6.5rem] lg:text-[8.5rem] xl:text-[10rem]">
            <Line delay={0.05}>30 booked calls.</Line>
            <Line delay={0.18}>60 days.</Line>
            <Line delay={0.32} accent>
              Or you don&apos;t pay.
            </Line>
          </h1>
        </motion.div>

        <motion.div style={{ y: subY, opacity: subOpacity }}>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.55 }}
            className="mt-10 max-w-2xl text-balance text-lg leading-snug text-ink-2 sm:text-xl"
          >
            We install the AI and automation system that fills your calendar with qualified B2B
            calls. We build it, we run it, and guarantee it: 30 qualified calls in 60 days, or we
            refund your service fees.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.7 }}
            className="mt-9 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-3"
          >
            <a
              href="#book"
              className="group inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3.5 text-sm font-medium text-bg transition-all duration-300 hover:bg-ink-2"
            >
              Book your audit call
              <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-0.5">→</span>
            </a>
            <a
              href={`tel:${business.phone.tel}`}
              className="group inline-flex items-center gap-2 rounded-full border border-line-strong bg-bg-2/40 px-5 py-3.5 text-sm text-ink-2 transition-all duration-300 hover:border-ink hover:text-ink"
            >
              <Phone className="h-3.5 w-3.5 text-gold" />
              {business.phone.display}
            </a>
          </motion.div>

          <motion.dl
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.85 }}
            className="mt-16 grid max-w-2xl grid-cols-3 gap-6 border-t border-line pt-6"
          >
            {heroStats.map((s) => (
              <Stat key={s.label} label={s.label} value={s.value} />
            ))}
          </motion.dl>
        </motion.div>
      </Section>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 1.2 }}
        className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 sm:block"
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-4">
          Scroll
        </span>
      </motion.div>
    </div>
  );
}

function Line({
  children,
  delay,
  accent,
}: {
  children: React.ReactNode;
  delay: number;
  accent?: boolean;
}) {
  return (
    <motion.span
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.85, delay, ease: [0.22, 0.61, 0.36, 1] }}
      className={`block ${accent ? "gold-gradient-text" : "text-ink"}`}
    >
      {children}
    </motion.span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dd className="display-m number-tabular text-2xl text-ink sm:text-3xl">{value}</dd>
      <dt className="mt-1 text-xs text-ink-3">{label}</dt>
    </div>
  );
}
