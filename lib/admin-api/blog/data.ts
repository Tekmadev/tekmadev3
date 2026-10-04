import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { slugify } from "@/lib/blog-data";
import { decodeCursor, keysetFilter, toPage, type Page } from "../cursor";
import { dbError, isUuid } from "../data";
import { notFound } from "../errors";
import {
  BLOG_COPY,
  POST_DETAIL_SELECT,
  POST_ROW_SELECT,
  storedStatusesFor,
  toApiAuthor,
  toPostDetail,
  toPostRow,
  type ApiAuthor,
  type ApiCategory,
  type ApiPostDetail,
  type ApiPostRow,
  type AuthorRow,
  type PostDetailRow,
  type PostListRow,
  type PostStatus,
} from "./shape";

/**
 * Reads behind the blog endpoints. Unlike the website's loaders in
 * lib/blog-data.ts (which fall back to empty lists for public pages), every
 * read here throws on a database error, so the app shows a real error state
 * instead of an empty blog.
 */

/* ------------------------------------------------------------------ */
/* Authors                                                             */
/* ------------------------------------------------------------------ */

const AUTHOR_SELECT = "id,name,avatar_url,role,active,created_at";

/** GET /blog/authors: every author, A to Z. */
export async function listApiAuthors(db: SupabaseClient): Promise<ApiAuthor[]> {
  const { data, error } = await db.from("blog_authors").select(AUTHOR_SELECT);
  if (error) throw dbError("blog authors", error);
  return ((data ?? []) as AuthorRow[])
    .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }))
    .map(toApiAuthor);
}

/**
 * The byline of a new post when none is picked: the first active author (the
 * founder, seeded with the blog), else the first author. Null when there are none.
 */
export async function defaultAuthor(db: SupabaseClient): Promise<ApiAuthor | null> {
  const { data, error } = await db.from("blog_authors").select(AUTHOR_SELECT).order("created_at", { ascending: true }).limit(20);
  if (error) throw dbError("blog default author", error);
  const rows = (data ?? []) as AuthorRow[];
  const row = rows.find((a) => a.active !== false) ?? rows[0];
  return row ? toApiAuthor(row) : null;
}

export async function authorExists(db: SupabaseClient, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const { data, error } = await db.from("blog_authors").select("id").eq("id", id).maybeSingle();
  if (error) throw dbError("blog author lookup", error);
  return Boolean(data);
}

/* ------------------------------------------------------------------ */
/* Posts                                                               */
/* ------------------------------------------------------------------ */

/** A LIKE pattern for "contains", with the user's %, _ and \ taken literally. */
function containsPattern(q: string): string {
  // PostgREST also reads "*" as a wildcard: match any one character there instead.
  const escaped = q.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/\*/g, "_");
  return `%${escaped}%`;
}

const postCursor = z.tuple([z.string(), z.string()]);

/** GET /blog/posts: newest change first (id breaks ties), trash excluded, `q` on the title only. */
export async function listPostPage(
  db: SupabaseClient,
  opts: { status?: PostStatus; q?: string; cursor?: string; limit: number },
): Promise<Page<ApiPostRow>> {
  const after = decodeCursor(opts.cursor, postCursor);
  let query = db
    .from("blog_posts")
    .select(POST_ROW_SELECT)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(opts.limit + 1);
  if (opts.status) query = query.in("status", storedStatusesFor(opts.status));
  const q = opts.q?.trim().slice(0, 200);
  if (q) query = query.ilike("title", containsPattern(q));
  if (after) query = query.or(keysetFilter(["updated_at", "id"], after, "desc"));
  const { data, error } = await query;
  if (error) throw dbError("blog posts list", error);
  const rows = (data ?? []) as unknown as PostListRow[];
  // Only look the default author up when a post has no byline.
  const fallback = rows.slice(0, opts.limit).some((r) => !r.author || (Array.isArray(r.author) && r.author.length === 0))
    ? await defaultAuthor(db)
    : null;
  return toPage(rows, opts.limit, (row) => [row.updated_at, row.id], (row) => toPostRow(row, fallback));
}

/** A post that is not in the trash, as stored, or null. */
export async function getLivePostRow(db: SupabaseClient, id: string): Promise<PostDetailRow | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await db.from("blog_posts").select(POST_DETAIL_SELECT).eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) throw dbError("blog post read", error);
  return (data as unknown as PostDetailRow | null) ?? null;
}

/** The live post or 404 "That post no longer exists.". */
export async function requireLivePostRow(db: SupabaseClient, id: string): Promise<PostDetailRow> {
  const row = await getLivePostRow(db, id);
  if (!row) throw notFound(BLOG_COPY.postMissing);
  return row;
}

/** GET /blog/posts/:id, and what every post mutation answers. */
export async function getPostDetail(db: SupabaseClient, id: string): Promise<ApiPostDetail> {
  const row = await requireLivePostRow(db, id);
  return detailOf(db, row);
}

