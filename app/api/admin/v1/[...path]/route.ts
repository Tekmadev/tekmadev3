import { fail, MESSAGES } from "@/lib/admin-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Any path under /api/admin/v1 with no route answers the JSON envelope
 * (404 `not_found`) instead of the site's HTML 404 page. Real routes always
 * win over this catch-all.
 */
const notFound = async () => fail(404, "not_found", MESSAGES.notFound);

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
