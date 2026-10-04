import type { AdminRole } from "@/lib/admin";
import type { AdminCategory } from "@/lib/admin-notify";
import { ApiError, MESSAGES } from "./errors";

/**
 * Who may do what in the admin API. One table, read by every route through
 * `route({ capability })`, `requireCapability(ctx, ...)` and `can(ctx, ...)`.
 * The same table is written out in docs/admin-api/permissions.md: change both.
 * The app keeps an identical fallback table (src/auth/capabilities.ts in the
 * app repo) for a /me without `capabilities`: keep the names and rows in step.
 *
 * Roles (owner decision 2026-10-03):
 *   Owner    everything.
 *   Manager  nearly the owner's power: everything except removing team
 *            members (`team.remove`) and creating or promoting owners
 *            (`team.owners`). Managers may add managers and staff.
 *   Staff    leads and outreach, analytics, onboarding help; marketing,
 *            pricing and coupons view only; never money.
 *
 * Session endpoints (me, meta, search, devices, profile) need no capability:
 * any staff member may call them, and search filters its own results with the
 * `*.view` rows below. GET /me sends the caller's list (capabilitiesFor), and
 * the app shows and hides everything from it.
 */

const O: readonly AdminRole[] = ["owner"];
const OM: readonly AdminRole[] = ["owner", "manager"];
const OMS: readonly AdminRole[] = ["owner", "manager", "staff"];

export const PERMISSIONS = {
  /* Home */
  "overview.view": OMS,
  /** Revenue, active subscriptions and recent subscriptions on Home. */
  "overview.revenue": OM,

  /* Inbox: what a role may read, per notification category */
  "notifications.view": OMS,
  "inbox.leads": OMS,
  "inbox.clients": OMS,
  "inbox.sales": OM,
  "inbox.billing": OM,
  "inbox.system": OM,
  "inbox.audience": OM,
  "inbox.team": OM,

  /* Analytics and Ads */
  "analytics.view": OMS,
  "ads.view": OM,
  "ads.refresh": OM,

  /* Leads */
  "leads.view": OMS,
  /** Add a lead by hand (outreach). */
  "leads.create": OMS,
  /** Status, follow-up date and who it is assigned to. */
  "leads.update": OMS,
  /** Log a call, email, DM or meeting with a lead. */
  "leads.outreach": OMS,
  /** Create a client from a lead. */
  "leads.convert": OMS,
  "leads.delete": OM,

  /* Free tools */
  "tools.view": OMS,

  /* Subscriptions (orders and Stripe subscriptions) */
  "billing.view": OM,

  /* Clients */
  "clients.view": OMS,
  /** The billing block, amounts and subscription data on a client. */
  "clients.billing": OM,
  "clients.create": OM,
  /** Account fields, internal notes field and guarantee terms (PATCH /clients/:id). */
  "clients.edit": OM,
  "clients.go_live": OM,
  /** Move a client to trash (DELETE /clients/:id). */
  "clients.trash": OM,
  /** The CRM section of a client (sub-account and calendars). */
  "clients.crm": OM,
  /** Portal members: invite, change role or status, resend invites. */
  "clients.members": OM,
  /** Onboarding run: stage, blocked, dates, complete. */
  "clients.onboarding": OM,
  "clients.tasks.create": OMS,
  "clients.tasks.status": OMS,
  "clients.intake.review": OM,
  /** Ask a client for access (POST /clients/:id/access-grants). */
  "clients.access.request": OMS,
  /** Change an access grant's status or note. */
  "clients.access.update": OM,
  "clients.approvals.request": OMS,
  /** Log a booked call. */
  "clients.calls.log": OMS,
  /** Edit, qualify, disqualify and review calls toward the guarantee. */
  "clients.calls.review": OM,
  /** Internal notes and client updates on the activity feed. */
  "clients.activity.write": OMS,
  /** Onboarding checklist templates. */
  "clients.templates": OM,

  /** Test clients, test inbox rows, test purchases and the Test toggles. */
  "testdata.view": OM,

  /* Marketing: Blog */
  "blog.view": OMS,
  "blog.write": OM,
  "blog.trash": OM,

  /* Marketing: Email */
  /** Overview counters, campaigns and templates (never subscriber records). */
  "email.view": OMS,
  "email.campaigns.write": OM,
  "email.subscribers.view": OM,
  "email.subscribers.write": OM,

  /* Marketing: Links (copy, share and QR codes included) */
  "links.view": OMS,
  "links.write": OM,

  /* Marketing: CRM sync */
  "crm.view": OM,
  "crm.write": OM,

  /* Sales */
  "pricing.view": OMS,
  "pricing.write": OM,
  "coupons.view": OMS,
  /** Copy or share a coupon's deal link. */
  "coupons.share": OMS,
  "coupons.write": OM,

  /* Settings */
  "loader.view": OM,
  "loader.write": OM,
  "testmode.view": OM,
  "testmode.write": OM,
  "team.view": OM,
  /** Add team members. Managers may add managers and staff; an owner also needs `team.owners`. */
  "team.write": OM,
  /** Remove a team member (DELETE /team/:email). Owners only. */
  "team.remove": O,
  /** Create or promote an owner (POST /team with role owner). Owners only. */
  "team.owners": O,
} as const satisfies Record<string, readonly AdminRole[]>;

