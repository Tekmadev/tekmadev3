import { route } from "@/lib/admin-api";
import { addTaskToRun, findRun, jsonObject } from "@/lib/admin-api/clients/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /onboardings/:id/tasks { title, description?, stage?, owner?, kind?, required?, dueAt? }
 * -> 201 { task, run } (the run recomputed). Defaults: the run's derived
 * stage, owner Tekmadev, kind general, not required. 400 `title`; 409
 * `run_complete`. Honours Idempotency-Key.
 */
export const POST = route(
  { method: "POST", capability: "clients.tasks.create", body: jsonObject, idempotent: true, status: 201 },
  async (ctx, { params, body }) => {
    const found = await findRun(ctx, params.id);
    return addTaskToRun(ctx, found, body);
  },
);
