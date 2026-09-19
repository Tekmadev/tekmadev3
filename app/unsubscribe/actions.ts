"use server";

import { redirect } from "next/navigation";
import { business } from "@/config/site";
import { resubscribeByToken, setUnsubscribeReason, unsubscribeByToken } from "@/lib/subscribers-data";

// Every change here happens on a button press, never on opening the link. Mail
// scanners and link previews open every URL in an email, and an unsubscribe
// that fires on a GET would take people off the list who never clicked.

const page = (token: string, flag?: string) =>
  `/unsubscribe?t=${encodeURIComponent(token)}${flag ? `&${flag}=1` : ""}`;

export async function confirmUnsubscribeAction(formData: FormData) {
  const token = String(formData.get("t") || "").trim();
  const result = await unsubscribeByToken(token, "email_link");
  redirect(result === "ok" ? page(token) : `/unsubscribe?e=${result}`);
}

export async function resubscribeAction(formData: FormData) {
  const token = String(formData.get("t") || "").trim();
  const result = await resubscribeByToken(token, business.legalDates.lastUpdated);
  redirect(result === "ok" ? page(token, "back") : `/unsubscribe?e=${result}`);
}

/** Optional. A failure here is not worth an error screen: they are already unsubscribed. */
export async function unsubscribeReasonAction(formData: FormData) {
  const token = String(formData.get("t") || "").trim();
  await setUnsubscribeReason(token, String(formData.get("reason") || "").trim());
  redirect(page(token));
}
