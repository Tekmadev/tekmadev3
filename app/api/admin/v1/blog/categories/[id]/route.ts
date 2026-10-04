import { z } from "zod";
import { requireDb, route } from "@/lib/admin-api";
import { deleteCategoryFromApi, renameCategoryFromApi } from "@/lib/admin-api/blog/categories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH /blog/categories/:id { name } -> the category. The slug never changes. */
export const PATCH = route({ method: "PATCH", capability: "blog.write", body: z.unknown() }, async (_ctx, { params, body }) =>
  renameCategoryFromApi(requireDb(), params.id, body),
);

/** DELETE /blog/categories/:id -> null. Its posts keep everything but lose the category. */
export const DELETE = route({ method: "DELETE", capability: "blog.write" }, async (_ctx, { params }) =>
  deleteCategoryFromApi(requireDb(), params.id),
);
