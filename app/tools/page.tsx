import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Section } from "@/components/Section";
import { JsonLd } from "@/components/JsonLd";
import { business } from "@/config/site";
import { crumbsJsonLd } from "@/lib/seo";
import { publishedLeadMagnets, toolsHub, TOOLS_PATH } from "@/config/lead-magnets";

export const metadata: Metadata = {
  title: toolsHub.metaTitle,
  description: toolsHub.metaDescription,
  alternates: { canonical: `${business.url}${TOOLS_PATH}` },
  openGraph: {
    title: toolsHub.metaTitle,
    description: toolsHub.metaDescription,
    url: `${business.url}${TOOLS_PATH}`,
    type: "website",
  },
};

export default function ToolsIndex() {
  const tools = publishedLeadMagnets();

  return (
    <Section className="pb-24 pt-32 sm:pt-40">
      <JsonLd
        data={crumbsJsonLd([
          { name: "Home", url: business.url },
          { name: "Free tools", url: `${business.url}${TOOLS_PATH}` },
        ])}
      />

      <div className="mx-auto max-w-3xl">
        <p className="eyebrow">{toolsHub.eyebrow}</p>
        <h1 className="display-xl mt-6 text-balance text-4xl sm:text-5xl lg:text-6xl">
          {toolsHub.title}
        </h1>
        <p className="mt-6 text-pretty text-lg leading-relaxed text-ink-2">{toolsHub.sub}</p>

        <ul className="mt-12 flex flex-col">
          {tools.map((t) => (
            <li key={t.slug} className="border-t border-line last:border-b">
              <Link href={`${TOOLS_PATH}/${t.slug}`} className="group block py-7">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="display-m text-xl text-ink transition-colors group-hover:text-gold sm:text-2xl">
                    {t.name}
                  </h2>
                  <span className="rounded-full border border-line-strong bg-bg-2 px-2.5 py-0.5 text-xs text-ink-3">
                    {t.cardMeta}
                  </span>
                </div>
                <p className="mt-2.5 text-base leading-relaxed text-ink-3">{t.cardBlurb}</p>
                <span className="mt-3.5 inline-flex items-center gap-1.5 text-sm font-medium text-gold">
                  Open the tool
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
