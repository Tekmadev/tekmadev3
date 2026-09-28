import type { CrmConfig } from "@/lib/crm/config";
import { readCrmSetting, writeCrmSetting } from "@/lib/crm/config";
import { createCustomField, getCustomFieldByKey, listCustomFields } from "@/lib/crm/client";

/**
 * The custom fields we own, and the bootstrap that gives them ids.
 *
 * Twelve fields, chosen because each one either routes a workflow or answers a
 * question afterwards. Contact custom fields live on the sub-account endpoint
 * with model=contact; Custom Fields V2 covers only Custom Objects and Company
 * today, so it is a dead end for contacts however current it looks.
 *
 * Every write references a field by `id`, never by key: the request schema
 * marks `id` required even though its description says either will do, and a
 * write that silently drops the value is worse than one that is refused.
 */
export const CRM_FIELDS = {
  /**
   * Carries `subscribers.public_id`, NEVER `unsubscribe_token`, so no mailable
   * token ever reaches a third party. It is what unlocks per-recipient open
   * and click attribution, since our tracking URLs already take `&s=<public_id>`.
   */
  subscriberPublicId: { key: "tmd_subscriber_public_id", name: "Tekmadev Subscriber ID", dataType: "TEXT" },
  leadSource: { key: "tmd_lead_source", name: "Tekmadev Lead Source", dataType: "TEXT" },
  /**
   * The utm_* trio and the lead source carry the same lowercase convention the
   * ads matcher hard-codes in SQL. Send them in any other casing and
   * attribution silently stops matching, with nothing anywhere saying why.
   */
  utmSource: { key: "tmd_utm_source", name: "Tekmadev UTM Source", dataType: "TEXT" },
  utmMedium: { key: "tmd_utm_medium", name: "Tekmadev UTM Medium", dataType: "TEXT" },
  utmCampaign: { key: "tmd_utm_campaign", name: "Tekmadev UTM Campaign", dataType: "TEXT" },
  /** Dollars a month, from the revenue leak calculator. The highest-value field we send. */
  monthlyLeak: { key: "tmd_monthly_leak", name: "Tekmadev Monthly Leak", dataType: "NUMERICAL" },
  /**
   * The /grow form's two qualification answers, sent as the label the person
   * picked (config/grow.ts) rather than the stored code, because the owner
   * reads them on the contact and branches the speed-to-lead workflow on them.
   * Text, not a number: a revenue band is a range someone chose, not a figure.
   */
  need: { key: "tmd_need", name: "Tekmadev Need", dataType: "TEXT" },
  revenueBand: { key: "tmd_revenue_band", name: "Tekmadev Revenue Band", dataType: "TEXT" },
  lastBookingAt: { key: "tmd_last_booking_at", name: "Tekmadev Last Booking", dataType: "TEXT" },
  consentVersion: { key: "tmd_consent_version", name: "Tekmadev Consent Policy", dataType: "TEXT" },
  consentAt: { key: "tmd_consent_at", name: "Tekmadev Consent Date", dataType: "TEXT" },
  clientSlug: { key: "tmd_client_slug", name: "Tekmadev Client Slug", dataType: "TEXT" },
} as const satisfies Record<string, { key: string; name: string; dataType: string }>;

export type CrmFieldKey = keyof typeof CRM_FIELDS;

const FIELD_KEYS = Object.keys(CRM_FIELDS) as CrmFieldKey[];

/** Strips the model prefix, so "contact.tmd_lead_source" compares against our own key. */
const bareKey = (fieldKey: string | null): string => (fieldKey ?? "").trim().toLowerCase().replace(/^contact\./, "");

/**
 * The ids the last successful bootstrap found, from `site_settings.crm_fields`.
 *
 * Read defensively: a row hand-edited into the wrong shape must produce fewer
 * fields, never a bad id. A write keyed by a bad id is rejected by the CRM and
 * takes the whole upsert with it, so a missing field is much the cheaper
 * failure.
 */
export async function cachedFieldIds(): Promise<Partial<Record<CrmFieldKey, string>>> {
  const raw = await readCrmSetting<Record<string, unknown>>("crm_fields", {});
  const out: Partial<Record<CrmFieldKey, string>> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const key of FIELD_KEYS) {
    const v = raw[key];
    if (typeof v === "string" && v.trim() !== "") out[key] = v.trim();
  }
  return out;
}

/**
 * Find every field's id, creating the ones that do not exist yet.
 *
 * Idempotent by construction: one list call answers for all twelve in the common
 * case, each remaining key is then probed on its own (the path accepts a field
 * key, so this also survives a list that paginated or filtered oddly), and
 * only a genuine miss is created. Whatever was resolved is cached even on a
 * partial run, so a later pass starts from there instead of listing again.
 *
 * `create: false` is the read-only form, for showing the owner what is
 * missing without touching his sub-account.
 */
export async function resolveFieldIds(
  cfg: CrmConfig,
  opts?: { create?: boolean },
): Promise<{ ok: true; ids: Record<CrmFieldKey, string>; created: CrmFieldKey[] } | { ok: false; error: string }> {
  const listed = await listCustomFields(cfg);
  if (!listed.ok) return { ok: false, error: `could not list custom fields: ${listed.error.message}` };

  const byKey = new Map<string, { id: string; dataType: string | null }>();
  for (const f of listed.data) {
    const key = bareKey(f.fieldKey);
    if (key) byKey.set(key, { id: f.id, dataType: f.dataType });
  }

  const ids: Partial<Record<CrmFieldKey, string>> = {};
  const created: CrmFieldKey[] = [];

  for (const key of FIELD_KEYS) {
    const def = CRM_FIELDS[key];
    let hit = byKey.get(def.key) ?? null;

    if (!hit) {
      const probed = await getCustomFieldByKey(cfg, def.key);
      if (!probed.ok) return { ok: false, error: `could not read ${def.key}: ${probed.error.message}` };
      if (probed.data) hit = { id: probed.data.id, dataType: probed.data.dataType };
    }

    if (!hit && opts?.create) {
      const made = await createCustomField(cfg, { name: def.name, dataType: def.dataType });
      if (!made.ok) return { ok: false, error: `could not create ${def.key}: ${made.error.message}` };
      hit = { id: made.data.id, dataType: made.data.dataType };
      created.push(key);
    }

    if (!hit) continue;
    // Not fatal: the value still stores. It is logged because a workflow that
    // branches on a number cannot branch on a field the account holds as text,
    // and that failure shows up in the CRM with nothing pointing back here.
    if (hit.dataType && hit.dataType.toUpperCase() !== def.dataType) {
      console.error(`[crm] field ${def.key} is ${hit.dataType} in the CRM, expected ${def.dataType}`);
    }
    ids[key] = hit.id;
  }

  // Merge, never replace: a pass that resolved ten of twelve must not throw
  // away the two an earlier pass had already found.
  const merged = { ...(await cachedFieldIds()), ...ids };
  await writeCrmSetting("crm_fields", merged, "system");

  const missing = FIELD_KEYS.filter((k) => !merged[k]);
  if (missing.length) {
    return { ok: false, error: `missing custom fields: ${missing.map((k) => CRM_FIELDS[k].key).join(", ")}` };
  }
  return { ok: true, ids: merged as Record<CrmFieldKey, string>, created };
}
