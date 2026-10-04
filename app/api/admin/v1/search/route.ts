import { route } from "@/lib/admin-api";
import { searchAdmin } from "@/lib/admin-api/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /search?q= : clients, leads, subscribers, posts, coupons and links,
 * best matches first, at most 20, filtered by role (lib/admin-api/search.ts).
 * Any staff. An empty or unmatched query is `{ results: [] }`, never a 400.
 */
export const GET = route({ method: "GET" }, async (ctx, { query }) => ({
  results: await searchAdmin(ctx, query.q ?? ""),
}));
