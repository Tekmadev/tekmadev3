import { z } from "zod";
import { pageQuery, requireDb, route } from "@/lib/admin-api";
import { listClickPage } from "@/lib/admin-api/links/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const query = z.object({
  ...pageQuery,
  // One link's history; without it, every link.
  linkId: z.string().optional(),
});

/**
 * GET /links/clicks?linkId=&cursor=&limit= -> Page<LinkClick>, newest first.
 * A deleted link's history still answers; an id that never existed is 404.
 */
export const GET = route({ method: "GET", capability: "links.view", query }, async (_ctx, { query }) =>
  listClickPage(requireDb(), { linkId: query.linkId, cursor: query.cursor, limit: query.limit }),
);
