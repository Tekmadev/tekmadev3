import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  createPost,
  publishPost,
  setStatus,
  softDeletePost,
  updatePost,
  type BlogPostInput,
} from "@/lib/blog-data";
import { markdownToBlocks } from "@/lib/blog-markdown";
import { revalidateBlogPost } from "@/lib/blog-revalidate";
import { dbError } from "../data";
import { ApiError, MESSAGES, badRequest, businessRule, conflict } from "../errors";
import {
  authorExists,
  defaultAuthor,
  detailOf,
  getCategoryRow,
  getLivePostRow,
  requireLivePostRow,
  resolvePostSlug,
} from "./data";
import { BLOG_COPY, POST_STATUSES, blocksOf, type ApiFaq, type ApiPostDetail, type PostStatus } from "./shape";

/**
 * Post writes for the admin API: POST /blog/posts, PATCH /blog/posts/:id,
 * POST /blog/posts/:id/publish, POST /blog/posts/:id/status and
 * DELETE /blog/posts/:id. The rules are docs/api-requests/blog.md in the app
 * repo; the writes themselves are the website's (lib/blog-data.ts createPost,
 * updatePost, publishPost, setStatus, softDeletePost), so a save from the app
 * records the same revision snapshot and stamps `published_at` the same way
 * as a save from the web admin.
 */

export const zPostStatus = z.enum(POST_STATUSES, { error: BLOG_COPY.status });

/** What a create or a PATCH asked for, validated. Absent keys are undefined; null clears. */
export type PostWrite = {
  title?: string;
  status?: PostStatus;
  authorId?: string;
  categoryId?: string | null;
  excerpt?: string | null;
  targetQuery?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  coverImageAlt?: string | null;
  canonicalUrl?: string | null;
  coverImageUrl?: string | null;
  socialImageUrl?: string | null;
  featured?: boolean;
  noindex?: boolean;
  keywords?: string[];
  tags?: string[];
  keyTakeaways?: string[];
  bodyMarkdown?: string;
  faqs?: ApiFaq[];
};

type Fields = Record<string, string>;
type Body = Record<string, unknown>;

const has = (body: Body, key: string) => Object.prototype.hasOwnProperty.call(body, key);

/** The JSON body as an object, or 400 `input`. */
export function bodyObject(raw: unknown): Body {
  const parsed = z.record(z.string(), z.unknown()).safeParse(raw);
  if (!parsed.success) throw badRequest("input", MESSAGES.invalid);
  return parsed.data;
}

const zText = z.string();
const zFlag = z.boolean();
const zTextList = z.array(z.string());

