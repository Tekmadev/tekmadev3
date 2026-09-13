"use server";

import { redirect } from "next/navigation";
import { unsubscribeByToken } from "@/lib/subscribers-data";

export async function confirmUnsubscribeAction(formData: FormData) {
  const token = String(formData.get("t") || "").trim();
  const result = await unsubscribeByToken(token);
  if (result === "ok") {
    redirect(`/unsubscribe?t=${encodeURIComponent(token)}&done=1`);
  }
  redirect(`/unsubscribe?e=${result}`);
}
