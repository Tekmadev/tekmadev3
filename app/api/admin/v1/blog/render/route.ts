import { z } from "zod";
import { badRequest, route } from "@/lib/admin-api";
import { renderMarkdown } from "@/lib/admin-api/blog/render";
import { BLOG_COPY } from "@/lib/admin-api/blog/shape";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({ markdown: z.string() });

/**
 * POST /blog/render { markdown } -> { blocks, readingTimeMinutes }: the
 * Preview's blocks, from the same converter a save stores. Nothing is saved.
 */
export const POST = route({ method: "POST", capability: "blog.view", body: z.unknown() }, async (_ctx, input) => {
  const parsed = body.safeParse(input.body);
  if (!parsed.success) throw badRequest("markdown", BLOG_COPY.markdown, { markdown: BLOG_COPY.markdown });
  return renderMarkdown(parsed.data.markdown);
});
