import { z } from "zod";
import { dbError, instant, isUuid, notFound, requireDb, type ApiContext } from "@/lib/admin-api";
import type { AccessMethod, AccessProviderKey } from "@/lib/access-providers";
import { requestClientAccess, setClientAccessStatus } from "@/lib/client-sections-data";
import type { Client } from "@/lib/clients-data";
import type { AccessGrant } from "@/lib/onboarding-data";
import { COPY, findSectionClient, loadPeople, memberNames, parseBody, zText, type People } from "./shared";

/**
 * Access grants: the list in the bundle, "Request another access"
 * (POST /clients/:id/access-grants) and a staff decision on one
 * (PATCH /access-grants/:id).
 *
 * The app's provider and method lists differ from the website's. A provider
 * the website has no key for is stored under its closest website key (so the
 * portal shows the right steps) with the app's key in `metadata.app_provider`,
 * which is what the API answers with. Website-only keys read as the nearest
 * app key, and their label (always set by the website) keeps the real name.
 */

export const APP_ACCESS_PROVIDERS = [
  "google_business_profile",
  "google_ads",
  "google_analytics",
  "google_search_console",
  "meta_business",
  "instagram",
  "domain_registrar",
  "dns",
  "website_hosting",
  "wordpress",
  "wix",
  "squarespace",
  "shopify",
  "crm",
  "call_tracking",
  "email_provider",
  "other",
] as const;
export type AppAccessProvider = (typeof APP_ACCESS_PROVIDERS)[number];

export const APP_ACCESS_METHODS = ["invite_user", "partner_request", "password_manager", "api_key", "screen_share", "other"] as const;
export type AppAccessMethod = (typeof APP_ACCESS_METHODS)[number];

export const ACCESS_STATUSES = ["requested", "pending_client", "client_says_done", "granted", "verified", "revoked", "not_applicable"] as const;
export type AccessStatus = (typeof ACCESS_STATUSES)[number];

/** The app's labels (GET /meta accessProviders). */
export const ACCESS_PROVIDER_LABELS: Record<AppAccessProvider, string> = {
  google_business_profile: "Google Business Profile",
  google_ads: "Google Ads",
  google_analytics: "Google Analytics",
  google_search_console: "Google Search Console",
  meta_business: "Meta Business",
  instagram: "Instagram",
  domain_registrar: "Domain registrar",
  dns: "DNS",
  website_hosting: "Website hosting",
  wordpress: "WordPress",
  wix: "Wix",
  squarespace: "Squarespace",
  shopify: "Shopify",
  crm: "CRM",
  call_tracking: "Call tracking",
  email_provider: "Email provider",
  other: "Other",
};

const PROVIDER_TO_DB: Record<AppAccessProvider, AccessProviderKey> = {
  google_business_profile: "google_business_profile",
  google_ads: "google_ads",
  google_analytics: "google_analytics",
  google_search_console: "google_search_console",
  meta_business: "meta_business",
  instagram: "instagram",
  domain_registrar: "domain_dns",
  dns: "domain_dns",
  website_hosting: "website_hosting",
  wordpress: "website_hosting",
  wix: "website_hosting",
  squarespace: "website_hosting",
  shopify: "website_hosting",
  crm: "crm",
  call_tracking: "phone_carrier",
  email_provider: "email_provider",
  other: "other",
};

const PROVIDER_FROM_DB: Record<AccessProviderKey, AppAccessProvider> = {
  google_business_profile: "google_business_profile",
  google_ads: "google_ads",
  google_analytics: "google_analytics",
  google_search_console: "google_search_console",
  google_tag_manager: "other",
  meta_business: "meta_business",
  meta_ads: "meta_business",
  instagram: "instagram",
  tiktok_ads: "other",
  linkedin: "other",
  domain_dns: "dns",
  website_hosting: "website_hosting",
  phone_carrier: "call_tracking",
  calendar: "other",
  crm: "crm",
  email_provider: "email_provider",
  other: "other",
};

const METHOD_FROM_DB: Record<AccessMethod, AppAccessMethod> = {
  partner_invite: "partner_request",
  manager_role: "invite_user",
  delegated: "invite_user",
  dns_records: "other",
  api_connection: "api_key",
  other: "other",
};

const isAppProvider = (value: unknown): value is AppAccessProvider =>
  typeof value === "string" && (APP_ACCESS_PROVIDERS as readonly string[]).includes(value);

export type ApiAccessGrant = {
  id: string;
  clientId: string;
  provider: AppAccessProvider;
  label: string | null;
  status: AccessStatus;
  accountIdentifier: string | null;
  method: AppAccessMethod | null;
  note: string | null;
  clientDoneAt: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  requestedAt: string;
  updatedAt: string;
};

