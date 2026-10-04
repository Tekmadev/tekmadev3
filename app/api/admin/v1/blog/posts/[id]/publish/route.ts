import { requireDb, route } from "@/lib/admin-api";
import { setPostStatusFromApi } from "@/lib/admin-api/blog/posts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /blog/posts/:id/publish -> PostDetail: live on tekmadev.com. 422 `empty` when there is no body. */
export const POST = route({ method: "POST", capability: "blog.write" }, async (ctx, { params }) =>
  setPostStatusFromApi(requireDb(), params.id, "published", ctx.email),
);
