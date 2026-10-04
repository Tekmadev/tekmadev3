import { defineMetaFragment } from "./types";

/**
 * The analytics slice of GET /meta: the keys of `metaFragment` in the app's
 * src/api/schemas/analytics.ts (see docs/api-requests/analytics.md). Empty on
 * purpose: the range chip labels are app copy (brief 8.9) and the API sends
 * every chart label itself.
 */
export const metaFragment = defineMetaFragment(() => ({}));
