import type { Capability } from "../permissions";
import { instant } from "../data";

/**
 * The `DemoRequest` the admin app and the web admin read (docs/admin-api/demos.md),
 * built from a `public.demo_requests` row (migration 20261005000100).
 *
 *   requested -> building -> ready -> shown      (ready -> building: rework)
 *   requested | building | ready -> cancelled    (shown and cancelled are closed)
 */

export const DEMO_STATUSES = ["requested", "building", "ready", "shown", "cancelled"] as const;
export type DemoStatus = (typeof DEMO_STATUSES)[number];

/** What `?status=open` (the default) lists. */
export const OPEN_STATUSES: readonly DemoStatus[] = ["requested", "building", "ready"];
/** Closed: nothing changes any more. */
export const CLOSED_STATUSES: readonly DemoStatus[] = ["shown", "cancelled"];

/** The status filters of GET /demos. */
export const DEMO_STATUS_FILTERS = ["open", ...DEMO_STATUSES, "all"] as const;
export type DemoStatusFilter = (typeof DEMO_STATUS_FILTERS)[number];

/** The app's copy for each status ("Request a demo" flow, contract v1). */
export const DEMO_STATUS_LABELS: Record<DemoStatus, string> = {
  requested: "Demo requested",
  building: "Building",
  ready: "Ready to show",
  shown: "Shown",
  cancelled: "Cancelled",
};

export const DEMO_EVENT_TYPES = ["created", "edited", "status", "builder", "link"] as const;
export type DemoEventType = (typeof DEMO_EVENT_TYPES)[number];

export const isOpen = (status: DemoStatus) => OPEN_STATUSES.includes(status);
export const isClosed = (status: DemoStatus) => CLOSED_STATUSES.includes(status);

/**
 * Where `demos.manage` may move a request (owners and managers). The contract's
 * chain requested -> building -> ready -> shown, ready -> building for rework,
 * and cancelled from any open status. A request may also go straight from
 * requested to ready when the demo was built in one go (it still needs its
 * link). Anything else is 422 `status_change`.
 */
export const MANAGE_MOVES: Record<DemoStatus, readonly DemoStatus[]> = {
  requested: ["building", "ready", "cancelled"],
  building: ["ready", "cancelled"],
  ready: ["building", "shown", "cancelled"],
  shown: [],
  cancelled: [],
};

/** Where the person who asked may move their own request with `demos.request` alone. */
export const REQUESTER_MOVES: Record<DemoStatus, readonly DemoStatus[]> = {
  requested: ["cancelled"],
  building: ["cancelled"],
  ready: ["shown"],
  shown: [],
  cancelled: [],
};

/** Statuses in which the person who asked may still edit the details (business, wants, neededBy). */
export const REQUESTER_EDITABLE: readonly DemoStatus[] = ["requested", "building"];

export type DemoBusiness = {
  name: string;
  type: string;
  area: string;
  offer: string;
  website: string | null;
  brand: string | null;
  customers: string | null;
};

export type DemoEvent = {
  at: string;
  by: string;
  byName: string | null;
  type: DemoEventType;
  from: string | null;
  to: string | null;
};

export type DemoCan = { edit: boolean; cancel: boolean; markShown: boolean; manage: boolean };

export type DemoRequest = {
  id: string;
  status: DemoStatus;
  clientId: string | null;
  clientName: string | null;
  leadId: string | null;
  leadName: string | null;
  business: DemoBusiness;
  wants: string | null;
  /** YYYY-MM-DD, a Toronto calendar date. */
  neededBy: string | null;
  demoUrl: string | null;
  builderEmail: string | null;
  builderNote: string | null;
  requestedBy: string;
  requestedByName: string | null;
  createdAt: string;
  updatedAt: string;
  readyAt: string | null;
  shownAt: string | null;
  cancelledAt: string | null;
  /** GET /demos/:id, POST and PATCH: oldest first. List rows send []. */
  events: DemoEvent[];
  can: DemoCan;
};

export type DemoRow = {
  id: string;
  status: string;
  client_id: string | null;
  lead_id: string | null;
  business_name: string;
  business_type: string;
  area: string;
  offer: string;
  website: string | null;
  brand: string | null;
  customers: string | null;
  wants: string | null;
  needed_by: string | null;
  demo_url: string | null;
  builder_email: string | null;
  builder_note: string | null;
  requested_by: string;
  is_test: boolean | null;
  request_hash: string | null;
  created_at: string;
  updated_at: string;
  ready_at: string | null;
  shown_at: string | null;
  cancelled_at: string | null;
};

