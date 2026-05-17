"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { Phone, Clock, ShieldCheck, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Section } from "@/components/Section";
import { BookingEmbed } from "@/components/BookingEmbed";
import { business, trustSignals } from "@/config/site";

const iconMap: Record<string, LucideIcon> = {
  Clock,
  ShieldCheck,
  Zap,
};

export function FinalCTA() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const auroraY = useTransform(scrollYProgress, [0, 1], [80, -80]);

  return (
    <div
      id="book"
      ref={ref}
      className="relative isolate overflow-hidden border-t border-line bg-bg-2 py-24 sm:py-32"
    >
      <motion.div
        aria-hidden
        style={{ y: auroraY }}
        className="pointer-events-none absolute -top-32 left-1/2 h-[700px] w-[1100px] -translate-x-1/2 opacity-60 blur-3xl"
      >
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(closest-side at 50% 35%, rgba(220,195,153,0.45), rgba(220,195,153,0) 70%)",
          }}
        />
      </motion.div>

      <Section className="relative">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <span className="eyebrow">Last step</span>

            <h2 className="display-xl mt-6 text-balance text-5xl sm:text-6xl lg:text-7xl">
              Your calendar.{" "}
              <span className="gold-gradient-text">Full.</span>{" "}
              <span className="block">In 60 days.</span>
            </h2>

            <p className="mt-7 max-w-md text-balance text-lg leading-snug text-ink-2">
              Pick a time on the right. 45 minutes. We map your pipeline live and tell you
              whether the system fits.
            </p>

            <a
              href={`tel:${business.phone.tel}`}
              className="mt-9 inline-flex items-center gap-3 rounded-2xl border border-line-strong bg-surface px-5 py-4 transition-colors hover:border-ink"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/15">
                <Phone className="h-4 w-4 text-gold-deep" />
              </div>
              <div className="text-left">
                <p className="eyebrow">Or call us</p>
                <p className="text-base font-semibold text-ink">{business.phone.display}</p>
              </div>
            </a>

            <ul className="mt-10 space-y-3.5 text-sm text-ink-2">
              {trustSignals.map((t) => (
                <Trust key={t.text} icon={iconMap[t.iconName]} text={t.text} />
              ))}
            </ul>
          </div>

          <div className="lg:col-span-7">
            <BookingEmbed />
          </div>
        </div>
      </Section>
    </div>
  );
}

function Trust({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <li className="flex items-center gap-3">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-surface">
        <Icon className="h-3.5 w-3.5 text-gold-deep" />
      </span>
      <span>{text}</span>
    </li>
  );
}
