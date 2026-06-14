import type { MetadataRoute } from "next";
import { business } from "@/config/site";
import { guideSlugs } from "@/lib/content";

const SITE_URL = business.url;

const legalRoutes = ["/privacy", "/terms", "/cookies"];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    {
      url: `${SITE_URL}/`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
    },
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
    ...legalRoutes.map((r) => ({
      url: `${SITE_URL}${r}`,
      lastModified: now,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    })),
  ];
}
