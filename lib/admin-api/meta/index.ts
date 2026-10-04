import type { AdminRole } from "@/lib/admin";
import type { ApiContext } from "../auth";
import { ApiError, MESSAGES } from "../errors";
import type { MetaFragment, MetaValues } from "./types";
import { metaFragment as overview } from "./overview";
import { metaFragment as notifications } from "./notifications";
import { metaFragment as clients } from "./clients";
import { metaFragment as leads } from "./leads";
import { metaFragment as tools } from "./tools";
import { metaFragment as billing } from "./billing";
import { metaFragment as analytics } from "./analytics";
import { metaFragment as ads } from "./ads";
import { metaFragment as blog } from "./blog";
import { metaFragment as email } from "./email";
import { metaFragment as links } from "./links";
import { metaFragment as crm } from "./crm";
import { metaFragment as pricing } from "./pricing";
import { metaFragment as coupons } from "./coupons";
import { metaFragment as settings } from "./settings";
import { metaFragment as testMode } from "./testMode";
import { metaFragment as team } from "./team";

export type { MetaFragment, MetaValues } from "./types";
export { defineMetaFragment } from "./types";

/** Same order as the app's src/api/schemas/meta.ts. */
const FRAGMENTS: Record<string, MetaFragment> = {
  overview,
  notifications,
  clients,
  leads,
  tools,
  billing,
  analytics,
  ads,
  blog,
  email,
  links,
  crm,
  pricing,
  coupons,
  settings,
  testMode,
  team,
};

/**
 * Every domain's fragment, merged. A fragment that throws fails the whole
 * response (500): the app caches meta, and a half meta would hide labels.
 */
export async function buildMeta(ctx: ApiContext): Promise<MetaValues> {
  const parts = await Promise.all(
    Object.entries(FRAGMENTS).map(async ([domain, fragment]) => {
      try {
        return [domain, await fragment(ctx)] as const;
      } catch (err) {
        console.error(`[admin-api] meta fragment "${domain}" failed`, err);
        throw new ApiError(500, "unavailable", MESSAGES.unavailable);
      }
    }),
  );
  const merged: MetaValues = {};
  const owner: Record<string, string> = {};
  for (const [domain, values] of parts) {
    for (const [key, value] of Object.entries(values)) {
      if (key in merged) console.error(`[admin-api] meta key "${key}" is sent by both ${owner[key]} and ${domain}; ${domain} wins`);
      merged[key] = value;
      owner[key] = domain;
    }
  }
  return merged;
}

/* ------------------------------------------------------------------ */
/* Labels for other endpoints (search subtitles)                       */
/* ------------------------------------------------------------------ */

const LABEL_CACHE_MS = 5 * 60_000;
const labelCache = new Map<AdminRole, { at: number; meta: MetaValues }>();

/**
 * Meta for reading labels inside other endpoints, cached five minutes per
 * role. Never fails: an error gives {} and callers fall back to their own copy.
 */
export async function metaForLabels(ctx: ApiContext): Promise<MetaValues> {
  const hit = labelCache.get(ctx.role);
  if (hit && Date.now() - hit.at < LABEL_CACHE_MS) return hit.meta;
  try {
    const meta = await buildMeta(ctx);
    labelCache.set(ctx.role, { at: Date.now(), meta });
    return meta;
  } catch {
    return hit?.meta ?? {};
  }
}

/**
 * The label for a value in a meta option list (`[{ value, label }]`), or the
 * fallback. `key` is the meta key ("leadStatuses").
 */
export function metaLabel(meta: MetaValues, key: string, value: string | null | undefined, fallback?: string | null): string | null {
  if (value === null || value === undefined || value === "") return fallback ?? null;
  const list = meta[key];
  if (Array.isArray(list)) {
    for (const option of list) {
      if (option && typeof option === "object") {
        const o = option as { value?: unknown; key?: unknown; label?: unknown };
        if ((o.value === value || o.key === value) && typeof o.label === "string") return o.label;
      }
    }
  }
  return fallback ?? humanize(value);
}

/** "in_review" -> "In review", "portal_signup" -> "Portal signup". */
export function humanize(value: string): string {
  const s = value.replace(/[_-]+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : value;
}
