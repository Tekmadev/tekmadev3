import { business } from "@/config/site";
import type { BlogBlock, BlogFaq } from "@/lib/blog-data";
import { blocksToMarkdown } from "@/lib/blog-markdown";
import { instant } from "../data";

/**
 * The blog shapes the admin app reads (docs/api-requests/blog.md in the app
 * repo, src/api/schemas/blog.ts), built from the website's blog_* rows
 * (supabase/migrations/20260905000001_blog_schema.sql).
 *
 * The body is stored as blocks (blog_posts.body). The app edits Markdown, so
 * `bodyMarkdown` is the website's own serializer over the stored blocks
 * (lib/blog-markdown.ts), the same text the web editor loads.
 */

/* ------------------------------------------------------------------ */
/* Enums and copy                                                      */
/* ------------------------------------------------------------------ */

export const POST_STATUSES = ["draft", "in_review", "published", "archived"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export type PostSource = "manual" | "ai_draft";

/**
 * The database also allows "scheduled", which nothing sets today (no
 * scheduled publishing yet). It reads as a draft: not live.
 */
export function toPostStatus(stored: string | null | undefined): PostStatus {
  if (stored === "in_review" || stored === "published" || stored === "archived") return stored;
  return "draft";
}

/** Stored values behind an app status (the list filter). */
export function storedStatusesFor(status: PostStatus): string[] {
  return status === "draft" ? ["draft", "scheduled"] : [status];
}

/** voice_capture is drafted by an automation too; imported posts read as written by hand. */
export function toPostSource(stored: string | null | undefined): PostSource {
  return stored === "ai_draft" || stored === "voice_capture" ? "ai_draft" : "manual";
}

export const BLOG_COPY = {
  postMissing: "That post",
  categoryMissing: "That category",
  title: "Enter a title.",
  status: "Pick a valid status.",
  author: "That author no longer exists.",
  category: "That category no longer exists.",
  canonical: "Enter a full https:// URL for the canonical link.",
  canonicalField: "Enter a full https:// URL.",
  imageUrl: "Enter a full https:// image URL.",
  faqs: "Each FAQ needs a question and an answer.",
  slugTaken: "That slug is already used by another post (including one in the trash).",
  empty: "Add some body text before publishing.",
  markdown: "Send the Markdown to render.",
  categoryName: "Enter a category name.",
  categoryTooLong: (max: number) => `Keep the name to ${max} characters or fewer.`,
  categoryDup: "A category with that name already exists.",
  mediaType: "Use a PNG, JPG, WebP, AVIF or GIF image.",
  mediaEmpty: "That file is empty.",
  mediaSizeField: "Must be a number of bytes.",
} as const;

/** Category names are capped at 60 characters (the app's CATEGORY_NAME_MAX). */
export const CATEGORY_NAME_MAX = 60;

/* ------------------------------------------------------------------ */
/* Rows                                                                */
/* ------------------------------------------------------------------ */

export type AuthorRow = { id: string; name: string; avatar_url: string | null; role: string | null; active?: boolean | null; created_at?: string };
export type CategoryRefRow = { id: string; name: string };

/** One embed from PostgREST: normally an object, but tolerate an array. */
export function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

/** Columns of GET /blog/posts. */
export const POST_ROW_SELECT =
  "id,title,slug,status,featured,updated_at,published_at,source,excerpt,author_id,category_id,author:blog_authors(id,name),category:blog_categories(id,name)";

export type PostListRow = {
  id: string;
  title: string;
  slug: string;
  status: string;
  featured: boolean | null;
  updated_at: string;
  published_at: string | null;
  source: string | null;
  excerpt: string | null;
  author_id: string | null;
  category_id: string | null;
  author: { id: string; name: string } | { id: string; name: string }[] | null;
  category: CategoryRefRow | CategoryRefRow[] | null;
};

/** Columns of one post with its author and category. */
export const POST_DETAIL_SELECT =
  "*, author:blog_authors(id,name,avatar_url,role), category:blog_categories(id,name)";

export type PostDetailRow = {
  id: string;
  slug: string;
  status: string;
  title: string;
  meta_title: string | null;
  meta_description: string | null;
  excerpt: string | null;
  body: unknown;
  faqs: unknown;
  key_takeaways: unknown;
  target_query: string | null;
  keywords: string[] | null;
  canonical_url: string | null;
  noindex: boolean | null;
  og_image_url: string | null;
  cover_image_url: string | null;
  cover_image_alt: string | null;
  author_id: string | null;
  category_id: string | null;
  tags: string[] | null;
  featured: boolean | null;
  published_at: string | null;
  source: string | null;
  source_metadata: unknown;
  ai_model: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  author: AuthorRow | AuthorRow[] | null;
  category: CategoryRefRow | CategoryRefRow[] | null;
};

/* ------------------------------------------------------------------ */
/* App shapes                                                          */
/* ------------------------------------------------------------------ */

export type ApiAuthor = { id: string; name: string; photoUrl: string | null; role: string | null };
export type ApiFaq = { question: string; answer: string };

export type ApiPostRow = {
  id: string;
  title: string;
  slug: string;
  status: PostStatus;
  featured: boolean;
  category: { id: string; name: string } | null;
  author: { id: string; name: string };
  updatedAt: string;
  publishedAt: string | null;
  source: PostSource;
  excerpt: string | null;
};

export type ApiPost = {
  id: string;
  title: string;
  slug: string;
  status: PostStatus;
  author: ApiAuthor;
  category: { id: string; name: string } | null;
  excerpt: string | null;
  featured: boolean;
  targetQuery: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  keywords: string[];
  tags: string[];
  canonicalUrl: string | null;
  noindex: boolean;
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  socialImageUrl: string | null;
  source: PostSource;
  provenance: { source: string; model: string; sourceTitle: string | null } | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
};

export type ApiPostDetail = {
  post: ApiPost;
  bodyMarkdown: string;
  faqs: ApiFaq[];
  keyTakeaways: string[];
  updatedAt: string;
};

export type ApiCategory = { id: string; name: string; slug: string; postCount: number };

/** Text the app shows as "nothing": null, never "". */
export function textOrNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  return value.trim() ? value : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

export function toApiAuthor(row: AuthorRow): ApiAuthor {
  return { id: row.id, name: row.name, photoUrl: textOrNull(row.avatar_url), role: textOrNull(row.role) };
}

/**
 * The byline when a post has none (its author was removed, or none was set):
 * the default author, else the founder's public name.
 */
export function fallbackAuthor(defaultAuthor: ApiAuthor | null): ApiAuthor {
  return defaultAuthor ?? { id: "", name: business.privacyOfficer.name, photoUrl: null, role: null };
}

export function toPostRow(row: PostListRow, defaultAuthor: ApiAuthor | null): ApiPostRow {
  const author = one(row.author);
  const category = one(row.category);
  const byline = author ? { id: author.id, name: author.name } : fallbackAuthor(defaultAuthor);
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    status: toPostStatus(row.status),
    featured: Boolean(row.featured),
    category: category ? { id: category.id, name: category.name } : null,
    author: { id: byline.id, name: byline.name },
    updatedAt: instant(row.updated_at),
    publishedAt: instant(row.published_at),
    source: toPostSource(row.source),
    excerpt: textOrNull(row.excerpt),
  };
}

