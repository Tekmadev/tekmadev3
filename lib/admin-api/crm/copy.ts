/**
 * Copy and vocabulary for the CRM endpoints (app/api/admin/v1/crm). It is
 * always "the CRM": no vendor name in any field, sentence or message, so text
 * that comes from lib/crm (errors, probe details) passes through scrubVendor()
 * before it is sent. Constants only (no data access, no barrel import), so the
 * meta fragment can load it cheaply.
 */

export const CRM_MESSAGES = {
  notConfigured: "The CRM is not connected. Add the CRM token on the website first.",
  unverified: "The CRM has not passed Verify yet. Verify the connection first.",
  probe: "The check could not reach the CRM. Nothing changed. Try again in a moment.",
  sync: "The sync could not reach the CRM. Nothing was lost: queued items stay queued.",
  reconcile: "The reconcile could not reach the CRM. Nothing was changed.",
  nothing: "Nothing to retry or discard.",
  queue: "Pick the outbox or the inbox.",
  ids: "Pick at least one item.",
  on: "Send on as true or false.",
  email: "Enter a valid email.",
  resubRefused: "Not resubscribed: bounced or complained addresses can never be revived.",
  resubNotFound: "Not resubscribed: there is no subscriber with that email here.",
  resubStale: "Not resubscribed: this changed since you looked them up. Look them up again.",
  switchSave: "The switch could not be saved. Try again in a moment.",
  resubSave: "Not resubscribed: the change could not be saved. Try again in a moment.",
  resubUnreachable: "Not resubscribed: the CRM could not be reached to check them again. Nothing changed. Try again in a moment.",
  reconcileOff: "Nightly reconcile is switched off, so nothing ran. Turn it on first, then run it now.",
} as const;

export type CrmApiHealth = "not_connected" | "token_rejected" | "verified" | "not_verified";
export type CrmApiAppStatus = "installed_here" | "installed_elsewhere" | "not_installed";
export type CrmApiJob = "push" | "inbound" | "reconcile" | "backfill" | "verify";
export type CrmApiRunBy = "schedule" | "signup" | "you";
export type CrmApiRunStatus = "ok" | "running" | "partial" | "error";

export const HEALTH_EXPLANATION: Record<CrmApiHealth, string> = {
  not_connected: "No CRM token is set on the website yet, so nothing talks to the CRM. Everything stays off until it is.",
  token_rejected:
    "The CRM rejected the token, so all syncing has stopped. Create a fresh token in the CRM, set it on the website, then verify again.",
  verified: "Connected and proven against a throwaway contact. The switches can be turned on.",
  not_verified: "Connected, but not proven yet. Verify first: nothing can be switched on until every check passes.",
};

export const APP_EXPLANATION: Record<CrmApiAppStatus, string> = {
  installed_here: "Installed on our own CRM account. Unsubscribes and appointments made in the CRM reach the site.",
  installed_elsewhere: "The last install went to another CRM account, not ours. Install it on our own account too.",
  not_installed:
    "Not installed yet. The Inbound switch needs it: unsubscribes made in the CRM and client appointments arrive through it.",
};

export const APP_KEYS_MISSING = " The app keys are not set on the website yet, so an install cannot finish.";

/** Why a switch that is on is not running. */
export const SWITCH_STOPPED = {
  notConfigured: "Stopped: the CRM is not connected. Add the CRM token on the website first.",
  tokenRejected: "Stopped: the CRM rejected the token. Set a fresh one on the website, then verify again.",
  unverified: "Stopped: the connection is not verified. Fix it, then verify again.",
} as const;

/** The probe's checks (lib/crm/probe.ts), in checklist order: what a pass proves, and what a failure means. */
export const PROBE_SENTENCES: Record<string, { ok: string; failed: string }> = {
  auth: {
    ok: "The CRM accepted the token and the account id.",
    failed: "The CRM did not accept the token or the account id.",
  },
  dnd_polarity: {
    ok: "\"Do not disturb\" on really means do not email.",
    failed: "We could not prove that \"do not disturb\" on means do not email.",
  },
  dnd_legacy_rejected: {
    ok: "An old-style consent change cannot quietly do nothing.",
    failed: "An old-style consent change might quietly do nothing.",
  },
  lookup_with_pit: {
    ok: "The site can find a contact by email with this kind of token.",
    failed: "The site cannot find a contact by email with this token.",
  },
  tags_preserved_on_upsert: {
    ok: "Updating a contact keeps the tags our own workflows added.",
    failed: "Updating a contact may drop tags our workflows added.",
  },
  delete_tags_body: {
    ok: "The site can remove the newsletter tag when someone unsubscribes.",
    failed: "The site cannot remove the newsletter tag when someone unsubscribes.",
  },
  dedupe_on_email: {
    ok: "The CRM matches contacts by email, so one person's update can never land on someone else.",
    failed: "The CRM may match contacts on something other than the email.",
  },
  custom_fields: {
    ok: "The twelve Tekmadev fields exist in the CRM and can be written.",
    failed: "Some of the twelve Tekmadev fields are missing in the CRM or cannot be written.",
  },
};

/** Outbox job kinds (lib/crm/outbox.ts), as the attention list names them. */
export const OUTBOX_KIND_LABEL: Record<string, string> = {
  "contact.upsert": "Push contact",
  "dnd.set": "Turn email DND on or off",
  "tags.add": "Add tag",
  "tags.remove": "Remove tag",
  "contact.erase": "Suppress and tag erased",
};

