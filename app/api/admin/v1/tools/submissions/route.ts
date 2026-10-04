import { z } from "zod";
import { pageQuery, route } from "@/lib/admin-api";
import { listToolSubmissions } from "@/lib/admin-api/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /tools/submissions?cursor=&limit= -> Page<Submission>, newest first. */
export const GET = route(
  { method: "GET", capability: "tools.view", query: z.object({ ...pageQuery }) },
  async (_ctx, { query }) => listToolSubmissions(query.cursor, query.limit),
);
