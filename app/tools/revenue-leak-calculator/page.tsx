import type { Metadata } from "next";
import { Check } from "lucide-react";
import { Section } from "@/components/Section";
import { JsonLd } from "@/components/JsonLd";
import { Reveal } from "@/components/webline/Reveal";
import { CanadianBadge } from "@/components/CanadianBadge";
import { RevenueLeakCalculator } from "@/components/tools/RevenueLeakCalculator";
import { business } from "@/config/site";
import { crumbsJsonLd, faqPageJsonLd } from "@/lib/seo";
import {
  getLeadMagnet,
  revenueLeakCopy as c,
  REVENUE_LEAK_SLUG,
  TOOLS_PATH,
} from "@/config/lead-magnets";

const magnet = getLeadMagnet(REVENUE_LEAK_SLUG)!;
const PATH = `${TOOLS_PATH}/${REVENUE_LEAK_SLUG}`;
const URL = `${business.url}${PATH}`;

export const metadata: Metadata = {
  title: magnet.metaTitle,
  description: magnet.metaDescription,
  alternates: { canonical: URL },
  openGraph: {
    title: magnet.metaTitle,
    description: magnet.metaDescription,
    url: URL,
    type: "website",
  },
};

/** Static: the page is the same for everyone, and every number is computed in the browser. */
export const dynamic = "force-static";

const appJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: magnet.name,
  url: URL,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Any",
  description: magnet.metaDescription,
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "CAD" },
  publisher: { "@type": "Organization", name: business.legalName, url: business.url },
};

export default function RevenueLeakCalculatorPage() {
  return (
    <>
      <JsonLd
        data={crumbsJsonLd([
          { name: "Home", url: business.url },
          { name: "Free tools", url: `${business.url}${TOOLS_PATH}` },
          { name: magnet.name, url: URL },
        ])}
      />
      <JsonLd data={appJsonLd} />
      <JsonLd data={faqPageJsonLd(c.faqs)} />

      <Section className="pb-16 pt-32 sm:pt-40">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="h-px w-8 bg-ink-4" />
            <span className="eyebrow">{c.eyebrow}</span>
            <CanadianBadge className="ml-1" />
          </div>
          <h1 className="display-xl mt-6 text-balance text-4xl sm:text-5xl lg:text-6xl">
            {c.headline} <span className="gold-gradient-text">{c.headlineAccent}</span>
          </h1>
          <p className="mt-7 text-pretty text-lg leading-relaxed text-ink-2">{c.sub}</p>
        </div>
      </Section>

      <Section className="pb-24">
        <RevenueLeakCalculator />
      </Section>

      {/* What we would do about it */}
      <div className="border-y border-line bg-bg-2 py-24 sm:py-28">
        <Section>
          <div className="max-w-2xl">
            <Reveal>
              <p className="eyebrow">{c.plan.eyebrow}</p>
              <h2 className="display-xl mt-5 text-balance text-3xl sm:text-4xl lg:text-5xl">
                {c.plan.heading}
              </h2>
            </Reveal>
          </div>

          <dl className="mt-12 grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-2">
            {c.plan.steps.map((s, i) => (
              <Reveal key={s.title} delay={0.06 + i * 0.06}>
                <dt className="flex items-center gap-2.5 text-base font-semibold text-ink">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold/15">
                    <Check className="h-3 w-3 text-gold-deep" />
                  </span>
                  {s.title}
                </dt>
                <dd className="mt-2 pl-[1.9rem] text-base leading-relaxed text-ink-2">{s.body}</dd>
              </Reveal>
            ))}
          </dl>

          <Reveal delay={0.3} className="mt-12">
            <a
              href={c.plan.ctaHref}
              className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3.5 text-sm font-medium text-bg transition-colors hover:bg-ink-2"
            >
              {c.plan.cta}
              <span aria-hidden>→</span>
            </a>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-ink-3">{c.plan.ctaNote}</p>
          </Reveal>
        </Section>
      </div>

      {/* Assumptions, in the open */}
      <Section className="py-24">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <h2 className="display-l text-2xl text-ink sm:text-3xl">{c.assumptions.heading}</h2>
            <p className="mt-4 max-w-md text-base leading-relaxed text-ink-3">
              {c.assumptions.body}
            </p>
          </div>
          <ol className="lg:col-span-7">
            {c.assumptions.items.map((item, i) => (
              <li key={i} className="flex gap-4 border-t border-line py-5 last:border-b">
                <span className="number-tabular shrink-0 text-sm text-ink-4">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p className="text-base leading-relaxed text-ink-2">{item}</p>
              </li>
            ))}
          </ol>
        </div>
      </Section>

      {/* FAQ */}
      <div className="border-t border-line bg-bg-2 py-24">
        <Section>
          <div className="mx-auto max-w-3xl">
            <h2 className="display-l text-2xl text-ink sm:text-3xl">Straight answers</h2>
            <dl className="mt-10">
              {c.faqs.map((f) => (
                <div key={f.q} className="border-t border-line py-6 last:border-b">
                  <dt className="text-base font-semibold text-ink">{f.q}</dt>
                  <dd className="mt-2.5 text-base leading-relaxed text-ink-2">{f.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Section>
      </div>
    </>
  );
}
