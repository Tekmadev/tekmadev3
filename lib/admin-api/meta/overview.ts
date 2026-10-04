import { defineMetaFragment } from "./types";

/**
 * The overview slice of GET /meta: the keys of `metaFragment` in the app's
 * src/api/schemas/overview.ts. Home needs no enums of its own (its rows carry
 * the lead, subscription and analytics shapes, labelled by those domains), so
 * the fragment is empty on purpose.
 */
export const metaFragment = defineMetaFragment(() => ({}));
