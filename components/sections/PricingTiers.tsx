"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Check, Loader2, ShieldCheck } from "lucide-react";
import { Section, Eyebrow } from "@/components/Section";
import { cn } from "@/lib/cn";
import { PROMO } from "@/config/pricing";
import type { DisplayTier } from "@/lib/pricing-data";
import { attributionProps, getAttribution } from "@/lib/attribution";
import { captureEvent } from "@/lib/analytics";

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

type Banner = { kind: "success" | "cancelled" | "error"; text: string } | null;

export function PricingTiers({
  tiers,
  deal = null,
  dealInfo = null,
}: {
  tiers: DisplayTier[];
  deal?: string | null;
  dealInfo?: string | null;
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner>(null);

  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get("checkout");
    if (status === "success") {
      setBanner({
        kind: "success",
        text: "You're in. Check your email for next steps. We'll be in touch within one business day.",
      });
      captureEvent("checkout_success", attributionProps(getAttribution()));
    } else if (status === "cancelled") {
      setBanner({
        kind: "cancelled",
        text: "Checkout cancelled. No charge was made. Pick a plan whenever you're ready.",
      });
    }
  }, []);

  async function startCheckout(tier: DisplayTier) {
    if (tier.cta.type !== "checkout" || loading) return;
    setLoading(tier.id);
    setBanner(null);

    const attribution = attributionProps(getAttribution());
    captureEvent("begin_checkout", { tier: tier.id, ...attribution });

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tier: tier.id, attribution, deal }),
      });
      const data: { url?: string; error?: string } = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setBanner({ kind: "error", text: data.error || "Something went wrong. Please book a call." });
    } catch {
      setBanner({ kind: "error", text: "Network error. Please try again or book a call." });
    }
    setLoading(null);
  }

  return (
    <Section className="pt-32 pb-28 sm:pt-40 sm:pb-36">
      <div className="mx-auto max-w-2xl text-center">
        <Eyebrow centered>Your plan</Eyebrow>
        <h1 className="display-xl mt-6 text-balance text-5xl sm:text-6xl">
          Pick the engine that <span className="gold-gradient-text">fills your calendar.</span>
        </h1>
        <p className="mt-6 text-lg leading-snug text-ink-2">
          One team runs all of it: the AI receptionist, the follow-up, the website, the marketing.
          You show up to the booked calls.
        </p>
      </div>

      {deal && (
        <div className="mx-auto mt-10 flex max-w-2xl items-center justify-center gap-3 rounded-2xl border border-gold/40 bg-gold/[0.08] px-5 py-4 text-center text-sm text-ink">
          <ShieldCheck className="h-4 w-4 shrink-0 text-gold-deep" />
          <span>
            <strong>Startup deal applied.</strong> {dealInfo}
          </span>
        </div>
      )}

      {PROMO.active && (
        <div className="mx-auto mt-6 flex max-w-2xl items-center justify-center gap-3 rounded-full border border-gold/30 bg-gold/[0.06] px-5 py-3 text-center text-sm text-ink-2">
          <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
          {PROMO.text}
        </div>
      )}

      {banner && (
        <div
          role="status"
          className={cn(
            "mx-auto mt-8 max-w-2xl rounded-2xl border px-5 py-4 text-center text-sm",
            banner.kind === "success"
              ? "border-gold/40 bg-gold/[0.08] text-ink"
              : banner.kind === "error"
                ? "border-signal/40 bg-signal/[0.06] text-ink"
                : "border-line-strong bg-bg-2 text-ink-2",
          )}
        >
          {banner.text}
        </div>
      )}

      <div className="mt-16 grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-stretch">
        {tiers.map((tier, i) => (
          <motion.div
            key={tier.id}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.5, delay: i * 0.08, ease: [0.22, 0.61, 0.36, 1] }}
          >
            <TierCard
              tier={tier}
              loading={loading === tier.id}
              anyLoading={loading !== null}
              dealActive={Boolean(deal)}
              onCheckout={() => startCheckout(tier)}
            />
          </motion.div>
        ))}
      </div>

      <p className="mx-auto mt-12 max-w-2xl text-center text-xs leading-relaxed text-ink-4">
        A short qualification call confirms fit before kickoff. Month-to-month, cancel with 30
        days&apos; notice, no long-term contract. Individual results vary and are not typical. Full
        terms apply.
      </p>
    </Section>
  );
}

