/**
 * The clients domain core: vocabulary and its database mapping, date rules,
 * body checks, the account, onboarding, intake, template and billing shapes,
 * loaders, the list and its attention rules, the writes, and the meta labels.
 * Used by the routes under app/api/admin/v1 for clients, onboardings, tasks,
 * intakes and onboarding-templates. The client sections (access, files,
 * approvals, agreements, calls and the guarantee, CRM, people, activity) live
 * in lib/admin-api/clients/sections.
 *
 *   import { findClient, loadBundle, loadClientRows } from "@/lib/admin-api/clients/core";
 */

export * from "./enums";
export * from "./dates";
export * from "./validate";
export * from "./serialize";
export * from "./load";
export * from "./list";
export * from "./labels";
export * from "./writes";
