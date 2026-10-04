import { z } from "zod";
import { route } from "@/lib/admin-api";
import { requestBlogMediaFromApi } from "@/lib/admin-api/blog/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /blog/media { fileName, size, type } -> { bucket, path, token, publicUrl }:
 * a one-time signed upload slot in the public blog-media bucket (PNG, JPG,
 * WebP, AVIF or GIF, 10 MB at most). No Idempotency-Key: it creates no
 * record, and a retry simply gets a new slot.
 */
export const POST = route({ method: "POST", capability: "blog.write", body: z.unknown() }, async (_ctx, { body }) =>
  requestBlogMediaFromApi(body),
);
