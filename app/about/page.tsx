import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Section } from "@/components/Section";
import { JsonLd } from "@/components/JsonLd";
import { CanadianBadge } from "@/components/CanadianBadge";
import { business } from "@/config/site";
import { ABOUT_PATH, about } from "@/config/about";
import { aboutPageJsonLd, crumbsJsonLd, faqPageJsonLd, socialMeta } from "@/lib/seo";

const URL = `${business.url}${ABOUT_PATH}`;

export const metadata: Metadata = {
  title: { absolute: about.metaTitle },
  description: about.metaDescription,
  alternates: { canonical: URL },
  ...socialMeta({ title: about.metaTitle, description: about.metaDescription, url: URL }),
};

const office = business.registeredOffice;

// Entity facts, stated once and identically to the footer and the schema.
const FACTS: { label: string; value: string; href?: string }[] = [
  { label: "Legal name", value: business.legalName },
  { label: "Founder", value: business.privacyOfficer.name },
  { label: "Headquarters", value: `${office.city}, ${office.province}, ${office.country}` },
  { label: "Address", value: `${office.line1}, ${office.city}, ${office.province} ${office.postalCode}` },
  { label: "Phone", value: business.phone.display, href: `tel:${business.phone.tel}` },
  { label: "Email", value: business.email, href: `mailto:${business.email}` },
  { label: "Ownership", value: "100% Canadian owned and operated" },
  { label: "Serves", value: business.areasServed.map((a) => a.name).join(", ") },
];

/** A question-shaped heading followed by the direct answer: the form AI engines quote. */
function Block({ heading, answer, children }: { heading: string; answer: string; children?: React.ReactNode }) {
  return (
    <section className="border-t border-line py-12 sm:py-14">
      <h2 className="display-m text-balance text-2xl text-ink sm:text-3xl">{heading}</h2>
      <p className="mt-5 text-pretty text-lg leading-relaxed text-ink-2">{answer}</p>
      {children}
    </section>
  );
}

export default function AboutPage() {
  return (
    <Section className="pb-24 pt-32 sm:pt-40">
      <JsonLd
        data={[
          aboutPageJsonLd(ABOUT_PATH, about.metaTitle, about.metaDescription),
          crumbsJsonLd([
            { name: "Home", url: business.url },
            { name: "About", url: URL },
          ]),
          faqPageJsonLd(about.faq.items.map((f) => ({ q: f.q, a: f.a }))),
        ]}
      />

      <div className="mx-auto max-w-3xl">
        <p className="eyebrow">{about.eyebrow}</p>
        <h1 className="display-xl mt-6 text-balance text-4xl sm:text-5xl lg:text-6xl">{about.h1}</h1>
        <p className="mt-7 text-pretty text-lg leading-relaxed text-ink-2 sm:text-xl">{about.definition}</p>
        <div className="mt-7">
          <CanadianBadge variant="pill" />
        </div>

        <div className="mt-14">
          <Block heading={about.why.heading} answer={about.why.answer}>
            {about.why.body.map((p) => (
              <p key={p} className="mt-4 text-base leading-relaxed text-ink-3">
                {p}
              </p>
            ))}
          </Block>

          <Block heading={about.what.heading} answer={about.what.answer}>
            <dl className="mt-8 grid grid-cols-1 gap-x-10 gap-y-7 sm:grid-cols-2">
              {about.what.groups.map((g) => (
                <div key={g.title}>
                  <dt className="font-display text-base font-bold text-ink">{g.title}</dt>
                  <dd className="mt-1.5 text-[15px] leading-relaxed text-ink-3">{g.text}</dd>
                </div>
              ))}
            </dl>
          </Block>

          <Block heading={about.different.heading} answer={about.different.answer}>
            <ol className="mt-8 flex flex-col gap-7">
              {about.different.points.map((p, i) => (
                <li key={p.title} className="flex gap-5">
                  <span className="number-tabular mt-0.5 font-mono text-sm text-gold">0{i + 1}</span>
                  <div>
                    <h3 className="font-display text-base font-bold text-ink">{p.title}</h3>
                    <p className="mt-1.5 text-[15px] leading-relaxed text-ink-3">{p.text}</p>
                    {"link" in p && p.link && (
                      <Link href={p.link.href} className="mt-2 inline-flex items-center gap-1 text-sm text-gold-deep transition-colors hover:text-gold">
                        {p.link.label} <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </Block>

          <Block heading={about.proof.heading} answer={about.proof.answer}>
            <p className="mt-4 text-base leading-relaxed text-ink-3">{about.proof.body}</p>
            <Link
              href={about.proof.link.href}
              className="mt-5 inline-flex items-center gap-2 rounded-full border border-line-strong px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:border-gold hover:text-gold"
            >
              {about.proof.link.label} <ArrowUpRight className="h-4 w-4" />
            </Link>
            <p className="mt-5 text-xs leading-relaxed text-ink-4">{about.proof.disclosure}</p>
          </Block>

          <Block heading={about.who.heading} answer={about.who.answer}>
            <p className="mt-4 text-base leading-relaxed text-ink-3">{about.who.body}</p>
          </Block>

          <section className="border-t border-line py-12 sm:py-14">
            <h2 className="display-m text-2xl text-ink sm:text-3xl">{about.factsHeading}</h2>
            <dl className="mt-7 divide-y divide-line overflow-hidden rounded-2xl border border-line-strong bg-surface">
              {FACTS.map((f) => (
                <div key={f.label} className="grid grid-cols-1 gap-1 px-5 py-3.5 sm:grid-cols-[11rem_1fr] sm:gap-4">
                  <dt className="text-sm text-ink-4">{f.label}</dt>
                  <dd className="text-sm font-medium text-ink">
                    {f.href ? (
                      <a href={f.href} className="transition-colors hover:text-gold">
                        {f.value}
                      </a>
                    ) : (
                      f.value
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="border-t border-line py-12 sm:py-14">
            <h2 className="display-m text-2xl text-ink sm:text-3xl">{about.faq.heading}</h2>
            <dl className="mt-7 flex flex-col">
              {about.faq.items.map((f) => (
                <div key={f.q} className="border-t border-line py-6 first:border-t-0 first:pt-0">
                  <dt className="font-display text-base font-bold text-ink">{f.q}</dt>
                  <dd className="mt-2 text-[15px] leading-relaxed text-ink-3">{f.a}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-3xl border border-line-strong bg-surface p-8 sm:p-10">
            <h2 className="display-m text-balance text-2xl text-ink sm:text-3xl">{about.cta.heading}</h2>
            <p className="mt-3 text-base leading-relaxed text-ink-3">{about.cta.body}</p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href={about.cta.primary.href}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-ink px-6 py-3.5 text-sm font-medium text-bg transition-colors hover:bg-ink-2"
              >
                {about.cta.primary.label} <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href={about.cta.secondary.href} className="inline-flex items-center justify-center gap-1.5 px-2 py-2 text-sm text-ink-2 transition-colors hover:text-gold">
                {about.cta.secondary.label} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </section>
        </div>
      </div>
    </Section>
  );
}
