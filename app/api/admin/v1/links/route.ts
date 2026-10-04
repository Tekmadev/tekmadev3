import { z } from "zod";
import { requireDb, route } from "@/lib/admin-api";
import { createLinkFromApi, listApiLinks } from "@/lib/admin-api/links/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /links -> ShortLink[]: every link, newest first (not paged), with click counts and `shareUrl`. */
export const GET = route({ method: "GET", capability: "links.view" }, async () => listApiLinks(requireDb()));

/**
 * POST /links { slug, destination?, utmSource?, utmMedium?, utmCampaign?, label? }
 * (Idempotency-Key) -> 201 ShortLink. 400 `slug`, `reserved`, `destination`;
 * 409 `dupe`. Links cannot be edited afterwards.
 */
export const POST = route(
  { method: "POST", capability: "links.write", body: z.unknown(), idempotent: true, status: 201 },
  async (_ctx, { body }) => createLinkFromApi(requireDb(), body),
);
