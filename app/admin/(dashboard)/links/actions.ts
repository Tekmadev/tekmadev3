"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase";
import { normalizeSlug, isReservedSlug } from "@/lib/links-data";

/** UTM values: lowercase, no spaces, bounded. Empty -> null. */
function cleanUtm(raw: FormDataEntryValue | null): string | null {
  const v = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 128);
  return v || null;
}

/** Accept an internal path (/...) or a full http(s) URL. null = invalid. */
function normalizeDestination(raw: string): string | null {
  const v = raw.trim();
  if (!v) return "/";
  if (/^https?:\/\//i.test(v)) {
    try {
      new URL(v);
      return v.slice(0, 2048);
    } catch {
      return null;
    }
  }
  const path = v.startsWith("/") ? v : `/${v}`;
  if (/\s/.test(path)) return null;
  return path.slice(0, 2048);
}

export async function createLinkAction(formData: FormData) {
  await requireOwner();

  const supabase = getSupabaseAdmin();
  if (!supabase) redirect("/admin/links?e=config");

  const slug = normalizeSlug(String(formData.get("slug") || ""));
  if (!slug) redirect("/admin/links?e=slug");
  if (isReservedSlug(slug)) redirect("/admin/links?e=reserved");

  const destination = normalizeDestination(String(formData.get("destination") || "/"));
  if (destination === null) redirect("/admin/links?e=destination");

  const { error } = await supabase.from("links").insert({
    slug,
    destination,
    utm_source: cleanUtm(formData.get("utm_source")),
    utm_medium: cleanUtm(formData.get("utm_medium")),
    utm_campaign: cleanUtm(formData.get("utm_campaign")),
    label: String(formData.get("label") || "").trim() || null,
    active: true,
  });

  if (error) {
    if (/duplicate key|unique/i.test(error.message)) redirect("/admin/links?e=dupe");
    console.error("[links] insert failed", error.message);
    redirect("/admin/links?e=db");
  }

  revalidatePath("/admin/links");
  redirect(`/admin/links?ok=created&slug=${encodeURIComponent(slug)}`);
}

export async function toggleLinkAction(formData: FormData) {
  await requireOwner();

  const id = String(formData.get("id") || "").trim();
  const next = String(formData.get("active") || "") === "true";
  if (!id) redirect("/admin/links?e=input");

  const supabase = getSupabaseAdmin();
  if (!supabase) redirect("/admin/links?e=config");

  const { error } = await supabase.from("links").update({ active: next }).eq("id", id);
  if (error) {
    console.error("[links] toggle failed", error.message);
    redirect("/admin/links?e=db");
  }

  revalidatePath("/admin/links");
  redirect(`/admin/links?ok=${next ? "enabled" : "disabled"}`);
}

export async function deleteLinkAction(formData: FormData) {
  await requireOwner();

  const id = String(formData.get("id") || "").trim();
  if (!id) redirect("/admin/links?e=input");

  const supabase = getSupabaseAdmin();
  if (!supabase) redirect("/admin/links?e=config");

  const { error } = await supabase.from("links").delete().eq("id", id);
  if (error) {
    console.error("[links] delete failed", error.message);
    redirect("/admin/links?e=db");
  }

  revalidatePath("/admin/links");
  redirect("/admin/links?ok=deleted");
}
