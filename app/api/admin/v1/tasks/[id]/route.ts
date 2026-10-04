import { route } from "@/lib/admin-api";
import { findTask, jsonObject, setTaskStatusFromApp } from "@/lib/admin-api/clients/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /tasks/:id { status } -> { task, run } with the run recomputed. Closing
 * (done or skipped) stamps who and when; reopening clears them. 400 `status`;
 * 409 `run_complete`.
 */
export const PATCH = route({ method: "PATCH", capability: "clients.tasks.status", body: jsonObject }, async (ctx, { params, body }) => {
  const found = await findTask(ctx, params.id);
  return setTaskStatusFromApp(ctx, found, body);
});