function TierCard({
  tier,
  loading,
  anyLoading,
  dealActive,
  onCheckout,
}: {
  tier: DisplayTier;
  loading: boolean;
  anyLoading: boolean;
  dealActive: boolean;
  onCheckout: () => void;
}) {
  const isCustom = tier.monthlyAmount === null;

  return (
    <div
      className={cn(
        "relative flex h-full flex-col rounded-3xl border bg-surface p-8 sm:p-9",
        tier.highlighted
          ? "border-gold/50 shadow-[0_24px_60px_-30px_rgba(161,122,79,0.55)] ring-1 ring-gold/30"
          : "border-line-strong",
      )}
    >
      {tier.badge && (
        <span className="absolute -top-3 left-8 rounded-full bg-gold px-3 py-1 text-xs font-semibold tracking-wide text-bg">
          {tier.badge}
        </span>
      )}

      <h2 className="font-display text-2xl font-bold text-ink">{tier.name}</h2>
      <p className="mt-3 min-h-[4.5rem] text-sm leading-relaxed text-ink-3">{tier.blurb}</p>

      <div className="mt-6">
        {isCustom ? (
          <p className="display-xl text-4xl text-ink">Custom</p>
        ) : (
          <div className="flex items-baseline gap-1.5">
            <span className="display-xl text-5xl text-ink">
              {money(tier.monthlyAmount as number, tier.currency)}
            </span>
            <span className="text-sm text-ink-3">/mo</span>
          </div>
        )}
        <p className="mt-2 text-sm text-ink-3">
          {isCustom
            ? "custom scope"
            : dealActive && tier.cta.type === "checkout"
              ? "Setup fee waived"
              : tier.setupAmount && tier.setupAmount > 0
                ? `${money(tier.setupAmount, tier.currency)} setup, then monthly`
                : "billed monthly"}
        </p>
      </div>

      {tier.guarantee && (
        <div className="mt-5 flex items-center gap-2 rounded-xl border border-gold/30 bg-gold/[0.06] px-3.5 py-2.5 text-sm text-ink-2">
          <ShieldCheck className="h-4 w-4 shrink-0 text-gold-deep" />
          <span>30 booked calls in 60 days. Or you don&apos;t pay.</span>
        </div>
      )}

      <div className="my-7 h-px w-full bg-line" />

      <ul className="flex flex-1 flex-col gap-3.5">
        {tier.features.map((f) => {
          const isHeading = f.endsWith("plus:");
          return (
            <li key={f} className={cn("flex items-start gap-3", isHeading && "mt-1")}>
              {isHeading ? (
                <span className="text-sm font-medium text-ink">{f}</span>
              ) : (
                <>
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold/15">
                    <Check className="h-3 w-3 text-gold-deep" />
                  </span>
                  <span className="text-sm leading-snug text-ink-2">{f}</span>
                </>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-8">
        {tier.cta.type === "checkout" ? (
          <button
            type="button"
            onClick={onCheckout}
            disabled={anyLoading}
            className={cn(
              "inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-4 text-sm font-medium transition-colors disabled:opacity-60",
              tier.highlighted ? "bg-gold text-bg hover:bg-gold-deep" : "bg-ink text-bg hover:bg-ink-2",
            )}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Starting checkout…
              </>
            ) : (
              <>
                {tier.cta.label}
                <span aria-hidden>→</span>
              </>
            )}
          </button>
        ) : (
          <a
            href={tier.cta.href}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-line-strong px-6 py-4 text-sm font-medium text-ink transition-colors hover:border-gold/50 hover:text-gold"
          >
            {tier.cta.label}
            <span aria-hidden>→</span>
          </a>
        )}
      </div>
    </div>
  );
}