export function accessGrantView(row: AccessGrant, people: People): ApiAccessGrant {
  const stored = row.metadata?.app_provider;
  return {
    id: row.id,
    clientId: row.client_id,
    provider: isAppProvider(stored) ? stored : PROVIDER_FROM_DB[row.provider] ?? "other",
    label: row.label,
    status: row.status,
    accountIdentifier: row.account_identifier,
    method: METHOD_FROM_DB[row.method] ?? "other",
    note: row.notes,
    clientDoneAt: instant(row.client_marked_done_at),
    verifiedAt: instant(row.verified_at),
    verifiedBy: people.display(row.verified_by),
    requestedAt: instant(row.requested_at),
    updatedAt: instant(row.updated_at),
  };
}

/** A client's grants, oldest request first (the order the website shows). */
export async function listAccessGrantRows(clientId: string): Promise<AccessGrant[]> {
  const { data, error } = await requireDb()
    .from("client_access_grants")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw dbError("access grants list", error);
  return (data ?? []) as AccessGrant[];
}

const GRANT_MISSING = "That access request";

/** A grant on a client the caller may see, else 404 "That access request no longer exists.". */
export async function findAccessGrant(ctx: ApiContext, id: string | undefined): Promise<{ grant: AccessGrant; client: Client }> {
  if (!isUuid(id)) throw notFound(GRANT_MISSING);
  const { data, error } = await requireDb().from("client_access_grants").select("*").eq("id", id).maybeSingle();
  if (error) throw dbError("access grant lookup", error);
  const grant = (data as AccessGrant | null) ?? null;
  if (!grant) throw notFound(GRANT_MISSING);
  const client = await findSectionClient(ctx, grant.client_id, GRANT_MISSING);
  return { grant, client };
}

/* ------------------------------------------------------------------ */
/* POST /clients/:id/access-grants                                     */
/* ------------------------------------------------------------------ */

const requestBody = z.object({
  provider: z.enum(APP_ACCESS_PROVIDERS, { error: "Pick what we need access to." }),
  label: zText(120),
  note: zText(1000),
});

/** "Request another access": 201 with the new grant (status `pending_client`, like the web admin). */
export async function requestAccess(ctx: ApiContext, clientId: string | undefined, raw: unknown): Promise<ApiAccessGrant> {
  const client = await findSectionClient(ctx, clientId);
  const body = parseBody(requestBody, raw, { provider: "provider" });
  const dbProvider = PROVIDER_TO_DB[body.provider];
  // Same key on both sides: the website's own label, like the web admin. Otherwise keep the app's name and key.
  const exact = PROVIDER_FROM_DB[dbProvider] === body.provider;
  const grant = await requestClientAccess({
    clientId: client.id,
    provider: dbProvider,
    label: body.label ?? (exact ? null : ACCESS_PROVIDER_LABELS[body.provider]),
    notes: body.note ?? null,
    by: ctx.email,
    metadata: exact ? undefined : { app_provider: body.provider },
  });
  // Like the web admin, a new request starts as `pending_client` (the
  // column default): the portal shows it to the client as "Waiting on you".
  return accessGrantView(grant, await loadPeople(ctx));
}

/* ------------------------------------------------------------------ */
/* PATCH /access-grants/:id                                            */
/* ------------------------------------------------------------------ */

const patchBody = z.object({
  status: z.enum(ACCESS_STATUSES, { error: COPY.status }).optional(),
  // Not transformed: "" keeps the old note, null clears it.
  note: z.string({ error: COPY.sendText }).trim().max(1000, "Keep it under 1000 characters.").nullable().optional(),
});

/**
 * Status and note. `client_says_done` stamps the client's time, `verified`
 * stamps when and who, and going back to `requested` or `pending_client`
 * clears all three. An empty note keeps the old one; null clears it.
 */
export async function updateAccessGrant(ctx: ApiContext, id: string | undefined, raw: unknown): Promise<ApiAccessGrant> {
  const { grant, client } = await findAccessGrant(ctx, id);
  const body = parseBody(patchBody, raw);
  const status = body.status ?? grant.status;
  const notes = body.note === null ? null : body.note ? body.note : grant.notes;
  const extra: Partial<AccessGrant> = {};
  if (status !== grant.status) {
    if (status === "client_says_done" && !grant.client_marked_done_at) extra.client_marked_done_at = new Date().toISOString();
    if (status === "requested" || status === "pending_client") {
      // Asked again: earlier confirmations no longer apply.
      extra.client_marked_done_at = null;
      extra.verified_at = null;
      extra.verified_by = null;
    }
  }
  const updated = await setClientAccessStatus({ grant, status, notes, by: ctx.email, extra, onlyOnChange: true });
  return accessGrantView(updated, await loadPeople(ctx, await memberNames(client.id)));
}