/** A full https URL with a dotted host (the rule the app checks too). */
const HTTPS_URL = /^https:\/\/[^\s/$.?#][^\s]*\.[^\s]+$/i;

/** Optional text: trimmed, blank becomes null, undefined when not sent. */
function optionalText(body: Body, key: string, fields: Fields): string | null | undefined {
  if (!has(body, key)) return undefined;
  if (body[key] === null) return null;
  const parsed = zText.safeParse(body[key]);
  if (!parsed.success) {
    fields[key] = "Must be text.";
    return undefined;
  }
  return parsed.data.trim() || null;
}

/** Keywords, tags, takeaways: trimmed, blanks and case-insensitive duplicates dropped. */
function textList(body: Body, key: string, fields: Fields): string[] | undefined {
  if (!has(body, key)) return undefined;
  if (body[key] === null) return [];
  const parsed = zTextList.safeParse(body[key]);
  if (!parsed.success) {
    fields[key] = "Must be a list of text.";
    return undefined;
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of parsed.data) {
    const item = raw.trim();
    const folded = item.toLowerCase();
    if (!item || seen.has(folded)) continue;
    seen.add(folded);
    out.push(item);
  }
  return out;
}

/**
 * Validates a create (`creating`) or a partial update. Problems are checked in
 * the order the app expects: title, status, author, category, links, FAQs
 * answer at once with their own code; a field of the wrong type is collected
 * and answered last as 400 `input` "Check the highlighted fields." with every
 * field. Slug uniqueness is checked by the caller (it needs the title).
 */
export async function readPostWrite(
  db: SupabaseClient,
  body: Body,
  creating: boolean,
): Promise<{ write: PostWrite; slugRequest: string | null | undefined }> {
  const fields: Fields = {};
  const write: PostWrite = {};

  if (creating || has(body, "title")) {
    const title = zText.safeParse(body.title);
    const trimmed = title.success ? title.data.trim() : "";
    if (!trimmed) throw badRequest("title", BLOG_COPY.title, { title: BLOG_COPY.title });
    write.title = trimmed;
  }

  let slugRequest: string | null | undefined;
  if (has(body, "slug")) {
    const slug = body.slug === null ? null : zText.safeParse(body.slug);
    if (slug === null) slugRequest = null;
    else if (slug.success) slugRequest = slug.data;
    else fields.slug = "Must be text.";
  }

  if (has(body, "status")) {
    const status = zPostStatus.safeParse(body.status);
    if (!status.success) throw badRequest("status", BLOG_COPY.status, { status: BLOG_COPY.status });
    write.status = status.data;
  }

  if (has(body, "authorId")) {
    const authorId = zText.safeParse(body.authorId);
    if (!authorId.success || !(await authorExists(db, authorId.data))) {
      throw badRequest("author", BLOG_COPY.author, { authorId: BLOG_COPY.author });
    }
    write.authorId = authorId.data;
  }

  if (has(body, "categoryId")) {
    const categoryId = body.categoryId;
    if (categoryId === null || categoryId === "") write.categoryId = null;
    else if (typeof categoryId === "string" && (await getCategoryRow(db, categoryId))) write.categoryId = categoryId;
    else throw badRequest("category", BLOG_COPY.category, { categoryId: BLOG_COPY.category });
  }

  for (const key of ["excerpt", "targetQuery", "metaTitle", "metaDescription", "coverImageAlt"] as const) {
    const value = optionalText(body, key, fields);
    if (value !== undefined) write[key] = value;
  }

  for (const key of ["canonicalUrl", "coverImageUrl", "socialImageUrl"] as const) {
    const value = optionalText(body, key, fields);
    if (value === undefined) continue;
    if (value !== null && !HTTPS_URL.test(value)) {
      throw key === "canonicalUrl"
        ? badRequest("canonical", BLOG_COPY.canonical, { canonicalUrl: BLOG_COPY.canonicalField })
        : badRequest("image_url", BLOG_COPY.imageUrl, { [key]: BLOG_COPY.imageUrl });
    }
    write[key] = value;
  }

  for (const key of ["featured", "noindex"] as const) {
    if (!has(body, key)) continue;
    const value = zFlag.safeParse(body[key]);
    if (value.success) write[key] = value.data;
    else fields[key] = "Must be true or false.";
  }

  for (const key of ["keywords", "tags", "keyTakeaways"] as const) {
    const list = textList(body, key, fields);
    if (list !== undefined) write[key] = list;
  }

  if (has(body, "bodyMarkdown")) {
    if (body.bodyMarkdown === null) write.bodyMarkdown = "";
    else {
      const markdown = zText.safeParse(body.bodyMarkdown);
      if (markdown.success) write.bodyMarkdown = markdown.data;
      else fields.bodyMarkdown = "Must be text.";
    }
  }

  if (has(body, "faqs")) {
    if (body.faqs === null) write.faqs = [];
    else if (!Array.isArray(body.faqs)) fields.faqs = "Must be a list of questions and answers.";
    else {
      const out: ApiFaq[] = [];
      for (const item of body.faqs as unknown[]) {
        const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
        const question = typeof row.question === "string" ? row.question.trim() : "";
        const answer = typeof row.answer === "string" ? row.answer.trim() : "";
        if (!question && !answer) continue;
        if (!question || !answer) throw badRequest("faqs", BLOG_COPY.faqs, { faqs: BLOG_COPY.faqs });
        out.push({ question, answer });
      }
      write.faqs = out;
    }
  }

  if (Object.keys(fields).length > 0) throw badRequest("input", MESSAGES.invalid, fields);
  return { write, slugRequest };
}

/** The website's column names for the fields a write sets (body as blocks, FAQs as { q, a }). */
function toInput(write: PostWrite): BlogPostInput {
  const input: BlogPostInput = {};
  if (write.title !== undefined) input.title = write.title;
  if (write.status !== undefined) input.status = write.status;
  if (write.authorId !== undefined) input.author_id = write.authorId;
  if (write.categoryId !== undefined) input.category_id = write.categoryId;
  if (write.excerpt !== undefined) input.excerpt = write.excerpt;
  if (write.targetQuery !== undefined) input.target_query = write.targetQuery;
  if (write.metaTitle !== undefined) input.meta_title = write.metaTitle;
  if (write.metaDescription !== undefined) input.meta_description = write.metaDescription;
  if (write.coverImageAlt !== undefined) input.cover_image_alt = write.coverImageAlt;
  if (write.canonicalUrl !== undefined) input.canonical_url = write.canonicalUrl;
  if (write.coverImageUrl !== undefined) input.cover_image_url = write.coverImageUrl;
  if (write.socialImageUrl !== undefined) input.og_image_url = write.socialImageUrl;
  if (write.featured !== undefined) input.featured = write.featured;
  if (write.noindex !== undefined) input.noindex = write.noindex;
  if (write.keywords !== undefined) input.keywords = write.keywords;
  if (write.tags !== undefined) input.tags = write.tags;
  if (write.keyTakeaways !== undefined) input.key_takeaways = write.keyTakeaways;
  if (write.bodyMarkdown !== undefined) input.body = markdownToBlocks(write.bodyMarkdown);
  if (write.faqs !== undefined) input.faqs = write.faqs.map((f) => ({ q: f.question, a: f.answer }));
  return input;
}

/** 422 `empty`: publishing needs some body text. */
function assertPublishable(bodyIsBlank: boolean): void {
  if (bodyIsBlank) throw businessRule("empty", BLOG_COPY.empty);
}

const slugTaken = () => conflict("slug_taken", BLOG_COPY.slugTaken, { slug: BLOG_COPY.slugTaken });

/** A failed website write: a slug race is the 409, anything else a logged 500. */
function writeFailure(what: string, err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  const e = err && typeof err === "object" ? (err as { code?: unknown; message?: unknown }) : {};
  if (e.code === "23505") return slugTaken();
  return dbError(what, { code: typeof e.code === "string" ? e.code : undefined, message: typeof e.message === "string" ? e.message : String(err) });
}

/** POST /blog/posts: 201 with the full post. New posts are drafts by the default author, written by hand. */
export async function createPostFromApi(db: SupabaseClient, raw: unknown, by: string): Promise<ApiPostDetail> {
  const { write, slugRequest } = await readPostWrite(db, bodyObject(raw), true);
  const title = write.title ?? "";
  const slug = await resolvePostSlug(db, slugRequest ?? null, title);
  if ("taken" in slug) throw slugTaken();

  const status = write.status ?? "draft";
  if (status === "published") assertPublishable(!(write.bodyMarkdown ?? "").trim());

  const input: BlogPostInput = { ...toInput(write), slug: slug.slug, status, source: "manual" };
  if (input.author_id === undefined) input.author_id = (await defaultAuthor(db))?.id || null;
  if (input.category_id === undefined) input.category_id = null;
  if (input.body === undefined) input.body = [];

  let id: string;
  try {
    const post = await createPost(input, by);
    id = post.id;
    // Same as the web editor: going live stamps published_at the first time.
    if (status === "published") await publishPost(id, by);
  } catch (err) {
    throw writeFailure("blog post create", err);
  }
  revalidateBlogPost(slug.slug);
  const row = await getLivePostRow(db, id);
  if (!row) throw dbError("blog post re-read", { message: "created post not found" });
  return detailOf(db, row);
}

/**
 * PATCH /blog/posts/:id: only the keys sent change, null clears. The slug only
 * changes when `slug` is sent (a new title keeps old links working). Status
 * follows the POST /status rules. Records a revision.
 */
export async function updatePostFromApi(db: SupabaseClient, id: string, raw: unknown, by: string): Promise<ApiPostDetail> {
  const current = await requireLivePostRow(db, id);
  const { write, slugRequest } = await readPostWrite(db, bodyObject(raw), false);

  let slug = current.slug;
  if (slugRequest !== undefined) {
    const resolved = await resolvePostSlug(db, slugRequest, write.title ?? current.title, current.id);
    if ("taken" in resolved) throw slugTaken();
    slug = resolved.slug;
  }

  if (write.status === "published") {
    const blank = write.bodyMarkdown !== undefined ? !write.bodyMarkdown.trim() : blocksOf(current.body).length === 0;
    assertPublishable(blank);
  }

  const input = toInput(write);
  if (slug !== current.slug) input.slug = slug;
  try {
    await updatePost(current.id, input, by);
    if (write.status === "published") await publishPost(current.id, by);
  } catch (err) {
    throw writeFailure("blog post update", err);
  }
  revalidateBlogPost(current.slug, slug);
  const row = await requireLivePostRow(db, current.id);
  return detailOf(db, row);
}

/**
 * POST /blog/posts/:id/publish and POST /blog/posts/:id/status. No revision.
 * Publishing an empty body is 422 `empty`. `published_at` is stamped the first
 * time a post goes live and kept after (the website's rule).
 */
export async function setPostStatusFromApi(db: SupabaseClient, id: string, status: PostStatus, by: string): Promise<ApiPostDetail> {
  const current = await requireLivePostRow(db, id);
  try {
    if (status === "published") {
      assertPublishable(blocksOf(current.body).length === 0);
      await publishPost(current.id, by);
    } else {
      await setStatus(current.id, status, by);
    }
  } catch (err) {
    throw writeFailure("blog post status", err);
  }
  revalidateBlogPost(current.slug);
  const row = await requireLivePostRow(db, current.id);
  return detailOf(db, row);
}

/** POST /blog/posts/:id/status body: 404 is checked before the status itself. */
export async function setPostStatusFromBody(db: SupabaseClient, id: string, raw: unknown, by: string): Promise<ApiPostDetail> {
  await requireLivePostRow(db, id);
  const body = bodyObject(raw);
  const status = zPostStatus.safeParse(body.status);
  if (!status.success) throw badRequest("status", BLOG_COPY.status, { status: BLOG_COPY.status });
  return setPostStatusFromApi(db, id, status.data, by);
}

/** DELETE /blog/posts/:id: to the trash. Its slug stays taken. */
export async function trashPostFromApi(db: SupabaseClient, id: string, by: string): Promise<null> {
  const current = await requireLivePostRow(db, id);
  try {
    await softDeletePost(current.id, by);
  } catch (err) {
    throw writeFailure("blog post trash", err);
  }
  revalidateBlogPost(current.slug);
  return null;
}
