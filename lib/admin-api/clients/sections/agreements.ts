import { dbError, instant, requireDb } from "@/lib/admin-api";
import type { ClientAgreement } from "@/lib/onboarding-data";
import { msOf } from "./shared";

/**
 * Agreements: read only, in the bundle. The website versions an agreement by
 * its legal date ("2026-09-15"); the app shows a number, so a version that is
 * not a whole number reads as its place among the client's agreements of the
 * same kind (1 for the first one sent).
 */

export const APP_AGREEMENT_STATUSES = ["draft", "sent", "viewed", "signed", "declined", "voided"] as const;
export type AppAgreementStatus = (typeof APP_AGREEMENT_STATUSES)[number];

const STATUS_FROM_DB: Record<ClientAgreement["status"], AppAgreementStatus> = {
  draft: "draft",
  sent: "sent",
  viewed: "viewed",
  signed: "signed",
  declined: "declined",
  // No longer in force either way.
  expired: "voided",
  superseded: "voided",
};

export type ApiAgreement = {
  id: string;
  clientId: string;
  title: string;
  version: number;
  status: AppAgreementStatus;
  sentAt: string | null;
  viewedAt: string | null;
  acceptedAt: string | null;
  acceptedByName: string | null;
  acceptedByEmail: string | null;
  contentHash: string;
};

/** A client's agreements, newest first. */
export async function listAgreementRows(clientId: string): Promise<ClientAgreement[]> {
  const { data, error } = await requireDb()
    .from("client_agreements")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw dbError("client agreements list", error);
  return (data ?? []) as ClientAgreement[];
}

/** The rows as the app shows them (version numbers need the whole list). */
export function agreementViews(rows: readonly ClientAgreement[]): ApiAgreement[] {
  const ordinal = new Map<string, number>();
  const byKind = new Map<string, ClientAgreement[]>();
  for (const row of rows) byKind.set(row.kind, [...(byKind.get(row.kind) ?? []), row]);
  for (const list of byKind.values()) {
    [...list]
      .sort((a, b) => (msOf(a.created_at) ?? 0) - (msOf(b.created_at) ?? 0))
      .forEach((row, i) => ordinal.set(row.id, i + 1));
  }
  return rows.map((row) => ({
    id: row.id,
    clientId: row.client_id,
    title: row.title,
    version: /^\d+$/.test(String(row.version).trim()) ? Number(String(row.version).trim()) : ordinal.get(row.id) ?? 1,
    status: STATUS_FROM_DB[row.status] ?? "voided",
    sentAt: instant(row.sent_at),
    viewedAt: instant(row.viewed_at),
    acceptedAt: instant(row.signed_at),
    acceptedByName: row.signer_name,
    acceptedByEmail: row.signer_email,
    contentHash: row.content_hash ?? "",
  }));
}
