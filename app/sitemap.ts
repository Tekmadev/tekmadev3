import type { MetadataRoute } from "next";
import { business } from "@/config/site";
import { guideSlugs } from "@/lib/content";
import { getPublishedPostSlugs } from "@/lib/blog-data";
import { publishedLeadMagnets } from "@/config/lead-magnets";
import { CASE_STUDIES_PATH, publishedCaseStudies } from "@/config/case-studies";

const SITE_URL = business.url;

const legalRoutes = ["/privacy", "/terms", "/cookies"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const posts = await getPublishedPostSlugs();

  return [
    {
      url: `${SITE_URL}/`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/webline`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/about`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/tools`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    ...publishedLeadMagnets().map((m) => ({
      url: `${SITE_URL}/tools/${m.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    {
      url: `${SITE_URL}${CASE_STUDIES_PATH}`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    ...publishedCaseStudies().map((c) => ({
      url: `${SITE_URL}${CASE_STUDIES_PATH}/${c.slug}`,
      lastModified: new Date(c.dateModified),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    {
      url: `${SITE_URL}/guides`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...guideSlugs.map((slug) => ({
      url: `${SITE_URL}/guides/${slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    {
      url: `${SITE_URL}/blog`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
    },
    ...posts.map((p) => ({
      url: `${SITE_URL}/blog/${p.slug}`,
      lastModified: p.updated_at ? new Date(p.updated_at) : now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...legalRoutes.map((r) => ({
      url: `${SITE_URL}${r}`,
      lastModified: now,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    })),
  ];
}
