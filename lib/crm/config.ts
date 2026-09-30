import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * Configuration and degradation for the CRM sync.
 *
 * Two credentials, two directions, no overlap. Outbound is a sub-account
 * Private Integration Token: static, one env var, no refresh machinery.
 * Inbound is a private unlisted Marketplace app, because a Private
 * Integration Token cannot receive platform webhooks at all; we never call the
 * API as that app, so there is no OAuth token to refresh, ever.
 *
 * With no env vars set every leg is a no-op. The enqueue triggers stop at the
 * owner switch, the crons return early, and the inbound route still answers
 * 401 to an unsigned request because the Ed25519 key is a constant rather than
 * configuration. There is no unconfigured state that opens the door.
 *
 * Three switches, not one, stored in `site_settings.crm_sync`. Outbound has to
 * be live before the marketplace app exists; inbound can suppress addresses,
 * so it deserves a switch the owner can pull on its own; reconcile can
 * suppress in bulk, so it deserves a third.
 */

export type CrmConfig = { token: string; locationId: string };

// GoHighLevel ids are base62 and about 20 characters. The check exists to
// catch a pasted URL or a truncated copy, which otherwise shows up as a 404
// on every single call with nothing saying why.
const LOCATION_ID = /^[A-Za-z0-9]{15,40}$/;

/**
 * The outbound credentials, or null when they are absent or malformed.
 *
 * `process.env` is read inside the function, never captured at module load,
 * because a Vercel function can be warm across an env var change and a
 * captured value would keep the old token alive.
 */
export function crmConfig(): CrmConfig | null {
  // "Bearer " pasted along with the token is the one paste mistake worth
  // absorbing: the request would carry it twice and every call would 401,
  // which reads as a rotated token rather than a typo.
  const token = process.env.GHL_PIT_TOKEN?.trim().replace(/^Bearer\s+/i, "") ?? "";
  const locationId = process.env.GHL_LOCATION_ID?.trim() ?? "";
  if (token.length < 20 || /\s/.test(token)) return null;
  if (!LOCATION_ID.test(locationId)) return null;
  return { token, locationId };
}

export function crmConfigured(): boolean {
  return crmConfig() !== null;
}

/**
 * The private webhook app's client key, used once per install to trade the
 * install code for a token. Separate from the token above on purpose: this
 * app only RECEIVES webhooks, and the site never calls the API as the app.
 */
export type CrmAppConfig = { clientId: string; clientSecret: string };

export function crmAppConfig(): CrmAppConfig | null {
  const clientId = process.env.GHL_APP_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.GHL_APP_CLIENT_SECRET?.trim() ?? "";
  if (clientId.length < 8 || clientSecret.length < 8 || /\s/.test(clientId + clientSecret)) return null;
  return { clientId, clientSecret };
}

/**
 * What the last completed app install told us, in `site_settings.crm_app`.
 * Facts only: the token the install returns is discarded, never stored.
 */
export type CrmAppInstall = {
  installedAt?: string;
  userType?: string | null;
  locationId?: string | null;
  companyId?: string | null;
  /** The install landed on the sub-account in GHL_LOCATION_ID. */
  ours?: boolean;
};

export async function getCrmAppInstall(): Promise<CrmAppInstall> {
  const v = await readCrmSetting<CrmAppInstall>("crm_app", {});
  return v && typeof v === "object" ? v : {};
}

/**
 * GoHighLevel's documented Ed25519 public key for the `X-GHL-Signature`
 * header: the base64 body of the SPKI PEM block in their webhook guide, with
 * the armour removed, which is what `createPublicKey` wants for format "der".
 *
 * Baked in on purpose. If the key were configuration then an unset env var
 * would leave the inbound route with nothing to verify against, and an
 * unverified DND event can only be dropped. A constant means the door is
 * closed before anything is configured. The env var exists so a rotation on
 * their side can be applied without a deploy.
 */
const DOCUMENTED_WEBHOOK_KEY = "MCowBQYDK2VwAyEAi2HR1srL4o18O8BRa7gVJY7G7bupbN3H9AwJrHCDiOg=";

/** Base64 SPKI DER, whichever shape the override was pasted in. */
export function crmWebhookKey(): string {
  const raw = process.env.GHL_WEBHOOK_PUBLIC_KEY?.trim();
  if (!raw) return DOCUMENTED_WEBHOOK_KEY;
  // A whole PEM block is the likely paste. Left as-is, createPublicKey throws
  // on the armour and the route reports a signature failure instead of a
  // configuration mistake, which sends the owner looking in the wrong place.
  const der = raw.replace(/-----(?:BEGIN|END) PUBLIC KEY-----/g, "").replace(/\s+/g, "");
  return der || DOCUMENTED_WEBHOOK_KEY;
}

