import { requireDb, route } from "@/lib/admin-api";
import { listApiAuthors } from "@/lib/admin-api/blog/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /blog/authors -> { id, name, photoUrl, role }[], A to Z. */
export const GET = route({ method: "GET", capability: "blog.view" }, async () => listApiAuthors(requireDb()));
