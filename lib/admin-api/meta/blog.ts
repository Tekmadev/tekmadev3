import { requireDb } from "../data";
import { listCategoryRows } from "../blog/data";
import { defineMetaFragment } from "./types";

/**
 * The blog slice of GET /meta: the keys of `metaFragment` in the app's
 * src/api/schemas/blog.ts (see docs/api-requests/blog.md section 9).
 * Categories are as of the meta fetch (editors read GET /blog/categories for
 * fresh counts) and only go to roles that may view the blog.
 */

export const BLOG_STATUS_META = [
  { value: "draft", label: "Draft", tone: "muted" },
  { value: "in_review", label: "In review", tone: "neutral" },
  { value: "published", label: "Published", tone: "gold" },
  { value: "archived", label: "Archived", tone: "muted" },
] as const;

export const BLOG_BLOCK_TYPE_META = [
  { value: "heading", label: "Heading" },
  { value: "paragraph", label: "Paragraph" },
  { value: "list", label: "List" },
  { value: "quote", label: "Quote" },
  { value: "callout", label: "Callout" },
  { value: "answer", label: "Short answer" },
  { value: "image", label: "Image" },
  { value: "table", label: "Table" },
  { value: "code", label: "Code" },
  { value: "cta", label: "Call to action" },
  { value: "divider", label: "Divider" },
] as const;

export const metaFragment = defineMetaFragment(async (ctx) => {
  const categories = ctx.can("blog.view") ? await listCategoryRows(requireDb()) : [];
  return {
    blogStatuses: BLOG_STATUS_META,
    blogBlockTypes: BLOG_BLOCK_TYPE_META,
    blogCategories: categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
  };
});
