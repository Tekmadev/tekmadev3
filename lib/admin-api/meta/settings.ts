import { defineMetaFragment } from "./types";

/**
 * The settings slice of GET /meta (the app's src/api/schemas/settings.ts
 * `metaFragment`): empty on purpose. The loader's ranges and defaults are the
 * brief's section 5, kept in the app (src/loader/settings.ts) and on the site
 * (config/loader.ts).
 */
export const metaFragment = defineMetaFragment(() => ({}));
