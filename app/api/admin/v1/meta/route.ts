import { createHash } from "node:crypto";
import { ok, route } from "@/lib/admin-api";
import { buildMeta } from "@/lib/admin-api/meta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /meta: every enum and label the app needs, merged from one fragment per
 * domain (lib/admin-api/meta/<domain>.ts). Any staff. Answers with an ETag;
 * a matching If-None-Match gets 304 with no body.
 */
export const GET = route({ method: "GET" }, async (ctx, { req }) => {
  const meta = await buildMeta(ctx);
  const etag = `"${createHash("sha256").update(JSON.stringify(meta)).digest("base64url").slice(0, 27)}"`;
  const sent = (req.headers.get("if-none-match") ?? "")
    .split(",")
    .map((t) => t.trim().replace(/^W\//, ""))
    .filter(Boolean);
  if (sent.includes(etag) || sent.includes("*")) {
    return new Response(null, { status: 304, headers: { etag, "cache-control": "no-store" } });
  }
  return ok(meta, 200, { etag });
});
