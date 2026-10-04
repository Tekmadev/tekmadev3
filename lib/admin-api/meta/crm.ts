import { defineMetaFragment } from "./types";
import {
  CRM_APP_STATUS_OPTIONS,
  CRM_DIRECTION_OPTIONS,
  CRM_HEALTH_OPTIONS,
  CRM_JOB_OPTIONS,
  CRM_QUEUE_OPTIONS,
  CRM_RUN_BY_OPTIONS,
  CRM_RUN_STATUS_OPTIONS,
  CRM_SURFACE_OPTIONS,
} from "../crm/copy";

/**
 * The crm slice of GET /meta: the keys of `metaFragment` in the app's
 * src/api/schemas/crm.ts (see docs/api-requests/crm.md). Labels only, the same
 * for every role; it is always "the CRM", never a vendor name.
 */
export const metaFragment = defineMetaFragment(() => ({
  crmHealth: CRM_HEALTH_OPTIONS,
  crmAppStatuses: CRM_APP_STATUS_OPTIONS,
  crmSurfaces: CRM_SURFACE_OPTIONS,
  crmJobs: CRM_JOB_OPTIONS,
  crmRunBy: CRM_RUN_BY_OPTIONS,
  crmRunStatuses: CRM_RUN_STATUS_OPTIONS,
  crmDirections: CRM_DIRECTION_OPTIONS,
  crmQueues: CRM_QUEUE_OPTIONS,
}));
