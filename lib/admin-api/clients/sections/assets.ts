import { ApiError, MESSAGES, dbError, instant, isUuid, notFound, requireDb, type ApiContext } from "@/lib/admin-api";
import { ASSET_BUCKET, type AssetKind, type ClientAsset } from "@/lib/onboarding-data";
import { findSectionClient, type People } from "./shared";

/**
 * Files: the list in the bundle (each with a signed URL) and a fresh URL once
 * one has expired (POST /assets/:id/sign). Objects live in the private
 * `client-assets` bucket; nothing here makes them public.
 */

export const APP_ASSET_KINDS = ["logo", "photo", "brand", "document", "video", "other"] as const;
export type AppAssetKind = (typeof APP_ASSET_KINDS)[number];

const KIND_FROM_DB: Record<AssetKind, AppAssetKind> = {
  logo: "logo",
  photo: "photo",
  brand_guide: "brand",
  document: "document",
  video: "video",
  other: "other",
};

/** Signed URLs last an hour. */
const SIGN_SECONDS = 60 * 60;
/** expiresAt is reported a minute early, so the app re-signs before a URL actually stops working. */
const EXPIRY_MARGIN_SECONDS = 60;

export type ApiSignedAsset = { url: string; thumbnailUrl: string | null; expiresAt: string };

export type ApiAsset = {
  id: string;
  clientId: string;
  fileName: string;
  kind: AppAssetKind;
  mime: string;
  sizeBytes: number;
  url: string;
  expiresAt: string;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
  uploadedAt: string;
  uploadedBy: string | null;
};

const isImage = (row: ClientAsset) => (row.mime_type ?? "").toLowerCase().startsWith("image/");

/** The signed URL as the app wants it. Images use the same URL as their thumbnail (no resize service is assumed). */
function signedView(row: ClientAsset, signedUrl: string, issuedAt: number): ApiSignedAsset {
  return {
    url: signedUrl,
    thumbnailUrl: isImage(row) ? signedUrl : null,
    expiresAt: new Date(issuedAt + (SIGN_SECONDS - EXPIRY_MARGIN_SECONDS) * 1000).toISOString(),
  };
}

export function assetView(row: ClientAsset, signed: ApiSignedAsset, people: People): ApiAsset {
  return {
    id: row.id,
    clientId: row.client_id,
    fileName: row.file_name,
    kind: KIND_FROM_DB[row.kind] ?? "other",
    mime: row.mime_type || "application/octet-stream",
    sizeBytes: Math.max(0, Math.round(Number(row.size_bytes ?? 0)) || 0),
    url: signed.url,
    expiresAt: signed.expiresAt,
    thumbnailUrl: signed.thumbnailUrl,
    width: row.width ?? null,
    height: row.height ?? null,
    uploadedAt: instant(row.created_at),
    uploadedBy: people.display(row.uploaded_by),
  };
}

/** A client's files (not deleted), newest first. */
export async function listAssetRows(clientId: string): Promise<ClientAsset[]> {
  const { data, error } = await requireDb()
    .from("client_assets")
    .select("*")
    .eq("client_id", clientId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw dbError("client assets list", error);
  return (data ?? []) as ClientAsset[];
}

/**
 * The files with fresh signed URLs, one Storage call per bucket. A file whose
 * object is missing from Storage is left out (and logged) rather than sent
 * with a URL that cannot open; a Storage outage fails the whole read.
 */
export async function signedAssets(rows: readonly ClientAsset[], people: People): Promise<ApiAsset[]> {
  if (rows.length === 0) return [];
  const storage = requireDb().storage;
  const issuedAt = Date.now();
  const byBucket = new Map<string, ClientAsset[]>();
  for (const row of rows) {
    const bucket = row.bucket || ASSET_BUCKET;
    byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), row]);
  }
  const urls = new Map<string, string>();
  for (const [bucket, list] of byBucket) {
    const { data, error } = await storage.from(bucket).createSignedUrls(
      list.map((r) => r.storage_path),
      SIGN_SECONDS,
    );
    if (error) throw dbError("client assets signing", { message: error.message });
    for (const item of data ?? []) {
      if (item.path && item.signedUrl && !item.error) urls.set(`${bucket}\u0000${item.path}`, item.signedUrl);
    }
  }
  const out: ApiAsset[] = [];
  for (const row of rows) {
    const url = urls.get(`${row.bucket || ASSET_BUCKET}\u0000${row.storage_path}`);
    if (!url) {
      console.error("[admin-api] client asset could not be signed", row.id);
      continue;
    }
    out.push(assetView(row, signedView(row, url, issuedAt), people));
  }
  return out;
}

const FILE_MISSING = "That file";

/** POST /assets/:id/sign: a fresh URL (and thumbnail) for one file the caller may see. */
export async function signAsset(ctx: ApiContext, id: string | undefined): Promise<ApiSignedAsset> {
  if (!isUuid(id)) throw notFound(FILE_MISSING);
  const db = requireDb();
  const { data, error } = await db.from("client_assets").select("*").eq("id", id).maybeSingle();
  if (error) throw dbError("client asset lookup", error);
  const row = (data as ClientAsset | null) ?? null;
  if (!row || row.deleted_at) throw notFound(FILE_MISSING);
  await findSectionClient(ctx, row.client_id, FILE_MISSING);
  const issuedAt = Date.now();
  const signed = await db.storage.from(row.bucket || ASSET_BUCKET).createSignedUrl(row.storage_path, SIGN_SECONDS);
  if (signed.error || !signed.data?.signedUrl) {
    console.error("[admin-api] client asset signing failed", row.id, signed.error?.message ?? "");
    throw new ApiError(500, "unavailable", MESSAGES.unavailable);
  }
  return signedView(row, signed.data.signedUrl, issuedAt);
}
