import { route } from "@/lib/admin-api";
import { listTemplatesForApp } from "@/lib/admin-api/clients/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /onboarding-templates (owner) -> every checklist template, in stage then sort order. */
export const GET = route({ method: "GET", capability: "clients.templates" }, () => listTemplatesForApp());
