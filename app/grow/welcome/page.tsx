import type { Metadata } from "next";
import { ArrowRight, ArrowUpRight, Check, Phone } from "lucide-react";
import { Section, Eyebrow } from "@/components/Section";
import { FounderCard } from "@/components/FounderCard";
import { WelcomeBooking, WelcomeGreeting } from "@/components/grow/WelcomeClient";
import { aggregateStats, business, heroStats, proofWins } from "@/config/site";
import { CASE_STUDIES_PATH, publishedCaseStudies } from "@/config/case-studies";
import { fillWebline, webline, WEBLINE_ID, type WeblineMoney } from "@/config/webline";
import { WEBLINE_LIVE_DAYS } from "@/config/webline-delivery";
import { CALL_MINUTES, isGrowPath, pathOrder, type GrowPath } from "@/config/grow";
import { getDisplayProduct } from "@/lib/products-data";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";

/**
 * Where /grow sends people after the form: a quick look at what we do, led by
 * the offer that fits their answers (?for=growth|webline|custom, never
 * anything personal in the address), proof, and the calendar.
 *
 * Dynamic: it reads the query and the live Webline price on every request, so
 * a price change in the admin shows here at once.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Here is how we would grow it",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  alternates: { canonical: undefined },
};

type Offer = {
  eyebrow: string;
  title: string;
  lead: string;
  points: string[];
  proof: string | null;
  fine: string | null;
  cta: { label: string; href: string };
  secondary?: { label: string; href: string };
};

function stat(list: readonly { label: string; value: string }[], label: string) {
  return list.find((s) => s.label === label)?.value ?? null;
}

function offers(money: WeblineMoney | null): Record<GrowPath, Offer> {
  const stoneworks = proofWins.find((w) => w.company === "Stoneworks Interlock");
  return {
    growth: {
      eyebrow: "The Growth System",
      title: "More customers, on autopilot",
      lead: "For established service businesses. Built for owners doing, or going for, $20K to $100K+ a month.",
      points: [
        "An AI receptionist answers every call, 24/7",
        "Missed calls get an instant text back",
        "12 automatic follow-ups on every lead",
        "Google and Meta ads built and run for you",
        "Every lead, booking and review on one dashboard",
      ],
      proof: stoneworks ? `${stoneworks.company}: ${stoneworks.before} to ${stoneworks.after}, ${stoneworks.note}.` : null,
      fine: "Our full plan is backed by a guarantee: 30 qualified appointments in your first 60 days, or we keep working free until you hit it.",
      cta: { label: "Book my strategy call", href: "#book" },
      secondary: { label: "See how the system works", href: "/#system" },
    },
    webline: {
      eyebrow: "Webline",
      title: "A website that gets you found",
      lead: `Just starting? A professional website built to be found on Google and ChatGPT, live within ${WEBLINE_LIVE_DAYS} days.`,
      points: [
        "Designed and written for your business, not a template",
        "Search work for Google, AI answers and ChatGPT built in",
        "Contact form, click-to-call and booking so visits turn into conversations",
        "Launched on your domain, and looked after once it is live",
      ],
      proof: "We built it for our own repair shop, Fixible: calls every day, $0 spent on ads.",
      fine: money
        ? `${money.price} ${fillWebline(webline.stack.priceNote, money)} ${fillWebline(webline.stack.careNote, money)}`
        : null,
      cta: { label: "See Webline", href: "/webline" },
      secondary: { label: "Or talk it through on a call", href: "#book" },
    },
    custom: {
      eyebrow: "Custom work",
      title: "Something else in mind? We build it.",
      lead: "If it helps the business make money, we can probably build it. The call is where we scope it.",
      points: [
        "AI tools, agents and automations",
        "Apps and custom software",
        "Content and motion graphics videos",
        "Strategy and consulting, if you just want to think it through",
      ],
      proof: null,
      fine: null,
      cta: { label: "Tell us on the call", href: "#book" },
    },
  };
}

export default async function GrowWelcome({ searchParams }: { searchParams: Promise<{ for?: string }> }) {
  const { for: requested } = await searchParams;
  const first: GrowPath = isGrowPath(requested) ? requested : "growth";
  const order = pathOrder(first);

  const product = await getDisplayProduct(WEBLINE_ID);
  const money: WeblineMoney | null = product
    ? {
        price: formatMoney(product.amount, product.currency),
        installment: formatMoney(product.installment, product.currency, { cents: true }),
        currency: product.currency,
        monthly: product.monthly ? formatMoney(product.monthly.amount, product.currency) : null,
        trialDays: product.monthly?.trialDays ?? 30,
      }
    : null;
  const all = offers(money);

  const installed = stat(heroStats, "Systems installed");
  const stats = aggregateStats.slice(0, 4);
  const fixible = publishedCaseStudies().find((c) => c.slug === "fixible");

  return (
    <>
      {/* 1. You're in */}
      <Section className="pb-16 pt-6 sm:pb-20 sm:pt-10">
        <Eyebrow>
          <WelcomeGreeting />
        </Eyebrow>
        <h1 className="display-xl mt-6 max-w-4xl text-balance text-[2.5rem] leading-[1] sm:text-5xl lg:text-6xl">
          <span className="block text-ink">Look. You need to make money.</span>
          <span className="gold-gradient-text mt-2 block">We know. So let us handle the marketing and the development.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-ink-2">
          You get back to running the business. Here is how we would help, and the one step that matters now: pick a time
          for your call.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <a
            href="#book"
            className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3.5 text-sm font-medium text-bg transition-colors hover:bg-ink-2"
          >
            Pick a time for my call
            <ArrowRight className="h-4 w-4" aria-hidden />
          </a>
          <a
            href={`tel:${business.phone.tel}`}
            className="inline-flex items-center gap-2 rounded-full border border-line-strong px-5 py-3.5 text-sm text-ink-2 transition-colors hover:border-gold hover:text-gold"
          >
            <Phone className="h-4 w-4" aria-hidden />
            Rather talk now? {business.phone.display}
          </a>
        </div>
      </Section>

      {/* 2. What we can do, led by what fits them */}
      <Section className="border-t border-line py-16 sm:py-24">
        <Eyebrow>How we can help</Eyebrow>
        <h2 className="display-l mt-5 max-w-3xl text-balance text-3xl sm:text-5xl">One team for the marketing and the build.</h2>
        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {order.map((path, i) => (
            <OfferCard key={path} offer={all[path]} best={i === 0} />
          ))}
        </div>
      </Section>

      {/* 3. Why us */}
      <Section className="border-t border-line py-16 sm:py-24">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Eyebrow>Why work with us</Eyebrow>
            <h2 className="display-l mt-5 max-w-2xl text-balance text-3xl sm:text-5xl">Real businesses. Real numbers.</h2>
          </div>
          <p className="max-w-sm text-base leading-relaxed text-ink-2">
            {installed ? `${installed} systems installed since ${business.foundingYear}. ` : ""}Here are three of them, and
            our own shop.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-3xl border border-line bg-line md:grid-cols-3">
          {proofWins.map((w) => (
            <article key={w.company} className="flex flex-col gap-6 bg-surface p-7 sm:p-8">
              <div>
                <p className="eyebrow">{w.industry}</p>
                {w.url ? (
                  <a
                    href={w.url}
                    target="_blank"
                    rel="noopener"
                    className="mt-2 inline-flex items-center gap-1 text-base font-medium text-ink-2 underline decoration-line-strong underline-offset-4 transition-colors hover:text-gold hover:decoration-gold"
                  >
                    {w.company}
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                  </a>
                ) : (
                  <p className="mt-2 text-base font-medium text-ink-2">{w.company}</p>
                )}
              </div>
              <p className="display-l number-tabular text-5xl text-ink">
                {w.prefix}
                {w.metric.toLocaleString("en-US")}
                {w.suffix}
              </p>
              <div className="border-t border-line pt-4 text-sm">
                <p className="text-ink-3">{w.framing}</p>
                <p className="mt-1 text-ink">
                  {w.before} <span className="text-ink-4">to</span> {w.after}
                </p>
                <p className="mt-1 text-xs text-ink-4">{w.note}</p>
              </div>
            </article>
          ))}
        </div>

        {fixible && (
          <a
            href={`${CASE_STUDIES_PATH}/${fixible.slug}`}
            className="group mt-5 flex flex-col gap-4 rounded-3xl border border-line bg-surface p-7 transition-colors hover:border-gold/60 sm:flex-row sm:items-center sm:justify-between sm:p-8"
          >
            <div className="max-w-2xl">
              <p className="eyebrow">Case study · our own shop</p>
              <p className="display-m mt-3 text-balance text-xl text-ink sm:text-2xl">{fixible.card.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-3">{fixible.card.blurb}</p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-2 text-sm font-medium text-ink transition-colors group-hover:text-gold">
              Read it
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </span>
          </a>
        )}

        <div className="mt-12 grid grid-cols-2 gap-x-8 gap-y-8 border-t border-line pt-10 md:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label}>
              <p className="display-m number-tabular text-3xl text-ink">{s.value}</p>
              <p className="mt-1 text-xs text-ink-3">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-12">
          <FounderCard />
        </div>
      </Section>

      {/* 4. The step that matters */}
      <Section id="book" className="scroll-mt-4 border-t border-line py-16 sm:py-24">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,22rem)_1fr] lg:gap-14">
          <div>
            <Eyebrow>Your next step</Eyebrow>
            <h2 className="display-l mt-5 text-balance text-3xl sm:text-4xl">Pick a time for your strategy call.</h2>
            <p className="mt-5 text-base leading-relaxed text-ink-2">
              {CALL_MINUTES} minutes with the people who would build it. We map what is holding the business back and show
              you what we would do about it. No pressure, no pitch deck.
            </p>
            <ul className="mt-6 flex flex-col gap-2.5 text-sm text-ink-2">
              {["We look at your business before the call", "You leave with a plan either way", "Canadian team, real people"].map(
                (t) => (
                  <li key={t} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden />
                    {t}
                  </li>
                ),
              )}
            </ul>
            <a
              href={`tel:${business.phone.tel}`}
              className="mt-8 inline-flex items-center gap-2 text-sm text-ink-3 transition-colors hover:text-gold"
            >
              <Phone className="h-4 w-4" aria-hidden />
              Rather call? {business.phone.display}
            </a>
          </div>
          <WelcomeBooking />
        </div>
      </Section>

      <Section className="border-t border-line py-16 text-center sm:py-20">
        <p className="display-l mx-auto max-w-3xl text-balance text-3xl sm:text-5xl">
          You run the business. <span className="gold-gradient-text">We bring the customers in.</span>
        </p>
      </Section>
    </>
  );
}

