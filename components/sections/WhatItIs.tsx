"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { Section, Eyebrow } from "@/components/Section";
import { whatItIs } from "@/config/site";

const { isNot, isYes } = whatItIs;

export function WhatItIs() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const headlineY = useTransform(scrollYProgress, [0, 1], [60, -60]);

  return (
    <Section className="py-32 sm:py-44" id="what">
      <div ref={ref}>
        <Eyebrow>What this is</Eyebrow>

        <motion.h2
          style={{ y: headlineY }}
          className="display-xl mt-7 max-w-5xl text-balance text-5xl sm:text-7xl lg:text-[5.5rem]"
        >
          You don&apos;t have a{" "}
          <span className="relative inline-block">
            <span className="text-ink-4">lead</span>
            <ScrollStrike progress={scrollYProgress} />
          </span>{" "}
          problem. You have a <span className="gold-gradient-text">conversion</span> problem.
        </motion.h2>

        <p className="mt-10 max-w-2xl text-balance text-lg leading-snug text-ink-2">
          Most operators are paying for leads that disappear into voicemail, missed replies, and
          forgotten follow-ups. Tekmadev installs the system that catches every one of them and
          turns it into a booked appointment.
        </p>

        <div className="mt-20 grid grid-cols-1 gap-x-12 gap-y-16 md:grid-cols-2 md:gap-y-0">
          <ScrollList
            label="What it isn't"
            items={isNot}
            progress={scrollYProgress}
            start={0.2}
            tone="muted"
          />
          <ScrollList
            label="What it is"
            items={isYes}
            progress={scrollYProgress}
            start={0.35}
            tone="gold"
          />
        </div>
      </div>
    </Section>
  );
}

function ScrollStrike({
  progress,
}: {
  progress: ReturnType<typeof useScroll>["scrollYProgress"];
}) {
  const scaleX = useTransform(progress, [0.05, 0.35], [0, 1]);
  return (
    <motion.span
      style={{ scaleX, originX: 0 }}
      className="absolute inset-x-0 top-[55%] block h-[6px] -translate-y-1/2 bg-signal sm:h-[8px] lg:h-[10px]"
      aria-hidden
    />
  );
}

function ScrollList({
  label,
  items,
  progress,
  start,
  tone,
}: {
  label: string;
  items: string[];
  progress: ReturnType<typeof useScroll>["scrollYProgress"];
  start: number;
  tone: "muted" | "gold";
}) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <ul className="mt-6 flex flex-col gap-3">
        {items.map((item, i) => (
          <ScrollItem
            key={item}
            progress={progress}
            start={start + i * 0.04}
            tone={tone}
            strike={tone === "muted"}
          >
            {item}
          </ScrollItem>
        ))}
      </ul>
    </div>
  );
}

function ScrollItem({
  children,
  progress,
  start,
  tone,
  strike,
}: {
  children: React.ReactNode;
  progress: ReturnType<typeof useScroll>["scrollYProgress"];
  start: number;
  tone: "muted" | "gold";
  strike?: boolean;
}) {
  const opacity = useTransform(progress, [start, start + 0.08], [0.2, 1]);
  const x = useTransform(progress, [start, start + 0.08], [-12, 0]);
  return (
    <motion.li
      style={{ opacity, x }}
      className={`flex items-center gap-3 text-2xl font-semibold tracking-tight sm:text-3xl ${
        tone === "muted" ? "text-ink-3" : "text-ink"
      }`}
    >
      <span
        className={`flex h-1.5 w-1.5 shrink-0 rounded-full ${
          tone === "gold" ? "bg-gold" : "bg-ink-4"
        }`}
      />
      <span className={strike ? "line-through decoration-signal/60 decoration-2" : ""}>
        {children}
      </span>
    </motion.li>
  );
}
