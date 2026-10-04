import { ok, route } from "@/lib/admin-api";
import { deleteTemplateFromApp, jsonObject, saveTemplateFromApp } from "@/lib/admin-api/clients/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PUT /onboarding-templates/:key (owner) -> the OnboardingTemplate, 201 when
 * the key is new. A new key needs title, stage, owner and kind; an existing
 * key keeps whatever is not sent. `payload` may be the JSON editor's raw text
 * (400 `json` when it does not parse). 400 `key`, `title`. Changes apply to
 * new runs only.
 */
export const PUT = route({ method: "PUT", capability: "clients.templates", body: jsonObject }, async (_ctx, { params, body }) => {
  const { template, created } = await saveTemplateFromApp(params.key ?? "", body);
  return ok(template, created ? 201 : 200);
});

/** DELETE /onboarding-templates/:key (owner) -> { key, deleted: true }. Runs already made keep their tasks. */
export const DELETE = route({ method: "DELETE", capability: "clients.templates" }, async (_ctx, { params }) =>
  deleteTemplateFromApp(params.key ?? ""),
);
