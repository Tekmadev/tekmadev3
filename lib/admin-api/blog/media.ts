import { z } from "zod";
import { BLOG_MEDIA_BUCKET, createBlogMediaUpload, isBlogMediaType } from "@/lib/blog-media";
import { ApiError, MESSAGES, badRequest, notConfigured } from "../errors";
import { bodyObject } from "./posts";
import { BLOG_COPY } from "./shape";

/**
 * POST /blog/media { fileName, size, type } -> { bucket, path, token, publicUrl }:
 * a one-time signed upload slot in the public `blog-media` bucket, minted by
 * the website's own helper (lib/blog-media.ts), the same one the web editor
 * uses. The bytes never come here: the app uploads them with
 * `uploadToSignedUrl(path, token, bytes, { contentType })`.
 *
 * The type is checked first, then the size: a missing size is "That file is
 * empty.", a size that is not a number is 400 `input`.
 */

export type MediaSlot = { bucket: string; path: string; token: string; publicUrl: string };

export async function requestBlogMediaFromApi(raw: unknown): Promise<MediaSlot> {
  const body = bodyObject(raw);
  const typeParse = z.string().safeParse(body.type);
  const type = typeParse.success ? typeParse.data.trim().toLowerCase() : "";
  if (!isBlogMediaType(type)) throw badRequest("type", BLOG_COPY.mediaType);

  if (body.size === undefined || body.size === null) throw badRequest("size", BLOG_COPY.mediaEmpty);
  const size = z.number().safeParse(body.size);
  if (!size.success) throw badRequest("input", MESSAGES.invalid, { size: BLOG_COPY.mediaSizeField });

  const fileName = z.string().safeParse(body.fileName);
  const ticket = await createBlogMediaUpload({ fileName: fileName.success ? fileName.data.trim() : "", size: size.data, type });
  if (!ticket.ok) {
    switch (ticket.code) {
      case "type":
      case "size":
        throw badRequest(ticket.code, ticket.error);
      case "not_configured":
        throw notConfigured();
      case "storage":
        throw new ApiError(500, "unavailable", ticket.error);
    }
    throw new ApiError(500, "unavailable", MESSAGES.unavailable);
  }
  return { bucket: ticket.bucket || BLOG_MEDIA_BUCKET, path: ticket.path, token: ticket.token, publicUrl: ticket.publicUrl };
}
