import { defineMetaFragment } from "./types";

/**
 * The tools slice of GET /meta: the app's src/api/schemas/tools.ts
 * `metaFragment` is empty (docs/api-requests/tools.md section 4): every
 * submission row carries its own tool name.
 */
export const metaFragment = defineMetaFragment(() => ({}));
