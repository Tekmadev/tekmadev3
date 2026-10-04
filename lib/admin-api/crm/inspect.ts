import { z } from "zod";
import { ApiError, businessRule, dbError, instant, notConfigured, requireDb } from "@/lib/admin-api";
import { inspectCrmContact, type CrmInspection, type TheirSide } from "@/lib/crm/admin-data";
import { crmConfigured, getCrmSyncSetting } from "@/lib/crm/config";
import { CRM_TAGS } from "@/lib/crm/tags";
import { normalizeEmail } from "@/lib/subscribers-data";
import { toConsentHistory, type ApiConsentEventRow } from "../email/shapes";
import { apiUnsubscribeSource, type ApiUnsubscribeSource } from "../email/labels";
import { CRM_MESSAGES } from "./copy";
import { looseInstant } from "./status";

/**
 * The contact inspector: "This site" beside "CRM" for one address, read the
 * way the web admin's inspector reads it (lib/crm/admin-data.ts
 * inspectCrmContact: one live CRM lookup, only once the connection is
 * verified), in the shape of the app's zCrmInspect.
 */

export type ApiInspectSide = {
  canEmail: boolean;
  status: string;
  consented: boolean;
  tags: string[];
  lastSyncedAt: string | null;
  contactId: string | null;
};

export type ApiCrmInspect = {
  email: string;
  site: ApiInspectSide;
  crm: ApiInspectSide | null;
  notFoundReason?: string;
  erased?: true;
  consentHistory: ApiConsentEventRow[];
  canResubscribe: boolean;
};

/**
 * An email field (the inspect query, the resubscribe body): any value that
 * normalizes to an address becomes its email key (trimmed, lowercased);
 * anything else is the 400 `email` "Enter a valid email.".
 */
export const zCrmEmail = z.unknown().transform((value, ctx) => {
  const email = normalizeEmail(value);
  if (!email) {
    ctx.addIssue({ code: "custom", message: CRM_MESSAGES.email });
    return z.NEVER;
  }
  return email;
});

const objectOrEmpty = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

/** GET /crm/inspect?email= */
export const inspectQuery = z.object({ email: zCrmEmail });

/** POST /crm/resubscribe { email } */
export const resubscribeBody = z.preprocess(objectOrEmpty, z.object({ email: zCrmEmail }));

const notConnected = () => new ApiError(503, "not_configured", CRM_MESSAGES.notConfigured);
const unverified = () => businessRule("unverified", CRM_MESSAGES.unverified);

/**
 * Anything that reads the CRM needs a token (503 `not_configured`) the CRM
 * has not rejected (422 `unverified`). `verified: true` also needs a passed
 * Verify, for actions that act on what the CRM says.
 */
export async function requireCrmConnection(opts: { verified: boolean }): Promise<void> {
  requireDb();
  if (!crmConfigured()) throw notConnected();
  const setting = await getCrmSyncSetting();
  if (setting.health === "auth_failed") throw unverified();
  if (opts.verified && setting.health !== "ok") throw unverified();
}

const SITE_STATUS: Record<string, string> = {
  active: "Active",
  unsubscribed: "Unsubscribed",
  bounced: "Bounced",
  complained: "Marked as spam",
};

const VIA: Record<ApiUnsubscribeSource, string> = {
  unsubscribe_page: "via the unsubscribe page",
  crm: "via the CRM",
  crm_permanent: "via the CRM, as permanent",
  admin: "via the admin",
};

function siteSide(r: CrmInspection): ApiInspectSide {
  const s = r.subscriber;
  const mirror = r.mirror;
  const tags = mirror?.ghl_tags ? [...mirror.ghl_tags] : [];
  const lastSyncedAt = instant(mirror?.synced_at ?? s?.syncedAt ?? null);
  const contactId = mirror?.ghl_contact_id ?? null;
  if (!s) {
    return { canEmail: false, status: mirror?.erased_at ? "Erased" : "Not a subscriber", consented: false, tags, lastSyncedAt, contactId };
  }
  const via = s.status === "unsubscribed" ? apiUnsubscribeSource(s.statusSource) : null;
  return {
    canEmail: s.status === "active",
    status: `${SITE_STATUS[s.status] ?? s.status}${via ? ` ${VIA[via]}` : ""}`,
    consented: s.status === "active",
    tags,
    lastSyncedAt,
    contactId,
  };
}

