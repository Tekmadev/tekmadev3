import { z } from "zod";
import { pageQuery, requireDb, route } from "@/lib/admin-api";
import { listPostPage } from "@/lib/admin-api/blog/data";
import { createPostFromApi } from "@/lib/admin-api/blog/posts";
import { BLOG_COPY, POST_STATUSES } from "@/lib/admin-api/blog/shape";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const listQuery = z.object({
  ...pageQuery,
  // One status chip; empty means "All". Anything else is 400 `status`.
  status: z.preprocess((v) => (v === "" ? undefined : v), z.enum(POST_STATUSES, { error: BLOG_COPY.status }).optional()),
  // Matches the title only.
  q: z.string().optional(),
});

/**
 * GET /blog/posts?status=&q=&cursor=&limit= -> Page<PostRow>: newest
 * `updatedAt` first, id breaking ties, trashed posts never listed.
 */
export const GET = route({ method: "GET", capability: "blog.view", query: listQuery }, async (_ctx, { query }) =>
  listPostPage(requireDb(), { status: query.status, q: query.q, cursor: query.cursor, limit: query.limit }),
);

/**
 * POST /blog/posts (Idempotency-Key) -> 201 PostDetail. Slugifies (a blank
 * slug comes from the title), records the first revision, refreshes the site.
 */
export const POST = route(
  { method: "POST", capability: "blog.write", body: z.unknown(), idempotent: true, status: 201 },
  async (ctx, { body }) => createPostFromApi(requireDb(), body, ctx.email),
);
