import { z } from "zod";
import { requireDb, route } from "@/lib/admin-api";
import { createCategoryFromApi } from "@/lib/admin-api/blog/categories";
import { listApiCategories } from "@/lib/admin-api/blog/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /blog/categories -> { id, name, slug, postCount }[], A to Z. `postCount` excludes the trash. */
export const GET = route({ method: "GET", capability: "blog.view" }, async () => listApiCategories(requireDb()));

/** POST /blog/categories { name } (Idempotency-Key) -> 201 category. 409 `category_dup` for a name that exists. */
export const POST = route(
  { method: "POST", capability: "blog.write", body: z.unknown(), idempotent: true, status: 201 },
  async (_ctx, { body }) => createCategoryFromApi(requireDb(), body),
);