/**
 * Their side, as one question: can this address be mailed. Email DND
 * "inactive" means contactable; when the global DND flag disagrees, the
 * stricter reading wins, as it does in the nightly reconcile.
 */
function crmSide(t: Extract<TheirSide, { state: "found" }>): ApiInspectSide {
  let canEmail: boolean;
  let status: string;
  if (t.dnd === "inactive") {
    canEmail = !t.conflict;
    status = t.conflict ? "Email DND off, but global DND on" : "Mailable";
  } else if (t.dnd === "active") {
    canEmail = false;
    status = t.conflict ? "Email DND on, but global DND off" : "Email DND on";
  } else if (t.dnd === "permanent") {
    canEmail = false;
    status = "Email DND on, permanent";
  } else {
    canEmail = t.globalDnd === false;
    status = t.globalDnd === true ? "Global DND on" : t.globalDnd === false ? "Mailable, no email DND set" : "Email DND unknown";
  }
  return {
    canEmail,
    status,
    // The newsletter tag is the consent tag: nothing else means mailable for campaigns.
    consented: t.tags.includes(CRM_TAGS.newsletter),
    tags: [...t.tags],
    lastSyncedAt: looseInstant(t.updatedAt),
    contactId: t.contactId,
  };
}

async function queuedForFirstPush(email: string): Promise<boolean> {
  const db = requireDb();
  const { data, error } = await db
    .from("crm_outbox")
    .select("id")
    .eq("email_key", email)
    .eq("kind", "contact.upsert")
    .in("status", ["pending", "failed", "sending"])
    .limit(1);
  if (error) throw dbError("crm inspect outbox read", error);
  return Array.isArray(data) && data.length > 0;
}

/** Why the CRM column is empty. */
async function notFoundReason(r: CrmInspection, t: Exclude<TheirSide, { state: "found" }>): Promise<string> {
  if (t.state === "not_checked") {
    return crmConfigured()
      ? "Not looked up: the connection has not passed Verify yet."
      : "Not looked up: the CRM is not connected yet.";
  }
  if (t.state === "error") return "Could not read the CRM just now. Look them up again in a moment.";
  if (r.mirror?.erased_at) return "No contact with this email in the CRM.";
  return (await queuedForFirstPush(r.email))
    ? "No contact with this email in the CRM yet. It is queued for its first push."
    : "No contact with this email in the CRM.";
}

/** GET /crm/inspect (and the answer of POST /crm/resubscribe). Calls the CRM live. */
export async function inspectForApi(email: string): Promise<{ inspection: CrmInspection; result: ApiCrmInspect }> {
  const inspection = await inspectCrmContact(email);
  if (!inspection) {
    // inspectCrmContact answers null only for a bad address or a missing database.
    requireDb();
    throw notConfigured();
  }

  const theirs = inspection.theirs;
  const found = theirs.state === "found" ? theirs : null;
  const erased = !!inspection.mirror?.erased_at;
  const s = inspection.subscriber;

  const result: ApiCrmInspect = {
    email: inspection.email,
    site: siteSide(inspection),
    crm: found ? crmSide(found) : null,
    consentHistory: s && !erased ? toConsentHistory(inspection.history) : [],
    // We hold an unsubscribe while the CRM says contactable: the one case that
    // needs a person, because the CRM cannot prove the person asked for it.
    canResubscribe: s?.status === "unsubscribed" && found?.dnd === "inactive",
  };
  if (theirs.state !== "found") result.notFoundReason = await notFoundReason(inspection, theirs);
  if (erased) result.erased = true;
  return { inspection, result };
}
