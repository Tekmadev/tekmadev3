import { clientsMeta } from "../clients/core/labels";
import { defineMetaFragment } from "./types";

/**
 * The clients slice of GET /meta: exactly the keys of `metaFragment` in the
 * app's src/api/schemas/clients.ts (docs/api-requests/clients.md section 3).
 * The lists live in lib/admin-api/clients/core/labels.ts so the routes use the
 * same labels. Same for every role. Owned by the clients domain: the client
 * sections report their additions there.
 */
export const metaFragment = defineMetaFragment(() => clientsMeta());
