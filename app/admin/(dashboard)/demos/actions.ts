"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdminCapability } from "@/lib/admin";
import { ApiError, MESSAGES } from "@/lib/admin-api";
import { createDemo, demoIdempotencyKey, parseDemoCreate, parseDemoPatch, updateDemo } from "@/lib/admin-api/demos";
import { demoActorFor, demoCreateBodyFromForm, demoEditBodyFromForm, demoManageBodyFromForm } from "@/lib/demos-admin";

/**
 * Demo requests from the web admin, through the same code, rules and copy as
 * POST /demos and PATCH /demos/:id (lib/admin-api/demos, docs/admin-api/demos.md):
 * `demos.request` to ask for one; the person who asked edits, cancels and
 * marks it shown by the request's own rules; `demos.manage` builds it. The
 * shared code decides every permission past the page's own capability.
 */

export type DemoFormState = { ok: boolean; message: string; fields?: Record<string, string> } | null;

/** A refused write as form state: the API's message and field errors, never a database message. */
function problem(err: unknown): NonNullable<DemoFormState> {
  if (err instanceof ApiError) return { ok: false, message: err.message, fields: err.fields };
  console.error("[demos] web action failed", err instanceof Error ? err.message : String(err));
  return { ok: false, message: MESSAGES.unavailable };
}

const idOf = (formData: FormData) => String(formData.get("demo_id") ?? "").trim();

function refresh(id?: string) {
  revalidatePath("/admin/demos");
  if (id) revalidatePath(`/admin/demos/${id}`);
}

/**
 * The new request form. Opens the request on success. With "Already built?
 * Demo link" (demos.manage, else createDemo's 403) it is saved ready to show,
 * and the request page says so.
 */
export async function createDemoAction(_prev: DemoFormState, formData: FormData): Promise<DemoFormState> {
  const ctx = await requireAdminCapability("demos.request");
  let id: string;
  let ready: boolean;
  try {
    const body = demoCreateBodyFromForm(formData);
    const input = parseDemoCreate(body);
    const demo = await createDemo(demoActorFor(ctx), input, demoIdempotencyKey(body, null));
    id = demo.id;
    ready = demo.status === "ready";
  } catch (err) {
    return problem(err);
  }
  refresh(id);
  redirect(`/admin/demos/${id}?ok=${ready ? "built" : "created"}`);
}

/** Edit the details (business, wants, needed by). */
export async function editDemoAction(_prev: DemoFormState, formData: FormData): Promise<DemoFormState> {
  const ctx = await requireAdminCapability("demos.view");
  const id = idOf(formData);
  try {
    await updateDemo(demoActorFor(ctx), id, parseDemoPatch(demoEditBodyFromForm(formData)));
  } catch (err) {
    return problem(err);
  }
  refresh(id);
  return { ok: true, message: "Saved." };
}

/** The builder's form: link, builder, note, and the status of the button pressed. */
export async function manageDemoAction(_prev: DemoFormState, formData: FormData): Promise<DemoFormState> {
  const ctx = await requireAdminCapability("demos.manage");
  const id = idOf(formData);
  try {
    await updateDemo(demoActorFor(ctx), id, parseDemoPatch(demoManageBodyFromForm(formData)));
  } catch (err) {
    return problem(err);
  }
  refresh(id);
  const status = String(formData.get("status") ?? "");
  return { ok: true, message: STATUS_DONE[status] ?? "Saved." };
}

const STATUS_DONE: Record<string, string> = {
  building: "Marked as building.",
  ready: "Marked ready. The person who asked has been told.",
  shown: "Marked as shown.",
  cancelled: "Request cancelled.",
};

/** The requester's buttons: Mark as shown, Cancel request. */
export async function demoStatusAction(formData: FormData): Promise<void> {
  const ctx = await requireAdminCapability("demos.view");
  const id = idOf(formData);
  const status = String(formData.get("status") ?? "");
  let message: string | null = null;
  try {
    await updateDemo(demoActorFor(ctx), id, parseDemoPatch({ status }));
  } catch (err) {
    message = problem(err).message;
  }
  refresh(id);
  redirect(`/admin/demos/${id}?${message ? `e=${encodeURIComponent(message)}` : `ok=${encodeURIComponent(status)}`}`);
}