/** Inbound event types (lib/crm/inbox.ts CRM_INBOUND_EVENTS, plus the app's own install events). */
export const INBOX_EVENT_LABEL: Record<string, string> = {
  ContactDndUpdate: "Email DND change from the CRM",
  ContactCreate: "New contact from the CRM",
  ContactUpdate: "Contact change from the CRM",
  ContactDelete: "Contact deleted in the CRM",
  ContactTagUpdate: "Tag change from the CRM",
  AppointmentCreate: "Appointment for review",
  AppointmentUpdate: "Appointment change for review",
  AppointmentDelete: "Appointment cancelled",
  INSTALL: "Webhook app installed",
  UNINSTALL: "Webhook app removed",
  unverified: "Unverified message from the CRM",
  unparseable: "Unreadable message from the CRM",
  unknown: "Message from the CRM",
};

/**
 * Text from lib/crm (stored errors, probe details) with the vendor's name, its
 * hostnames and its setting names taken out. Applied to everything sent from
 * there; our own copy above never needs it.
 */
export function scrubVendor(text: string): string {
  return text
    .replace(/\bX-GHL-[A-Za-z-]+/gi, "the signature header")
    .replace(/(?:https?:\/\/)?[a-z0-9.-]*(?:leadconnectorhq|gohighlevel|highlevel)\.com(?:\/[^\s:,;)"']*)?/gi, "the CRM")
    .replace(/\bGHL_[A-Z0-9_]+\b/g, "the CRM setting")
    .replace(/\bghl_([a-z0-9_]+)\b/g, "crm_$1")
    .replace(/\b(?:the\s+)?(?:GoHighLevel|Go\s+High\s+Level|HighLevel|LeadConnector|GHL)\b('s)?/gi, (_m, s: string | undefined) =>
      s ? "the CRM's" : "the CRM",
    )
    .replace(/\bthe CRM setting and the CRM setting\b/g, "the CRM settings");
}

/**
 * scrubVendor over a JSON value: every string, and every object key (a key
 * like `ghl_location_id` reads `crm_location_id`). For stored jsonb that may
 * carry CRM errors (an Inbox row's `data`).
 */
export function scrubVendorDeep(value: unknown): unknown {
  if (typeof value === "string") return scrubVendor(value);
  if (Array.isArray(value)) return value.map(scrubVendorDeep);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) out[scrubVendor(key)] = scrubVendorDeep(item);
    return out;
  }
  return value;
}

/** First letter up, a full stop at the end, at most `max` characters. */
export function sentence(text: string, max = 240): string {
  let t = text.replace(/\s+/g, " ").trim();
  if (!t) return t;
  if (t.length > max) t = `${t.slice(0, max - 3).trimEnd()}...`;
  t = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

export const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

type Tone = "neutral" | "gold" | "ok" | "warn" | "muted" | "signal";

/* GET /meta (the crm slice) */

export const CRM_HEALTH_OPTIONS: { value: CrmApiHealth; label: string; tone: Tone }[] = [
  { value: "not_connected", label: "Not connected", tone: "muted" },
  { value: "token_rejected", label: "Token rejected", tone: "neutral" },
  { value: "verified", label: "Verified", tone: "ok" },
  { value: "not_verified", label: "Not verified", tone: "neutral" },
];

export const CRM_APP_STATUS_OPTIONS: { value: CrmApiAppStatus; label: string }[] = [
  { value: "installed_here", label: "Installed on our account" },
  { value: "installed_elsewhere", label: "Installed on another account" },
  { value: "not_installed", label: "Not installed" },
];

export const CRM_SURFACE_OPTIONS: { value: "outbound" | "inbound" | "reconcile"; label: string }[] = [
  { value: "outbound", label: "Outbound" },
  { value: "inbound", label: "Inbound" },
  { value: "reconcile", label: "Nightly reconcile" },
];

export const CRM_JOB_OPTIONS: { value: CrmApiJob; label: string }[] = [
  { value: "push", label: "Push" },
  { value: "inbound", label: "Inbound" },
  { value: "reconcile", label: "Reconcile" },
  { value: "backfill", label: "Backfill" },
  { value: "verify", label: "Verify" },
];

export const CRM_RUN_BY_OPTIONS: { value: CrmApiRunBy; label: string }[] = [
  { value: "schedule", label: "Schedule" },
  { value: "signup", label: "Signup" },
  { value: "you", label: "You" },
];

export const CRM_RUN_STATUS_OPTIONS: { value: CrmApiRunStatus; label: string; tone: Tone }[] = [
  { value: "ok", label: "ok", tone: "ok" },
  { value: "running", label: "running", tone: "neutral" },
  { value: "partial", label: "part done", tone: "warn" },
  { value: "error", label: "error", tone: "signal" },
];

export const CRM_DIRECTION_OPTIONS: { value: "to_crm" | "from_crm"; label: string }[] = [
  { value: "to_crm", label: "To the CRM" },
  { value: "from_crm", label: "From the CRM" },
];

export const CRM_QUEUE_OPTIONS: { value: "outbox" | "inbox"; label: string }[] = [
  { value: "outbox", label: "Outbox" },
  { value: "inbox", label: "Inbox" },
];
