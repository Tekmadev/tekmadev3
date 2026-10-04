"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdminCapability } from "@/lib/admin";
import { syncMetaInsights } from "@/lib/meta-ads";

/** "Refresh from Meta": the same pull the nightly job does, on demand (ads.refresh). */
export async function refreshMetaAdsAction(formData: FormData) {
  await requireAdminCapability("ads.refresh");
  const range = String(formData.get("range") || "");
  const result = await syncMetaInsights({ trigger: "manual" });
  revalidatePath("/admin/ads");
  const q = new URLSearchParams();
  if (range) q.set("range", range);
  q.set(result.ok ? "synced" : "e", result.ok ? String(result.rows) : "sync");
  redirect(`/admin/ads?${q}`);
}
