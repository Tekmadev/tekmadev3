import guidesData from "@/content/guides.json";

/**
 * Long-form SEO/GEO guide pages (the pillar + cluster). Content is authored in
 * content/guides.json and rendered by components/GuideArticle.tsx at /guides/[slug].
 */
export type GuideSection = {
  heading: string;
  answer: string;
  body: string[];
  bullets?: string[];
  table?: { caption?: string; headers: string[]; rows: string[][] };
};
export type GuideStat = { text: string; source: string };
export type GuideFAQ = { q: string; a: string };
export type GuideLink = { anchor: string; targetSlug: string };
export type GuideCTA = { heading: string; body: string; buttonLabel: string };

export type Guide = {
  slug: string;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  intro: string;
  sections: GuideSection[];
  stats?: GuideStat[];
  faqs: GuideFAQ[];
  internalLinks?: GuideLink[];
  cta: GuideCTA;
  /** ISO dates. updatedAt moves whenever the text or its sources are re-checked. */
  publishedAt?: string;
  updatedAt?: string;
};

export const guides = guidesData as Guide[];

/** Fallback for a guide with no publishedAt of its own: the day the cluster went live. */
export const GUIDE_PUBLISHED = "2026-06-14";

export const guideSlugs = guides.map((g) => g.slug);

export function getGuide(slug: string): Guide | undefined {
  return guides.find((g) => g.slug === slug);
}

export function guideTitle(slug: string): string {
  return getGuide(slug)?.h1 ?? slug;
}
