import type { MetadataRoute } from "next";
import { business } from "@/config/site";

const SITE_URL = business.url;

const homeAnchors = ["system", "proof", "pricing", "faq", "book"];

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
    ...homeAnchors.map((s) => ({
      url: `${SITE_URL}/#${s}`,
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
