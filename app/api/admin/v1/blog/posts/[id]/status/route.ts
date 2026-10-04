import { z } from "zod";
import { requireDb, route } from "@/lib/admin-api";
import { setPostStatusFromBody } from "@/lib/admin-api/blog/posts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /blog/posts/:id/status { status: "draft" | "in_review" | "published" | "archived" } -> PostDetail.
 * Unpublish, send to review, archive or publish. No revision is recorded.
 */
export const POST = route({ method: "POST", capability: "blog.write", body: z.unknown() }, async (ctx, { params, body }) =>
  setPostStatusFromBody(requireDb(), params.id, body, ctx.email),
);
