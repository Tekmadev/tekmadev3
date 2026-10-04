import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * Blog images live in the public `blog-media` Storage bucket
 * (supabase/migrations/20260930000001_blog_media_bucket.sql). The browser
 * uploads straight to Storage with a one-time signed URL minted here, the
 * same pattern as client files (components/portal/AssetUploader.tsx), so an
 * image never passes through our servers and no request-size limit applies.
 */
export const BLOG_MEDIA_BUCKET = "blog-media";
export const BLOG_MEDIA_MAX_BYTES = 10 * 1024 * 1024;

const TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};

/**
 * Why a ticket was refused: `type` (not an image type the bucket takes),
 * `size` (empty or over 10 MB), `not_configured` (no Supabase env) or
 * `storage` (Storage did not mint the URL). The admin API maps these to its
 * statuses; the web editor only shows `error`.
 */
export type BlogMediaFailure = "type" | "size" | "not_configured" | "storage";

export type BlogMediaTicket =
  | { ok: true; bucket: string; path: string; token: string; publicUrl: string }
  | { ok: false; error: string; code: BlogMediaFailure };

/** Whether the bucket takes this MIME type (PNG, JPG, WebP, AVIF or GIF; never SVG). */
export function isBlogMediaType(type: string): boolean {
  return Object.prototype.hasOwnProperty.call(TYPES, type);
}

function baseName(name: string): string {
  const stem = name.replace(/\.[^.]*$/, "");
  return (
    stem
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "image"
  );
}

/**
 * Validates the file the browser is about to send and returns where to send
 * it. Paths are `posts/YYYY/MM/<name>-<8 random>.<ext>`: readable in the
 * Storage dashboard, and never overwrite an earlier upload.
 */
export async function createBlogMediaUpload(input: {
  fileName: string;
  size: number;
  type: string;
}): Promise<BlogMediaTicket> {
  const ext = isBlogMediaType(input.type) ? TYPES[input.type] : undefined;
  if (!ext) return { ok: false, error: "Use a PNG, JPG, WebP, AVIF or GIF image.", code: "type" };
  if (!Number.isFinite(input.size) || input.size <= 0) return { ok: false, error: "That file is empty.", code: "size" };
  if (input.size > BLOG_MEDIA_MAX_BYTES) return { ok: false, error: "That image is over 10 MB. Compress it and try again.", code: "size" };

  const db = getSupabaseAdmin();
  if (!db) return { ok: false, error: "Storage is not configured.", code: "not_configured" };

  const now = new Date();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const path = `posts/${now.getUTCFullYear()}/${month}/${baseName(input.fileName)}-${randomUUID().slice(0, 8)}.${ext}`;

  const { data, error } = await db.storage.from(BLOG_MEDIA_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error("[blog-media] signed upload failed", error?.message);
    return { ok: false, error: "Could not start the upload. Try again.", code: "storage" };
  }
  const { data: pub } = db.storage.from(BLOG_MEDIA_BUCKET).getPublicUrl(data.path);
  return { ok: true, bucket: BLOG_MEDIA_BUCKET, path: data.path, token: data.token, publicUrl: pub.publicUrl };
}
