import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * Blog data layer. Reads and writes the blog_* tables in Supabase through the
 * server-only service-role client (the tables have RLS on with no policies, so
 * all access is server-side, same pattern as `plans`/`subscribers`).
 *
 * Post content is stored as an array of typed blocks in `blog_posts.body`
 * (jsonb). Structured blocks render cleanly to semantic HTML, can be reordered
 * or re-templated later, and are exactly what an AI drafter or the voice-capture
 * pipeline will emit, so the storage shape never has to change.
 */

// ---------------------------------------------------------------------------
// Content model (blog_posts.body)
// ---------------------------------------------------------------------------

export type BlogBlock =
  | { type: "heading"; level: 2 | 3 | 4; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered?: boolean; items: string[] }
  | { type: "quote"; text: string; cite?: string }
  | { type: "callout"; variant?: "info" | "tip" | "warning"; text: string }
  | { type: "answer"; question?: string; text: string }
  | { type: "image"; url: string; alt: string; caption?: string }
  | { type: "table"; caption?: string; headers: string[]; rows: string[][] }
  | { type: "code"; language?: string; code: string }
  | { type: "cta"; heading: string; body?: string; buttonLabel: string; href: string }
  | { type: "divider" };

export type BlogFaq = { q: string; a: string };
export type BlogInternalLink = { anchor: string; targetSlug: string };

// ---------------------------------------------------------------------------
// Row types (mirror the DB columns)
// ---------------------------------------------------------------------------

export type BlogStatus = "draft" | "in_review" | "scheduled" | "published" | "archived";
export type BlogSource = "manual" | "ai_draft" | "voice_capture" | "imported";

export type BlogAuthor = {
  id: string;
  slug: string;
  name: string;
  role: string | null;
  bio: string | null;
  avatar_url: string | null;
  email: string | null;
  social: Record<string, string>;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type BlogCategory = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type BlogPost = {
  id: string;
  slug: string;
  status: BlogStatus;
  title: string;
  meta_title: string | null;
  meta_description: string | null;
  excerpt: string | null;
  body: BlogBlock[];
  faqs: BlogFaq[];
  key_takeaways: string[];
  target_query: string | null;
  keywords: string[];
  canonical_url: string | null;
  noindex: boolean;
  og_image_url: string | null;
  seo: Record<string, unknown>;
  cover_image_url: string | null;
  cover_image_alt: string | null;
  author_id: string | null;
  category_id: string | null;
  tags: string[];
  internal_links: BlogInternalLink[];
  featured: boolean;
  published_at: string | null;
  scheduled_for: string | null;
  reading_time_minutes: number | null;
  locale: string;
  source: BlogSource;
  source_metadata: Record<string, unknown>;
  ai_model: string | null;
  ai_generated: boolean;
  view_count: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

/** A post with its author and category joined in, ready to render or list. */
export type BlogPostWithRefs = BlogPost & {
  author: BlogAuthor | null;
  category: BlogCategory | null;
};

/** Fields the editor can set. Everything else is server-managed. */
export type BlogPostInput = Partial<
  Pick<
    BlogPost,
    | "slug"
    | "status"
    | "title"
    | "meta_title"
    | "meta_description"
    | "excerpt"
    | "body"
    | "faqs"
    | "key_takeaways"
    | "target_query"
    | "keywords"
    | "canonical_url"
    | "noindex"
    | "og_image_url"
    | "seo"
    | "cover_image_url"
    | "cover_image_alt"
    | "author_id"
    | "category_id"
    | "tags"
    | "internal_links"
    | "featured"
    | "scheduled_for"
    | "locale"
    | "source"
    | "source_metadata"
    | "ai_model"
    | "ai_generated"
  >
>;

const SELECT_WITH_REFS = "*, author:blog_authors(*), category:blog_categories(*)";

/** A joined to-one embed is normally an object, but normalize array shapes too. */
function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

function shapePost(row: Record<string, unknown>): BlogPostWithRefs {
  const { author, category, ...rest } = row as Record<string, unknown> & {
    author?: BlogAuthor | BlogAuthor[] | null;
    category?: BlogCategory | BlogCategory[] | null;
  };
  return {
    ...(rest as unknown as BlogPost),
    author: one<BlogAuthor>(author),
    category: one<BlogCategory>(category),
  };
}

// ---------------------------------------------------------------------------
// Public reads (published, non-deleted only)
// ---------------------------------------------------------------------------

/** Live posts for the public /blog listing, newest first. */
export async function getPublishedPosts(opts?: {
  limit?: number;
  categorySlug?: string;
  tag?: string;
}): Promise<BlogPostWithRefs[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  let query = supabase
    .from("blog_posts")
    .select(SELECT_WITH_REFS)
    .eq("status", "published")
    .is("deleted_at", null)
    .lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false });

  if (opts?.tag) query = query.contains("tags", [opts.tag]);
  if (opts?.limit) query = query.limit(opts.limit);

  const { data } = await query;
  let posts = ((data as Record<string, unknown>[] | null) ?? []).map(shapePost);
  // Category filter is applied here (the join column can't be filtered inline).
  if (opts?.categorySlug) posts = posts.filter((p) => p.category?.slug === opts.categorySlug);
  return posts;
}

