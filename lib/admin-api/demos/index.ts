/**
 * Demo requests (docs/admin-api/demos.md): GET and POST /demos, GET and PATCH
 * /demos/:id, shared with the web admin's /admin/demos pages.
 */

export {
  DEMO_STATUSES,
  DEMO_STATUS_FILTERS,
  DEMO_STATUS_LABELS,
  DEMO_EVENT_TYPES,
  OPEN_STATUSES,
  CLOSED_STATUSES,
  MANAGE_MOVES,
  REQUESTER_MOVES,
  REQUESTER_EDITABLE,
  canFor,
  isOpen,
  isClosed,
  monthDay,
  toDemo,
} from "./shape";
export type { DemoStatus, DemoStatusFilter, DemoEventType, DemoBusiness, DemoEvent, DemoCan, DemoRequest, DemoActor, DemoRow } from "./shape";

export { DEMO_MESSAGES, DEMO_LIMITS, demoBody, parseDemoCreate, parseDemoPatch, demoIdempotencyKey, isDemoDate, isDemoUrl } from "./input";
export type { DemoBody, DemoCreateInput, DemoPatchInput } from "./input";

export { listDemos, getDemo, createDemo, updateDemo, demoTeam } from "./data";
export type { DemoListQuery, DemoCounts, DemoList } from "./data";

export { linkDemoRequestsToClient, demoSchemaMissing } from "./link";
