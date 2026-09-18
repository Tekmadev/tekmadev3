"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/admin";
import { testModeConfigured } from "@/lib/stripe-mode";
import { setTestModeSwitch } from "@/lib/test-mode";
import { getTestModeStatus, purgeTestData, setupTestCatalog } from "@/lib/test-mode-data";

const PAGE = "/admin/test-mode";

/** Test mode for this browser only, for two hours. Refused until the sandbox is fully set up. */
export async function switchTestModeAction(formData: FormData) {
  await requireOwner();
  const on = formData.get("on") === "1";
  if (on) {
    if (!testModeConfigured()) redirect(`${PAGE}?e=keys`);
    const status = await getTestModeStatus();
    if (!status.catalogReady) redirect(`${PAGE}?e=catalog`);
  }
  await setTestModeSwitch(on);
  redirect(`${PAGE}?ok=${on ? "on" : "off"}`);
}

export async function setupTestCatalogAction() {
  await requireOwner();
  if (!testModeConfigured()) redirect(`${PAGE}?e=keys`);
  const result = await setupTestCatalog();
  if (!result.ok) {
    console.error("[test mode] catalog setup failed", result.error);
    redirect(`${PAGE}?e=stripe&m=${encodeURIComponent(result.error.slice(0, 160))}`);
  }
  revalidatePath(PAGE);
  redirect(`${PAGE}?ok=catalog&n=${result.created.length}`);
}

export async function purgeTestDataAction(formData: FormData) {
  await requireOwner();
  if (formData.get("confirm") !== "on") redirect(`${PAGE}?e=confirm`);
  const r = await purgeTestData();
  revalidatePath(PAGE);
  revalidatePath("/admin/clients");
  redirect(`${PAGE}?ok=purged&c=${r.clients}&o=${r.orders}&s=${r.subscriptions}&l=${r.logins}`);
}
