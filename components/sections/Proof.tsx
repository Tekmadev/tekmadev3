"use client";

import { useRef, useState } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useMotionValueEvent,
  type MotionValue,
} from "motion/react";
import { Section, Eyebrow } from "@/components/Section";
import { proofWins as wins, aggregateStats, type ProofWin as Win } from "@/config/site";

export function Proof() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  return (
    <Section id="proof" className="py-32 sm:py-44">
      <div ref={ref}>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Eyebrow>Receipts</Eyebrow>
            <h2 className="display-xl mt-6 max-w-3xl text-balance text-5xl sm:text-6xl lg:text-7xl">
              Operators who stopped <span className="gold-gradient-text">losing leads.</span>
            </h2>
          </div>
          <p className="max-w-sm text-base leading-relaxed text-ink-2">
            Three of the forty-plus installs. Real businesses, real before and after numbers. Not
            cherry-picked screenshots.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-px overflow-hidden rounded-3xl border border-line bg-line md:grid-cols-3">
          {wins.map((w, i) => (
            <Card key={w.company} win={w} progress={scrollYProgress} index={i} />
          ))}
        </div>

        <div className="mt-16 grid grid-cols-2 gap-x-8 gap-y-10 border-t border-line pt-10 md:grid-cols-4">
          {aggregateStats.map((s) => (
            <Agg key={s.label} label={s.label} value={s.value} />
          ))}
        </div>
      </div>
    </Section>
  );
}

function formatMetric(val: number) {
  return Math.round(val).toLocaleString("en-US");
}

function Card({
  win,
  progress,
  index,
}: {
  win: Win;
  progress: MotionValue<number>;
  index: number;
}) {
  const start = 0.15 + index * 0.08;
  const end = start + 0.25;
  const counter = useTransform(progress, [start, end], [0, win.metric], { clamp: true });
  const [val, setVal] = useState(0);
  useMotionValueEvent(counter, "change", (latest) => setVal(latest));

  const opacity = useTransform(progress, [start - 0.05, start + 0.05], [0.55, 1]);
  const y = useTransform(progress, [start - 0.05, start + 0.1], [16, 0]);

  return (
    <motion.article
      style={{ opacity, y }}
      className="relative flex flex-col justify-between gap-10 bg-surface p-8 sm:p-10"
    >
      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="eyebrow">{win.industry}</p>
            <p className="mt-2 text-base font-medium text-ink-2">{win.company}</p>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-4">
            {win.note}
          </span>
        </div>

        <p className="display-xxl number-tabular mt-10 text-6xl text-ink sm:text-7xl">
          {win.prefix}
          {formatMetric(val)}
          {win.suffix}
        </p>
        <p className="mt-3 text-sm text-ink-3">{win.framing}</p>
      </div>

      <dl className="grid grid-cols-2 gap-3 border-t border-line pt-6 text-xs">
        <div>
          <dt className="eyebrow">Before</dt>
          <dd className="mt-1.5 text-sm text-ink-3 line-through decoration-signal/50">{win.before}</dd>
        </div>
        <div>
          <dt className="eyebrow text-gold">After</dt>
          <dd className="mt-1.5 text-sm font-semibold text-ink">{win.after}</dd>
        </div>
      </dl>
    </motion.article>
  );
}

function Agg({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="display-m number-tabular text-3xl text-ink sm:text-4xl">{value}</p>
      <p className="mt-2 text-xs leading-snug text-ink-3">{label}</p>
    </div>
  );
}