export async function detailOf(db: SupabaseClient, row: PostDetailRow): Promise<ApiPostDetail> {
  const hasAuthor = Array.isArray(row.author) ? row.author.length > 0 : Boolean(row.author);
  return toPostDetail(row, hasAuthor ? null : await defaultAuthor(db));
}

/* ------------------------------------------------------------------ */
/* Slugs                                                               */
/* ------------------------------------------------------------------ */

/** The post using a slug, trashed posts included (their slugs stay taken). */
export async function postIdForSlug(db: SupabaseClient, slug: string): Promise<string | null> {
  const { data, error } = await db.from("blog_posts").select("id").eq("slug", slug).maybeSingle();
  if (error) throw dbError("blog slug lookup", error);
  return (data as { id: string } | null)?.id ?? null;
}

/**
 * A free slug from a base the server made itself: "my-post", then "my-post-2",
 * "my-post-3"... A slug `selfId` already holds counts as free.
 */
export async function uniquePostSlug(db: SupabaseClient, base: string, selfId?: string): Promise<string> {
  const root = base || "post";
  // Slugs are [a-z0-9-] only, so the LIKE pattern needs no escaping.
  const { data, error } = await db.from("blog_posts").select("id,slug").like("slug", `${root}%`);
  if (error) throw dbError("blog slug scan", error);
  const owners = new Map(((data ?? []) as { id: string; slug: string }[]).map((r) => [r.slug, r.id]));
  let candidate = root;
  for (let n = 2; ; n++) {
    const owner = owners.get(candidate);
    if (!owner || owner === selfId) return candidate;
    candidate = `${root}-${n}`;
  }
}

/**
 * The slug to store for a write. A typed slug is slugified and must be free
 * (409 `slug_taken`, the trash included); blank or null makes one from the
 * title, with -2, -3... when taken.
 */
export async function resolvePostSlug(
  db: SupabaseClient,
  request: string | null,
  title: string,
  selfId?: string,
): Promise<{ slug: string } | { taken: true }> {
  const typed = typeof request === "string" ? slugify(request) : "";
  if (typed) {
    const owner = await postIdForSlug(db, typed);
    if (owner && owner !== selfId) return { taken: true };
    return { slug: typed };
  }
  return { slug: await uniquePostSlug(db, slugify(title), selfId) };
}

/* ------------------------------------------------------------------ */
/* Categories                                                          */
/* ------------------------------------------------------------------ */

export type CategoryRow = { id: string; name: string; slug: string };

export async function listCategoryRows(db: SupabaseClient): Promise<CategoryRow[]> {
  const { data, error } = await db.from("blog_categories").select("id,name,slug");
  if (error) throw dbError("blog categories", error);
  return ((data ?? []) as CategoryRow[]).sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
}

export async function getCategoryRow(db: SupabaseClient, id: string): Promise<CategoryRow | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await db.from("blog_categories").select("id,name,slug").eq("id", id).maybeSingle();
  if (error) throw dbError("blog category read", error);
  return (data as CategoryRow | null) ?? null;
}

const COUNT_PAGE = 1000;

/** Posts per category, trash excluded (read in pages: PostgREST caps a response at 1000 rows). */
export async function postCountsByCategory(db: SupabaseClient, categoryId?: string): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (let from = 0; ; from += COUNT_PAGE) {
    let query = db
      .from("blog_posts")
      .select("id,category_id")
      .is("deleted_at", null)
      .not("category_id", "is", null)
      .order("id", { ascending: true })
      .range(from, from + COUNT_PAGE - 1);
    if (categoryId) query = query.eq("category_id", categoryId);
    const { data, error } = await query;
    if (error) throw dbError("blog category counts", error);
    const rows = (data ?? []) as { id: string; category_id: string }[];
    for (const row of rows) counts.set(row.category_id, (counts.get(row.category_id) ?? 0) + 1);
    if (rows.length < COUNT_PAGE) return counts;
  }
}

export function toApiCategory(row: CategoryRow, postCount: number): ApiCategory {
  return { id: row.id, name: row.name, slug: row.slug, postCount };
}

/** GET /blog/categories: A to Z (case-insensitive), each with its post count. */
export async function listApiCategories(db: SupabaseClient): Promise<ApiCategory[]> {
  const [rows, counts] = await Promise.all([listCategoryRows(db), postCountsByCategory(db)]);
  return rows.map((row) => toApiCategory(row, counts.get(row.id) ?? 0));
}

/** One category with its post count. */
export async function apiCategory(db: SupabaseClient, row: CategoryRow): Promise<ApiCategory> {
  const counts = await postCountsByCategory(db, row.id);
  return toApiCategory(row, counts.get(row.id) ?? 0);
}
