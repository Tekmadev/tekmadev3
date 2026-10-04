import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LOADER_DEFAULTS, LOADER_LIMITS, normalizeLoader, type LoaderSettings } from "@/config/loader";
import { LOADER_SETTINGS_TAG, setLoaderSettings } from "@/lib/site-settings";
import { ApiError, badRequest, validationError } from "../errors";
import { dbError } from "../data";

/**
 * The loader settings for the admin API (GET and PUT /settings/loader). They
 * are the website's own: stored in `site_settings` under `loader`, read by
 * every page and by GET /me, tuned in Admin, Loader. Ranges and defaults are
 * config/loader.ts (the brief's section 5).
 */

const KEYS = Object.keys(LOADER_LIMITS) as (keyof LoaderSettings)[];

/** Slider precision: whole milliseconds; two decimals for the pulls and the fade. */
const DECIMALS: Record<keyof LoaderSettings, number> = {
  beatMs: 0,
  buttonBeatMs: 0,
  innerPull: 2,
  outerPull: 2,
  innerFade: 2,
  showAfterMs: 0,
};

function atPrecision(settings: LoaderSettings): LoaderSettings {
  const out = { ...settings };
  for (const key of KEYS) {
    const factor = 10 ** DECIMALS[key];
    out[key] = Math.round(settings[key] * factor) / factor;
  }
  return out;
}

/** Clamped to the ranges, at slider precision (rounding can not leave the range: the bounds are round numbers). */
const tidy = (raw: unknown): LoaderSettings => atPrecision(normalizeLoader(raw));

export const SAVE_FAILED = "Could not save. Nothing changed on the site. Try again.";

/** GET /settings/loader: read fresh (not the cached copy pages use), so the screen shows what is stored. */
export async function readLoader(db: SupabaseClient): Promise<LoaderSettings> {
  const { data, error } = await db.from("site_settings").select("value").eq("key", "loader").maybeSingle();
  if (error) throw dbError("loader settings", error);
  return tidy(data?.value);
}

const LOADER_MESSAGE = "Send all six loader settings as numbers.";

/** Any finite number: out-of-range values are clamped on save, never refused. */
const loaderNumber = z.number({ error: "Send a number." });

const loaderBody = z.object({
  beatMs: loaderNumber,
  buttonBeatMs: loaderNumber,
  innerPull: loaderNumber,
  outerPull: loaderNumber,
  innerFade: loaderNumber,
  showAfterMs: loaderNumber,
});

const resetBody = z.object({ reset: z.literal(true) });

/**
 * `{ reset: true }`, or all six values as numbers (PUT replaces the whole
 * object). Otherwise 400 `loader` naming each missing or bad key.
 */
export function parseLoaderBody(raw: unknown): LoaderSettings | "reset" {
  const body = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  if (resetBody.safeParse(body).success) return "reset";
  const parsed = loaderBody.safeParse(body);
  if (!parsed.success) throw badRequest("loader", LOADER_MESSAGE, validationError(parsed.error).fields);
  return parsed.data;
}

/**
 * PUT /settings/loader: clamps to the ranges (never refuses a number), saves,
 * and expires the cached copy every page and GET /me read, so the next visit
 * anywhere gets the new motion. Returns what was saved.
 */
export async function saveLoader(input: LoaderSettings | "reset", by: string): Promise<LoaderSettings> {
  const next = input === "reset" ? { ...LOADER_DEFAULTS } : tidy(input);
  const saved = await setLoaderSettings(next, by);
  if (!saved) throw new ApiError(500, "db", SAVE_FAILED);
  // Route handlers can not call updateTag (server actions only): expire at once instead.
  revalidateTag(LOADER_SETTINGS_TAG, { expire: 0 });
  revalidatePath("/", "layout");
  return next;
}