/** Stored FAQ rows are `{ q, a }` (lib/blog-data BlogFaq); tolerate `{ question, answer }` too. */
function toApiFaqs(value: unknown): ApiFaq[] {
  if (!Array.isArray(value)) return [];
  const out: ApiFaq[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<BlogFaq> & { question?: unknown; answer?: unknown };
    const question = typeof row.q === "string" ? row.q : typeof row.question === "string" ? row.question : "";
    const answer = typeof row.a === "string" ? row.a : typeof row.answer === "string" ? row.answer : "";
    if (question || answer) out.push({ question, answer });
  }
  return out;
}

/** Where an automated draft came from. Null for posts written by hand. */
function provenanceOf(row: PostDetailRow): ApiPost["provenance"] {
  if (toPostSource(row.source) !== "ai_draft") return null;
  const meta = row.source_metadata && typeof row.source_metadata === "object" && !Array.isArray(row.source_metadata)
    ? (row.source_metadata as Record<string, unknown>)
    : {};
  const text = (...keys: string[]): string | null => {
    for (const key of keys) {
      const value = meta[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return null;
  };
  return {
    source: text("source", "kind") ?? (row.source === "voice_capture" ? "voice_capture" : "ai_draft"),
    model: textOrNull(row.ai_model)?.trim() ?? text("model") ?? "unknown",
    sourceTitle: text("source_title", "sourceTitle", "title"),
  };
}

export function blocksOf(value: unknown): BlogBlock[] {
  return Array.isArray(value) ? (value as BlogBlock[]) : [];
}

export function toPostDetail(row: PostDetailRow, defaultAuthor: ApiAuthor | null): ApiPostDetail {
  const author = one(row.author);
  const category = one(row.category);
  const updatedAt = instant(row.updated_at);
  const post: ApiPost = {
    id: row.id,
    title: row.title,
    slug: row.slug,
    status: toPostStatus(row.status),
    author: author ? toApiAuthor(author) : fallbackAuthor(defaultAuthor),
    category: category ? { id: category.id, name: category.name } : null,
    excerpt: textOrNull(row.excerpt),
    featured: Boolean(row.featured),
    targetQuery: textOrNull(row.target_query),
    metaTitle: textOrNull(row.meta_title),
    metaDescription: textOrNull(row.meta_description),
    keywords: stringList(row.keywords),
    tags: stringList(row.tags),
    canonicalUrl: textOrNull(row.canonical_url),
    noindex: Boolean(row.noindex),
    coverImageUrl: textOrNull(row.cover_image_url),
    coverImageAlt: textOrNull(row.cover_image_alt),
    socialImageUrl: textOrNull(row.og_image_url),
    source: toPostSource(row.source),
    provenance: provenanceOf(row),
    createdAt: instant(row.created_at),
    updatedAt,
    publishedAt: instant(row.published_at),
  };
  return {
    post,
    bodyMarkdown: blocksToMarkdown(blocksOf(row.body)),
    faqs: toApiFaqs(row.faqs),
    keyTakeaways: stringList(row.key_takeaways),
    updatedAt,
  };
}
