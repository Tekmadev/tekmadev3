import { ACCESS_PROVIDER_LABELS, APP_ACCESS_PROVIDERS } from "./access";
import { SECTION_ACTIVITY_EVENTS } from "./activity";

/**
 * The GET /meta keys that label the client sections (the app's
 * src/api/schemas/clients.ts metaFragment). The clients meta fragment
 * (lib/admin-api/meta/clients.ts) can spread `sectionsMeta` so labels and
 * tones stay next to the code that writes the values. Labels match the app's
 * mock fixture word for word.
 */

type Tone = "neutral" | "gold" | "ok" | "warn" | "muted" | "signal";

export const sectionsMeta = {
  accessProviders: APP_ACCESS_PROVIDERS.map((value) => ({ value, label: ACCESS_PROVIDER_LABELS[value] })),
  accessMethods: [
    { value: "invite_user", label: "Add us as a user" },
    { value: "partner_request", label: "Partner or agency request" },
    { value: "password_manager", label: "Shared through a password manager" },
    { value: "api_key", label: "API key" },
    { value: "screen_share", label: "Set up together on a call" },
    { value: "other", label: "Other" },
  ],
  accessStatuses: [
    { value: "requested", label: "Requested", tone: "neutral" as Tone },
    { value: "pending_client", label: "Pending client", tone: "gold" as Tone },
    { value: "client_says_done", label: "Client says done", tone: "warn" as Tone },
    { value: "granted", label: "Granted", tone: "ok" as Tone },
    { value: "verified", label: "Verified", tone: "ok" as Tone },
    { value: "revoked", label: "Revoked", tone: "signal" as Tone },
    { value: "not_applicable", label: "Not applicable", tone: "muted" as Tone },
  ],
  assetKinds: [
    { value: "logo", label: "Logo" },
    { value: "photo", label: "Photo" },
    { value: "brand", label: "Brand guide" },
    { value: "document", label: "Document" },
    { value: "video", label: "Video" },
    { value: "other", label: "Other" },
  ],
  approvalKinds: [
    { value: "website", label: "Website" },
    { value: "landing_page", label: "Landing page" },
    { value: "copy", label: "Copy" },
    { value: "design", label: "Design" },
    { value: "ad_creative", label: "Ad creative" },
    { value: "email", label: "Email" },
    { value: "automation", label: "Automation" },
    { value: "other", label: "Other" },
  ],
  approvalStatuses: [
    { value: "pending", label: "Pending", tone: "gold" as Tone },
    { value: "approved", label: "Approved", tone: "ok" as Tone },
    { value: "changes_requested", label: "Changes requested", tone: "warn" as Tone },
    { value: "superseded", label: "Superseded", tone: "muted" as Tone },
  ],
  agreementStatuses: [
    { value: "draft", label: "Draft", tone: "muted" as Tone },
    { value: "sent", label: "Sent", tone: "gold" as Tone },
    { value: "viewed", label: "Viewed", tone: "gold" as Tone },
    { value: "signed", label: "Signed", tone: "ok" as Tone },
    { value: "declined", label: "Declined", tone: "muted" as Tone },
    { value: "voided", label: "Voided", tone: "muted" as Tone },
  ],
  callStatuses: [
    { value: "booked", label: "Booked", tone: "neutral" as Tone },
    { value: "confirmed", label: "Confirmed", tone: "gold" as Tone },
    { value: "showed", label: "Showed", tone: "ok" as Tone },
    { value: "no_show", label: "No show", tone: "warn" as Tone },
    { value: "cancelled", label: "Cancelled", tone: "muted" as Tone },
    { value: "rescheduled", label: "Rescheduled", tone: "neutral" as Tone },
  ],
  callSources: [
    { value: "crm", label: "CRM" },
    { value: "manual", label: "Manual" },
    { value: "phone", label: "Phone" },
    { value: "website", label: "Website" },
    { value: "referral", label: "Referral" },
    { value: "other", label: "Other" },
  ],
  callReviewStates: [
    { value: "needs_review", label: "Needs review", tone: "gold" as Tone },
    { value: "qualified", label: "Counts", tone: "ok" as Tone },
    { value: "disqualified", label: "DQ", tone: "muted" as Tone },
    { value: "outside_window", label: "Outside window", tone: "muted" as Tone },
  ],
  disqualifyReasons: [
    { value: "spam", label: "Spam" },
    { value: "duplicate", label: "Duplicate" },
    { value: "out_of_area", label: "Out of area" },
    { value: "wrong_service", label: "Wrong service" },
    { value: "fake", label: "Fake" },
    { value: "other", label: "Other" },
  ],
  memberRoles: [
    { value: "owner", label: "Owner" },
    { value: "admin", label: "Admin" },
    { value: "member", label: "Member" },
  ],
  memberStatuses: [
    { value: "active", label: "Active", tone: "ok" as Tone },
    { value: "invited", label: "Invited", tone: "gold" as Tone },
    { value: "disabled", label: "Disabled", tone: "muted" as Tone },
  ],
  guaranteeCountRules: [
    { value: "booked", label: "Booked" },
    { value: "showed", label: "Showed" },
  ],
  guaranteePaces: [
    { value: "met", label: "Met", tone: "ok" as Tone },
    { value: "on_pace", label: "On pace", tone: "ok" as Tone },
    { value: "behind", label: "Behind pace", tone: "warn" as Tone },
    { value: "not_started", label: "Not started", tone: "muted" as Tone },
    { value: "n/a", label: "n/a", tone: "muted" as Tone },
  ],
};

/** Activity event labels for the events these sections write; merge with the rest of the client events. */
export const sectionActivityEvents = SECTION_ACTIVITY_EVENTS;
