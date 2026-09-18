import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CaseStudyArticle } from "@/components/CaseStudyArticle";
import { JsonLd } from "@/components/JsonLd";
import { business } from "@/config/site";
import { CASE_STUDIES_PATH, getCaseStudy, publishedCaseStudies } from "@/config/case-studies";
import { caseStudyJsonLd, crumbsJsonLd, faqPageJsonLd } from "@/lib/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return publishedCaseStudies().map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const study = getCaseStudy(slug);
  if (!study || !study.published) return {};
  const url = `${business.url}${CASE_STUDIES_PATH}/${study.slug}`;
  return {
    title: study.metaTitle,
    description: study.metaDescription,
    alternates: { canonical: url },
    openGraph: {
      title: study.metaTitle,
      description: study.metaDescription,
      url,
      type: "article",
      publishedTime: study.datePublished,
      modifiedTime: study.dateModified,
    },
    twitter: {
      card: "summary_large_image",
      title: study.metaTitle,
      description: study.metaDescription,
    },
  };
}

export default async function CaseStudyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const study = getCaseStudy(slug);
  if (!study || !study.published) notFound();

  const path = `${CASE_STUDIES_PATH}/${study.slug}`;

  return (
    <>
      <JsonLd data={caseStudyJsonLd(study, path)} />
      {study.faqs.length > 0 && <JsonLd data={faqPageJsonLd(study.faqs)} />}
      <JsonLd
        data={crumbsJsonLd([
          { name: "Home", url: business.url },
          { name: "Case studies", url: `${business.url}${CASE_STUDIES_PATH}` },
          { name: study.client, url: `${business.url}${path}` },
        ])}
      />
      <CaseStudyArticle study={study} />
    </>
  );
}