export const DEMO_COLUMNS =
  "id,status,client_id,lead_id,business_name,business_type,area,offer,website,brand,customers,wants,needed_by,demo_url,builder_email,builder_note,requested_by,is_test,request_hash,created_at,updated_at,ready_at,shown_at,cancelled_at";

export type DemoEventRow = {
  id: number | string;
  demo_id: string;
  type: string;
  by_email: string;
  from_value: string | null;
  to_value: string | null;
  created_at: string;
};

export const DEMO_EVENT_COLUMNS = "id,demo_id,type,by_email,from_value,to_value,created_at";

/** Who is asking: an admin API caller (ApiContext) or a web admin session (demoActorFor). */
export type DemoActor = {
  /** Supabase auth user id (idempotency keys are per person). */
  userId: string;
  /** Lowercased email. */
  email: string;
  name: string | null;
  can(capability: Capability): boolean;
};

export function toDemoStatus(value: string | null | undefined): DemoStatus {
  return (DEMO_STATUSES as readonly string[]).includes(value ?? "") ? (value as DemoStatus) : "requested";
}

const lower = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

/** Whether the caller asked for this request. */
export function isRequester(actor: Pick<DemoActor, "email">, row: Pick<DemoRow, "requested_by">): boolean {
  return lower(row.requested_by) !== "" && lower(row.requested_by) === lower(actor.email);
}

/**
 * What the caller may do now (the server decides, the app only renders):
 *   manage     demos.manage on an open request
 *   edit       manage, or your own request while requested or building
 *   cancel     the same as edit
 *   markShown  a ready request, with manage or your own
 */
export function canFor(actor: Pick<DemoActor, "email" | "can">, row: Pick<DemoRow, "status" | "requested_by">): DemoCan {
  const status = toDemoStatus(row.status);
  const open = isOpen(status);
  const manages = actor.can("demos.manage");
  const own = actor.can("demos.request") && isRequester(actor, row);
  const ownEditable = own && REQUESTER_EDITABLE.includes(status);
  return {
    edit: open && (manages || ownEditable),
    cancel: open && (manages || ownEditable),
    markShown: status === "ready" && (manages || own),
    manage: open && manages,
  };
}

const nullIfBlank = (v: string | null | undefined) => (v && v.trim() ? v : null);

export type DemoLinks = {
  clients: Map<string, string | null>;
  leads: Map<string, string | null>;
  names: Map<string, string | null>;
};

export function toEvent(row: DemoEventRow, names: Map<string, string | null>): DemoEvent {
  const by = lower(row.by_email);
  return {
    at: instant(row.created_at),
    by,
    byName: names.get(by) ?? null,
    type: (DEMO_EVENT_TYPES as readonly string[]).includes(row.type) ? (row.type as DemoEventType) : "edited",
    from: row.from_value ?? null,
    to: row.to_value ?? null,
  };
}

export function toDemo(row: DemoRow, actor: Pick<DemoActor, "email" | "can">, links: DemoLinks, events: DemoEvent[] = []): DemoRequest {
  const requestedBy = lower(row.requested_by);
  return {
    id: row.id,
    status: toDemoStatus(row.status),
    clientId: row.client_id ?? null,
    clientName: row.client_id ? (links.clients.get(row.client_id) ?? null) : null,
    leadId: row.lead_id ?? null,
    leadName: row.lead_id ? (links.leads.get(row.lead_id) ?? null) : null,
    business: {
      name: row.business_name,
      type: row.business_type,
      area: row.area,
      offer: row.offer,
      website: nullIfBlank(row.website),
      brand: nullIfBlank(row.brand),
      customers: nullIfBlank(row.customers),
    },
    wants: nullIfBlank(row.wants),
    neededBy: row.needed_by ? row.needed_by.slice(0, 10) : null,
    demoUrl: nullIfBlank(row.demo_url),
    builderEmail: nullIfBlank(row.builder_email)?.toLowerCase() ?? null,
    builderNote: nullIfBlank(row.builder_note),
    requestedBy,
    requestedByName: links.names.get(requestedBy) ?? null,
    createdAt: instant(row.created_at),
    updatedAt: instant(row.updated_at),
    readyAt: instant(row.ready_at),
    shownAt: instant(row.shown_at),
    cancelledAt: instant(row.cancelled_at),
    events,
    can: canFor(actor, row),
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-09" -> "Oct 9" (a calendar date: no time zone involved). */
export function monthDay(date: string): string {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return date;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${month} ${Number(m[3])}` : date;
}
