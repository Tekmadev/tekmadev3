import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GuideArticle } from "@/components/GuideArticle";
import { JsonLd } from "@/components/JsonLd";
import { getGuide, guides } from "@/lib/content";
import { business } from "@/config/site";
import { crumbsJsonLd, faqPageJsonLd, guideArticleJsonLd } from "@/lib/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return guides.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) return {};
  const path = `/guides/${guide.slug}`;
  return {
    title: guide.metaTitle,
    description: guide.metaDescription,
    alternates: { canonical: `${business.url}${path}` },
    openGraph: {
      title: guide.metaTitle,
      description: guide.metaDescription,
      url: `${business.url}${path}`,
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: guide.metaTitle,
      description: guide.metaDescription,
    },
  };
}

export default async function GuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();

  const path = `/guides/${guide.slug}`;

  return (
    <>
      <JsonLd data={guideArticleJsonLd(guide, path)} />
      {guide.faqs.length > 0 && <JsonLd data={faqPageJsonLd(guide.faqs)} />}
      <JsonLd
        data={crumbsJsonLd([
          { name: "Home", url: business.url },
          { name: "Guides", url: `${business.url}/guides` },
          { name: guide.h1, url: `${business.url}${path}` },
        ])}
      />
      <GuideArticle guide={guide} />
    </>
  );
}
