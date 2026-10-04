import type { ApiContext, Page } from "@/lib/admin-api";
import type { Client } from "@/lib/clients-data";
import { accessGrantView, listAccessGrantRows, type ApiAccessGrant } from "./access";
import { activityPage, hiddenActivityPrefixes, type ApiActivity } from "./activity";
import { agreementViews, listAgreementRows, type ApiAgreement } from "./agreements";
import { approvalView, listApprovalRows, type ApiApproval } from "./approvals";
import { listAssetRows, signedAssets, type ApiAsset } from "./assets";
import { BUNDLE_CALLS, callView, guaranteeFor, listCallRows, type ApiCall, type ApiGuarantee } from "./calls";
import { loadCrmLocation, type ApiCrmLocation } from "./crm";
import { listMemberRows, memberView, type ApiMember } from "./members";
import { loadPeople } from "./shared";

/**
 * The client detail sections for GET /clients/:id (the bundle is built by the
 * clients core routes; these are its section parts):
 *
 *   const sections = await loadClientSections(ctx, client);
 *   return { client: clientView(client), billing, onboarding, intake, ...sections };
 *
 * `crmLocation` is present only for callers holding `clients.crm` (owners):
 * for everyone else the key is absent, not null. `activity` is the first page
 * (newest first, ACTIVITY_PAGE entries). `client` must be a row the caller
 * may see (not deleted; test clients only with `testdata.view`).
 */

export type ClientSections = {
  accessGrants: ApiAccessGrant[];
  assets: ApiAsset[];
  approvals: ApiApproval[];
  agreements: ApiAgreement[];
  calls: ApiCall[];
  guarantee: ApiGuarantee;
  crmLocation?: ApiCrmLocation;
  members: ApiMember[];
  activity: Page<ApiActivity>;
};

/** Entries in the bundle's first activity page (the app's ACTIVITY_PAGE_SIZE). */
export const ACTIVITY_PAGE = 30;

export async function loadClientSections(ctx: ApiContext, client: Client): Promise<ClientSections> {
  const withCrm = ctx.can("clients.crm");
  const [grants, assets, approvals, agreements, calls, members, crmLocation] = await Promise.all([
    listAccessGrantRows(client.id),
    listAssetRows(client.id),
    listApprovalRows(client.id),
    listAgreementRows(client.id),
    listCallRows(client.id),
    listMemberRows(client.id),
    withCrm ? loadCrmLocation(client.id) : Promise.resolve(null),
  ]);
  const people = await loadPeople(ctx, members);
  const [assetViews, activity] = await Promise.all([
    signedAssets(assets, people),
    activityPage(client.id, { limit: ACTIVITY_PAGE, hide: hiddenActivityPrefixes(ctx) }, people),
  ]);
  return {
    accessGrants: grants.map((row) => accessGrantView(row, people)),
    assets: assetViews,
    approvals: approvals.map((row) => approvalView(row, people)),
    agreements: agreementViews(agreements),
    calls: calls.slice(0, BUNDLE_CALLS).map((row) => callView(row, client, people)),
    guarantee: guaranteeFor(client, calls),
    ...(withCrm && crmLocation ? { crmLocation } : {}),
    members: members.map(memberView),
    activity,
  };
}

export { guaranteeFor, loadGuarantee, loadCallsAndGuarantee, listCallRows, callView } from "./calls";
export type { ApiCall, ApiGuarantee } from "./calls";
export { loadCrmLocation } from "./crm";
export type { ApiCrmLocation } from "./crm";
export { activityPage, activityView, hiddenActivityPrefixes } from "./activity";
export type { ApiActivity } from "./activity";
export type { ApiAccessGrant } from "./access";
export type { ApiAsset, ApiSignedAsset } from "./assets";
export type { ApiApproval } from "./approvals";
export type { ApiAgreement } from "./agreements";
export type { ApiMember } from "./members";
export { findSectionClient, loadPeople, torontoDate } from "./shared";
export type { People } from "./shared";
export { sectionsMeta, sectionActivityEvents } from "./meta";
