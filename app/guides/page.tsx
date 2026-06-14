import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Section } from "@/components/Section";
import { JsonLd } from "@/components/JsonLd";
import { guides } from "@/lib/content";
import { business } from "@/config/site";
import { crumbsJsonLd } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Guides: how to get more clients for your service business",
  description:
    "Plain-English guides on getting more clients: responding faster, never missing a call, following up, and choosing the right kind of help. Or skip the reading and let us run it.",
  alternates: { canonical: `${business.url}/guides` },
  openGraph: {
    title: "Guides: how to get more clients for your service business",
    description:
      "Plain-English guides on getting more clients, and the done-for-you system behind them.",
    url: `${business.url}/guides`,
    type: "website",
  },
};

export default function GuidesIndex() {
  return (
    <Section className="pt-32 pb-24 sm:pt-40">
      <JsonLd
        data={crumbsJsonLd([
          { name: "Home", url: business.url },
          { name: "Guides", url: `${business.url}/guides` },
        ])}
      />
      <div className="mx-auto max-w-3xl">
        <p className="eyebrow">Guides</p>
        <h1 className="display-xl mt-6 text-balance text-4xl sm:text-5xl lg:text-6xl">
          How to get more clients: the playbook
        </h1>
        <p className="mt-6 text-pretty text-lg leading-relaxed text-ink-2">
          Straight answers on what actually brings a service business more clients: respond
          faster, stop missing calls, follow up relentlessly, and pick the right kind of help.
          Read them, or hand the whole thing to us and we run it for you.
        </p>

        <ul className="mt-12 flex flex-col">
          {guides.map((g) => (
            <li key={g.slug} className="border-t border-line last:border-b">
              <Link href={`/guides/${g.slug}`} className="group block py-7">
                <h2 className="display-m text-xl text-ink transition-colors group-hover:text-gold sm:text-2xl">
                  {g.h1}
                </h2>
                <p className="mt-2.5 text-base leading-relaxed text-ink-3">{g.metaDescription}</p>
                <span className="mt-3.5 inline-flex items-center gap-1.5 text-sm font-medium text-gold">
                  Read the guide
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-14">
          <a
            href="/#book"
            className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3.5 text-sm font-medium text-bg transition-colors hover:bg-ink-2"
          >
            Or just book a call and we&apos;ll handle it
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </Section>
  );
}