function OfferCard({ offer, best }: { offer: Offer; best: boolean }) {
  return (
    <article
      className={cn(
        "relative flex flex-col rounded-3xl border p-7 sm:p-8",
        best ? "border-gold/70 bg-surface shadow-[0_30px_80px_-50px_rgba(161,122,79,0.55)] lg:order-none" : "border-line bg-surface",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow">{offer.eyebrow}</p>
        {best && (
          <span className="shrink-0 whitespace-nowrap rounded-full bg-gold/15 px-2.5 py-0.5 text-[11px] font-medium text-gold-deep dark:text-gold-soft">
            Best fit for you
          </span>
        )}
      </div>
      <h3 className="display-m mt-4 text-balance text-2xl text-ink">{offer.title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-ink-2">{offer.lead}</p>
      <ul className="mt-6 flex flex-col gap-2.5 text-sm text-ink-2">
        {offer.points.map((p) => (
          <li key={p} className="flex items-start gap-2.5">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden />
            {p}
          </li>
        ))}
      </ul>
      {offer.proof && (
        <p className="mt-6 rounded-2xl border border-line bg-bg-2 px-4 py-3 text-sm leading-relaxed text-ink-2">{offer.proof}</p>
      )}
      {offer.fine && <p className="mt-4 text-xs leading-relaxed text-ink-4">{offer.fine}</p>}
      <div className="mt-auto flex flex-col gap-3 pt-7">
        <a
          href={offer.cta.href}
          className={cn(
            "inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium transition-colors",
            best ? "bg-ink text-bg hover:bg-ink-2" : "border border-line-strong text-ink hover:border-gold hover:text-gold",
          )}
        >
          {offer.cta.label}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </a>
        {offer.secondary && (
          <a href={offer.secondary.href} className="text-center text-xs text-ink-3 transition-colors hover:text-gold">
            {offer.secondary.label}
          </a>
        )}
      </div>
    </article>
  );
}
