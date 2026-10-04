import { z } from "zod";
import { requireDb, route } from "@/lib/admin-api";
import { getPostDetail } from "@/lib/admin-api/blog/data";
import { trashPostFromApi, updatePostFromApi } from "@/lib/admin-api/blog/posts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /blog/posts/:id -> PostDetail (post, bodyMarkdown, faqs, keyTakeaways). 404 for a trashed post. */
export const GET = route({ method: "GET", capability: "blog.view" }, async (_ctx, { params }) => getPostDetail(requireDb(), params.id));

/** PATCH /blog/posts/:id -> PostDetail. Partial; null clears; records a revision. */
export const PATCH = route({ method: "PATCH", capability: "blog.write", body: z.unknown() }, async (ctx, { params, body }) =>
  updatePostFromApi(requireDb(), params.id, body, ctx.email),
);

/** DELETE /blog/posts/:id -> null: moved to the trash (its slug stays taken). */
export const DELETE = route({ method: "DELETE", capability: "blog.trash" }, async (ctx, { params }) =>
  trashPostFromApi(requireDb(), params.id, ctx.email),
);