/**
 * Read a `crm_*` row out of `site_settings`, at request time so the owner's
 * switch takes effect at once with nothing deployed. A failed or absent read
 * returns the caller's own safe default, the same contract as
 * `lib/site-settings.ts`, which cannot be reused here because its accessors
 * are module-private.
 */
export async function readCrmSetting<T>(key: string, fallback: T): Promise<T> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return fallback;
  const { data, error } = await supabase.from("site_settings").select("value").eq("key", key).maybeSingle();
  if (error) {
    console.error(`[crm] could not read ${key}`, error.message);
    return fallback;
  }
  return (data?.value as T | undefined) ?? fallback;
}

export async function writeCrmSetting(key: string, value: unknown, by: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  const { error } = await supabase
    .from("site_settings")
    .upsert({ key, value, updated_by: by, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) console.error(`[crm] could not save ${key}`, error.message);
  return !error;
}

export type CrmHealth = "unverified" | "ok" | "auth_failed";

export type CrmSyncSetting = {
  outbound: boolean;
  inbound: boolean;
  reconcile: boolean;
  health: CrmHealth;
};

export async function getCrmSyncSetting(): Promise<CrmSyncSetting> {
  const v = await readCrmSetting<Partial<CrmSyncSetting>>("crm_sync", {});
  // Anything but a literal true is off, the same discipline as
  // getSalesTaxSetting. A malformed row must never start syncing, and an
  // unrecognised health value is treated as never verified rather than fine.
  return {
    outbound: v.outbound === true,
    inbound: v.inbound === true,
    reconcile: v.reconcile === true,
    health: v.health === "ok" || v.health === "auth_failed" ? v.health : "unverified",
  };
}

/** Merges onto the current row, so flipping one switch cannot clear another. */
export async function setCrmSync(patch: Partial<CrmSyncSetting>, by: string): Promise<boolean> {
  const current = await getCrmSyncSetting();
  return writeCrmSetting("crm_sync", { ...current, ...patch }, by);
}

/**
 * What the probe settled, cached in `site_settings.crm_probe`.
 *
 * `lookupPath` is the one field the live path reads: the docs contradict
 * themselves about whether a Private Integration Token may call
 * `GET /contacts/lookup`, so the client discovers the answer once and
 * remembers it rather than paying a 401 on every lookup.
 */
export type CrmProbeSetting = {
  lookupPath?: "lookup" | "duplicate";
  /** The shape the undocumented duplicate-search 200 body actually had. */
  duplicateShape?: string;
  checks?: unknown;
  at?: string;
  [key: string]: unknown;
};

export async function getCrmProbeSetting(): Promise<CrmProbeSetting> {
  const v = await readCrmSetting<CrmProbeSetting>("crm_probe", {});
  return v && typeof v === "object" ? v : {};
}

/**
 * Merge, never replace. The probe writes its checklist into the same row the
 * client writes `lookupPath` into, and a plain overwrite from either side
 * would throw away the other's answer.
 */
export async function patchCrmProbeSetting(patch: CrmProbeSetting, by = "system"): Promise<boolean> {
  const current = await getCrmProbeSetting();
  return writeCrmSetting("crm_probe", { ...current, ...patch }, by);
}

export type CrmGate =
  | { ok: true; cfg: CrmConfig }
  | { ok: false; reason: "switch_off" | "not_configured" | "auth_failed" | "unverified" };

/**
 * May this surface talk to the CRM right now.
 *
 * The owner's switch is read first, the way `createCheckoutSession` reads his
 * sales tax switch before asking Stripe anything: it is the check that
 * decides, and asking it first is what makes `not_configured` mean "switched
 * on but not connected", which is the only reading worth notifying him about.
 *
 * `unverified` is a refusal, not a warning. The probe is what settles DND
 * polarity, and a polarity read backwards keeps someone who opted out marked
 * as mailable, so nothing runs before it has passed.
 */
export async function crmGate(surface: "outbound" | "inbound" | "reconcile"): Promise<CrmGate> {
  const setting = await getCrmSyncSetting();
  if (!setting[surface]) return { ok: false, reason: "switch_off" };
  const cfg = crmConfig();
  if (!cfg) return { ok: false, reason: "not_configured" };
  if (setting.health === "auth_failed") return { ok: false, reason: "auth_failed" };
  if (setting.health !== "ok") return { ok: false, reason: "unverified" };
  return { ok: true, cfg };
}
