"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { requireAdminCapability } from "@/lib/admin";
import { LOADER_DEFAULTS, LOADER_LIMITS, normalizeLoader } from "@/config/loader";
import { LOADER_SETTINGS_TAG, setLoaderSettings } from "@/lib/site-settings";

/**
 * Saves the loader's look. Every page reads it through a cached lookup, so
 * the save expires that cache and revalidates every page: the next visit
 * anywhere on the site gets the new motion, with nothing deployed.
 */
export async function saveLoaderAction(formData: FormData) {
  const ctx = await requireAdminCapability("loader.write");
  const next =
    formData.get("reset") === "1"
      ? LOADER_DEFAULTS
      : normalizeLoader(Object.fromEntries(Object.keys(LOADER_LIMITS).map((k) => [k, formData.get(k)])));

  const ok = await setLoaderSettings(next, ctx.email);
  if (!ok) redirect("/admin/loader?e=db");

  updateTag(LOADER_SETTINGS_TAG);
  revalidatePath("/", "layout");
  redirect(`/admin/loader?ok=${formData.get("reset") === "1" ? "reset" : "saved"}`);
}
