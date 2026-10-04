import { z } from "zod";
import { requireDb, route } from "@/lib/admin-api";
import { deleteLinkFromApi, setLinkActiveFromApi } from "@/lib/admin-api/links/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH /links/:id { active } -> ShortLink. Disable (answers 404 at once) or Enable; nothing else changes. */
export const PATCH = route({ method: "PATCH", capability: "links.write", body: z.unknown() }, async (_ctx, { params, body }) =>
  setLinkActiveFromApi(requireDb(), params.id, body),
);

/** DELETE /links/:id -> null. Clicks stay on record, the counter is gone and the slug can be reused. */
export const DELETE = route({ method: "DELETE", capability: "links.write" }, async (_ctx, { params }) =>
  deleteLinkFromApi(requireDb(), params.id),
);