/** A single live post by slug, for /blog/[slug]. Null when not public. */
export async function getPublishedPostBySlug(slug: string): Promise<BlogPostWithRefs | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data } = await supabase
    .from("blog_posts")
    .select(SELECT_WITH_REFS)
    .eq("slug", slug)
    .eq("status", "published")
    .is("deleted_at", null)
    .lte("published_at", new Date().toISOString())
    .maybeSingle();
  return data ? shapePost(data as Record<string, unknown>) : null;
}

/** Slugs of every live post, for the sitemap and static params. */
export async function getPublishedPostSlugs(): Promise<{ slug: string; updated_at: string }[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data } = await supabase
    .from("blog_posts")
    .select("slug,updated_at")
    .eq("status", "published")
    .is("deleted_at", null)
    .lte("published_at", new Date().toISOString());
  return (data as { slug: string; updated_at: string }[] | null) ?? [];
}

/** Related posts in the same category (fallback: latest others). */
export async function getRelatedPosts(post: BlogPostWithRefs, limit = 3): Promise<BlogPostWithRefs[]> {
  const all = await getPublishedPosts({ limit: 12 });
  const others = all.filter((p) => p.id !== post.id);
  const sameCat = post.category_id ? others.filter((p) => p.category_id === post.category_id) : [];
  return [...sameCat, ...others.filter((p) => !sameCat.includes(p))].slice(0, limit);
}

// ---------------------------------------------------------------------------
// Admin reads (any status, excludes soft-deleted by default)
// ---------------------------------------------------------------------------

export async function listPostsAdmin(includeDeleted = false): Promise<BlogPostWithRefs[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  let query = supabase.from("blog_posts").select(SELECT_WITH_REFS).order("updated_at", { ascending: false });
  if (!includeDeleted) query = query.is("deleted_at", null);
  const { data } = await query;
  return ((data as Record<string, unknown>[] | null) ?? []).map(shapePost);
}

export async function getPostByIdAdmin(id: string): Promise<BlogPostWithRefs | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data } = await supabase.from("blog_posts").select(SELECT_WITH_REFS).eq("id", id).maybeSingle();
  return data ? shapePost(data as Record<string, unknown>) : null;
}

export async function listAuthors(): Promise<BlogAuthor[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data } = await supabase.from("blog_authors").select("*").order("name", { ascending: true });
  return (data as BlogAuthor[] | null) ?? [];
}

export async function listCategories(): Promise<BlogCategory[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data } = await supabase.from("blog_categories").select("*").order("name", { ascending: true });
  return (data as BlogCategory[] | null) ?? [];
}

