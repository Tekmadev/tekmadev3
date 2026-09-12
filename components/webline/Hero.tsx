"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { Section } from "@/components/Section";
import { webline } from "@/config/webline";
import { CheckoutButton } from "@/components/webline/CheckoutButton";

export function WeblineHero({
  productId,
  purchasable,
  price,
  installment,
}: {
  productId: string;
  purchasable: boolean;
  price: string;
  installment: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, -90]);
  const opacity = useTransform(scrollYProgress, [0, 0.7, 1], [1, 0.6, 0]);
  const auroraY = useTransform(scrollYProgress, [0, 1], [0, 140]);

  const h = webline.hero;
  const priceLine = h.priceLine.replace("{price}", price).replace("{installment}", installment);

  return (
    <div ref={ref} id="top" className="relative isolate overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-28">
      <motion.div
        aria-hidden
        style={{ y: auroraY }}
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
        <motion.div style={{ y, opacity }} className="origin-top">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 0.61, 0.36, 1] }}
            className="inline-flex items-center gap-3"
          >
            <span className="h-px w-8 bg-ink-4" />
            <span className="eyebrow">{h.eyebrow}</span>
          </motion.div>

          <h1 className="display-xxl mt-6 max-w-5xl text-balance text-[13vw] sm:text-7xl md:text-[6rem] lg:text-[7.5rem]">
            {h.lines.map((line, i) => (
              <Line key={line} delay={0.05 + i * 0.13}>
                {line}
              </Line>
            ))}
            <Line delay={0.05 + h.lines.length * 0.13} accent>
              {h.accent}
            </Line>
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.5 }}
            className="mt-9 max-w-2xl text-balance text-lg leading-snug text-ink-2 sm:text-xl"
          >
            {h.sub}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.65 }}
            className="mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center"
          >
            <CheckoutButton productId={productId} purchasable={purchasable} size="lg" location="hero">
              {h.cta} for {price}
            </CheckoutButton>
            <a
              href="#included"
              className="group inline-flex items-center gap-2 rounded-full border border-line-strong bg-bg-2/40 px-5 py-3.5 text-sm text-ink-2 transition-all duration-300 hover:border-ink hover:text-ink"
            >
              {h.secondary}
              <span aria-hidden className="transition-transform duration-300 group-hover:translate-y-0.5">↓</span>
            </a>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.8 }}
            className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-3"
          >
            <span>{priceLine}</span>
            <span className="inline-flex gap-1.5">
              <Pill>Afterpay</Pill>
              <Pill>Klarna</Pill>
            </span>
          </motion.p>

          <motion.dl
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.95 }}
            className="mt-14 grid max-w-2xl grid-cols-3 gap-6 border-t border-line pt-6"
          >
            {h.stats.map((s) => (
              <div key={s.label}>
                <dd className="display-m number-tabular text-2xl text-ink sm:text-3xl">{s.value}</dd>
                <dt className="mt-1 text-xs text-ink-3">{s.label}</dt>
              </div>
            ))}
          </motion.dl>
        </motion.div>
      </Section>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-line-strong bg-surface px-2.5 py-0.5 text-xs font-medium text-ink-2">{children}</span>
  );
}

function Line({ children, delay, accent }: { children: React.ReactNode; delay: number; accent?: boolean }) {
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
