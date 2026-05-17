"use client";

import { useRef, useState } from "react";
import {
  motion,
  AnimatePresence,
  useScroll,
  useTransform,
  useMotionValueEvent,
  type MotionValue,
} from "motion/react";
import { Eyebrow } from "@/components/Section";
import { systemSteps as steps } from "@/config/site";

export function TheSystem() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });

  const [active, setActive] = useState(0);

  useMotionValueEvent(scrollYProgress, "change", (latest) => {
    const clamped = Math.min(0.9999, Math.max(0, latest));
    const idx = Math.min(steps.length - 1, Math.floor(clamped * steps.length));
    if (idx !== active) setActive(idx);
  });

  return (
    <>
      <MobileSystem />
      <DesktopSystem
        ref={ref}
        active={active}
        scrollYProgress={scrollYProgress}
      />
    </>
  );
}

function MobileSystem() {
  return (
    <section id="system" className="bg-bg-2 lg:hidden">
      <div className="mx-auto w-full max-w-6xl px-5 py-24 sm:px-8 sm:py-28">
        <Eyebrow>The system</Eyebrow>
        <h2 className="display-xl mt-4 text-balance text-4xl sm:mt-6 sm:text-5xl">
          Four steps.{" "}
          <span className="gold-gradient-text">Fourteen days.</span>{" "}
          Then it runs itself.
        </h2>
        <p className="mt-5 max-w-md text-base leading-relaxed text-ink-2 sm:mt-7">
          One productized system. Six moving parts. Engineered to answer every call,
          follow up with every lead, and book appointments, without you adding a single
          headcount.
        </p>

        <div className="mt-10 space-y-5">
          {steps.map((s) => (
            <article
              key={s.n}
              className="rounded-3xl border border-line-strong bg-surface p-6 shadow-[0_30px_80px_-50px_rgba(13,12,10,0.25)] sm:p-8"
            >
              <div className="flex items-baseline justify-between">
                <span className="display-l number-tabular text-5xl text-ink sm:text-6xl">
                  {s.n}
                </span>
                <span className="eyebrow">{s.spec}</span>
              </div>
              <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.22em] text-gold">
                {s.label}
              </p>
              <h3 className="display-l mt-3 max-w-md text-balance text-2xl text-ink sm:text-3xl">
                {s.title}
              </h3>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-2 sm:text-base">
                {s.body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

type DesktopProps = {
  ref: React.RefObject<HTMLDivElement | null>;
  active: number;
  scrollYProgress: MotionValue<number>;
};

function DesktopSystem({ ref, active, scrollYProgress }: DesktopProps) {
  const sectionHeight = 100 + 110 * steps.length;

  return (
    <section
      id="system-desktop"
      ref={ref}
      className="relative hidden bg-bg-2 lg:block"
      style={{ height: `${sectionHeight}vh` }}
    >
      <div className="sticky top-0 flex h-screen items-center overflow-hidden">
        <div className="mx-auto w-full max-w-6xl px-10">
          <div className="grid grid-cols-12 items-center gap-16">
            <div className="col-span-5">
              <Eyebrow>The system</Eyebrow>
              <h2 className="display-xl mt-6 text-balance text-7xl">
                Four steps.{" "}
                <span className="gold-gradient-text">Fourteen days.</span>{" "}
                Then it runs itself.
              </h2>
              <p className="mt-7 max-w-md text-base leading-relaxed text-ink-2">
                One productized system. Six moving parts. Engineered to answer every call,
                follow up with every lead, and book appointments, without you adding a single
                headcount.
              </p>

              <div className="mt-10 flex items-center gap-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-ink-3">
                  Step{" "}
                  <span className="text-ink">
                    {String(active + 1).padStart(2, "0")}
                  </span>
                  <span className="text-ink-4"> / 04</span>
                </p>
                <StepRail progress={scrollYProgress} />
              </div>
            </div>

            <div className="relative col-span-7 h-[520px]">
              <AnimatePresence mode="wait">
                <motion.article
                  key={active}
                  initial={{ opacity: 0, y: 28 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -28 }}
                  transition={{ duration: 0.5, ease: [0.22, 0.61, 0.36, 1] }}
                  className="absolute inset-0 flex flex-col justify-center rounded-3xl border border-line-strong bg-surface p-12 shadow-[0_30px_80px_-50px_rgba(13,12,10,0.25)]"
                >
                  <div className="flex items-baseline justify-between">
                    <span className="display-l number-tabular text-8xl text-ink">
                      {steps[active].n}
                    </span>
                    <span className="eyebrow">{steps[active].spec}</span>
                  </div>

                  <p className="mt-10 font-mono text-[11px] uppercase tracking-[0.22em] text-gold">
                    {steps[active].label}
                  </p>
                  <h3 className="display-l mt-4 max-w-md text-balance text-4xl text-ink">
                    {steps[active].title}
                  </h3>
                  <p className="mt-5 max-w-md text-base leading-relaxed text-ink-2">
                    {steps[active].body}
                  </p>
                </motion.article>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StepRail({ progress }: { progress: MotionValue<number> }) {
  return (
    <div className="flex flex-1 items-center gap-1.5">
      {steps.map((s, i) => (
        <RailBar key={s.n} index={i} total={steps.length} progress={progress} />
      ))}
    </div>
  );
}

function RailBar({
  index,
  total,
  progress,
}: {
  index: number;
  total: number;
  progress: MotionValue<number>;
}) {
  const start = index / total;
  const end = (index + 1) / total;
  const fill = useTransform(progress, [start, end], [0, 1], { clamp: true });
  return (
    <div className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-line">
      <motion.div
        style={{ scaleX: fill, originX: 0 }}
        className="absolute inset-0 bg-ink"
      />
    </div>
  );
}
