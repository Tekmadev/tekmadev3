import type { ApiContext } from "../auth";

/**
 * GET /meta is the merge of one fragment per domain (lib/admin-api/meta/<domain>.ts).
 * A fragment returns that domain's top-level keys, exactly as the app's
 * src/api/schemas/<domain>.ts `metaFragment` describes them. Keys must be unique
 * across domains (meta/index.ts logs a clash). The caller is passed in, so a
 * fragment may leave out what a role must not see; most return the same
 * labels to everyone.
 */
export type MetaValues = Record<string, unknown>;

export type MetaFragment = (ctx: ApiContext) => MetaValues | Promise<MetaValues>;

/** Identity helper so a fragment file gets the type without spelling it out. */
export function defineMetaFragment(fragment: MetaFragment): MetaFragment {
  return fragment;
}