export async function createCategory(input: { name: string; slug?: string; description?: string }) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const slug = input.slug?.trim() || slugify(input.name);
  const { data, error } = await supabase
    .from("blog_categories")
    .insert({ name: input.name.trim(), slug, description: input.description ?? null })
    .select("*")
    .single();
  if (error) throw error;
  return data as BlogCategory;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function createPost(input: BlogPostInput, by?: string): Promise<BlogPost> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase not configured");

  const title = (input.title ?? "Untitled").trim();
  const slug = (input.slug?.trim() || slugify(title)) || `post-${Date.now()}`;

  const row = {
    ...input,
    title,
    slug,
    body: input.body ?? [],
    reading_time_minutes: input.body ? readingTime(input.body) : 0,
    created_by: by ?? null,
    updated_by: by ?? null,
  };

  const { data, error } = await supabase.from("blog_posts").insert(row).select("*").single();
  if (error) throw error;
  const post = data as BlogPost;
  await saveRevision(post.id, post, "Created", by);
  return post;
}

export async function updatePost(id: string, input: BlogPostInput, by?: string): Promise<BlogPost> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase not configured");

  const update: Record<string, unknown> = { ...input, updated_by: by ?? null };
  if (input.title) update.title = input.title.trim();
  if (input.slug) update.slug = input.slug.trim();
  if (input.body) update.reading_time_minutes = readingTime(input.body);

  const { data, error } = await supabase.from("blog_posts").update(update).eq("id", id).select("*").single();
  if (error) throw error;
  const post = data as BlogPost;
  await saveRevision(post.id, post, "Edited", by);
  return post;
}

/** Publish: set status + stamp published_at the first time it goes live. */
export async function publishPost(id: string, by?: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase not configured");
  const current = await getPostByIdAdmin(id);
  const update: Record<string, unknown> = { status: "published", updated_by: by ?? null };
  if (!current?.published_at) update.published_at = new Date().toISOString();
  const { error } = await supabase.from("blog_posts").update(update).eq("id", id);
  if (error) throw error;
}

export async function setStatus(id: string, status: BlogStatus, by?: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase not configured");
  const { error } = await supabase
    .from("blog_posts")
    .update({ status, updated_by: by ?? null })
    .eq("id", id);
  if (error) throw error;
}

/** Soft-delete: hidden everywhere but recoverable, keeps the audit trail. */
export async function softDeletePost(id: string, by?: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase not configured");
  const { error } = await supabase
    .from("blog_posts")
    .update({ deleted_at: new Date().toISOString(), status: "archived", updated_by: by ?? null })
    .eq("id", id);
  if (error) throw error;
}

/** Append an immutable snapshot to the revision history. Best-effort. */
export async function saveRevision(
  postId: string,
  snapshot: unknown,
  note?: string,
  by?: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const { data } = await supabase
    .from("blog_post_revisions")
    .select("version")
    .eq("post_id", postId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextVersion = ((data as { version: number } | null)?.version ?? 0) + 1;
  await supabase
    .from("blog_post_revisions")
    .insert({ post_id: postId, version: nextVersion, snapshot, note: note ?? null, created_by: by ?? null });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Rough reading time in minutes from the text across all blocks (200 wpm). */
export function readingTime(blocks: BlogBlock[]): number {
  const words = blocks.reduce((n, b) => n + blockText(b).split(/\s+/).filter(Boolean).length, 0);
  return Math.max(1, Math.round(words / 200));
}

function blockText(b: BlogBlock): string {
  switch (b.type) {
    case "heading":
    case "paragraph":
    case "callout":
      return b.text;
    case "answer":
      return `${b.question ?? ""} ${b.text}`;
    case "quote":
      return `${b.text} ${b.cite ?? ""}`;
    case "list":
      return b.items.join(" ");
    case "table":
      return [...b.headers, ...b.rows.flat()].join(" ");
    case "code":
      return b.code;
    case "cta":
      return `${b.heading} ${b.body ?? ""}`;
    default:
      return "";
  }
}