export type Capability = keyof typeof PERMISSIONS;

export const CAPABILITIES = Object.keys(PERMISSIONS) as Capability[];

export function isCapability(value: string): value is Capability {
  return Object.prototype.hasOwnProperty.call(PERMISSIONS, value);
}

/** The roles allowed a capability. */
export function rolesFor(capability: Capability): readonly AdminRole[] {
  return PERMISSIONS[capability];
}

type HasRole = { role: AdminRole } | AdminRole;
const roleOf = (who: HasRole): AdminRole => (typeof who === "string" ? who : who.role);

/** Whether a role (or a request context) may use a capability. */
export function can(who: HasRole, capability: Capability): boolean {
  return (PERMISSIONS[capability] as readonly AdminRole[]).includes(roleOf(who));
}

/** Every capability a role (or a request context) holds, in table order: GET /me `capabilities`. */
export function capabilitiesFor(who: HasRole): Capability[] {
  return CAPABILITIES.filter((capability) => can(who, capability));
}

/** Whether only the owner holds this capability (decides the 403 copy). */
export function isOwnerOnly(capability: Capability): boolean {
  const roles = PERMISSIONS[capability] as readonly AdminRole[];
  return roles.length === 1 && roles[0] === "owner";
}

/**
 * The 403 for a capability the caller lacks. Owner-only sections answer
 * `owner_only` "That section is owner only." (the contract's code); anything
 * else a role may not do answers `forbidden` "Your role cannot do that.".
 */
export function forbiddenError(capability: Capability): ApiError {
  return isOwnerOnly(capability)
    ? new ApiError(403, "owner_only", MESSAGES.ownerOnly)
    : new ApiError(403, "forbidden", MESSAGES.forbidden);
}

/**
 * Throws the 403 unless the caller holds the capability. With several, the
 * caller needs every one of them.
 */
export function requireCapability(who: HasRole, ...capabilities: Capability[]): void {
  for (const capability of capabilities) {
    if (!can(who, capability)) throw forbiddenError(capability);
  }
}

/** Throws the 403 unless the caller holds at least one of the capabilities. */
export function requireAnyCapability(who: HasRole, ...capabilities: Capability[]): void {
  if (capabilities.length === 0 || capabilities.some((c) => can(who, c))) return;
  throw forbiddenError(capabilities[0]);
}

const INBOX_CATEGORIES: readonly AdminCategory[] = ["leads", "sales", "billing", "clients", "audience", "team", "system"];

/** The inbox categories a role may read (owners and managers: all seven; staff: leads and clients). */
export function inboxCategories(who: HasRole): AdminCategory[] {
  return INBOX_CATEGORIES.filter((category) => can(who, `inbox.${category}` as Capability));
}

/**
 * Whether a role reads owner-audience Inbox rows (lib/admin-notify.ts events
 * with `audience: "owner"`: Stripe and checkout problems, CRM and Meta
 * health, "Client deleted", subscriber events, team changes). Those rows go
 * to the roles that read the whole Inbox, every `inbox.*` row: owners and
 * managers. Staff never read them, not even in the categories they do read
 * (an owner-audience row in Clients, like "Client deleted", stays hidden from
 * staff). The Inbox lists, the badge and phone pushes all use this.
 */
export function readsOwnerAudience(who: HasRole): boolean {
  return inboxCategories(who).length === INBOX_CATEGORIES.length;
}
