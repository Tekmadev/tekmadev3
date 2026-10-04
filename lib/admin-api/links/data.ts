import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deleteLink, insertLink, isReservedSlug, setLinkActive } from "@/lib/links-data";
import { decodeCursor, keysetFilter, toPage, type Page } from "../cursor";
import { dbError } from "../data";
import { ApiError, MESSAGES, conflict, notFound, notConfigured } from "../errors";
import {
  CLICK_COLUMNS,
  LINK_COLUMNS,
  LINK_COPY,
  LINK_DESTINATION_MAX,
  LINK_HTTPS_RE,
  LINK_PATH_RE,
  LINK_SLUG_MAX,
  LINK_SLUG_RE,
  toLinkClick,
  toShortLink,
  type ApiLinkClick,
  type ApiShortLink,
  type ClickDbRow,
  type LinkDbRow,
} from "./shape";

/**
 * Reads and writes behind the links endpoints. Writes go through the
 * website's own functions (lib/links-data.ts insertLink, setLinkActive,
 * deleteLink), the ones the web admin's link actions use.
 *
 * Links cannot be edited after creation: PATCH only switches `active`.
 * Deleting keeps the click history (link_clicks rows keep the link id) and
 * frees the slug.
 */

const missing = () => notFound(LINK_COPY.missing);

/** The web admin's links page shows the change too. Runs after the write, so a failure is only logged. */
function refreshAdminLinks(): void {
  try {
    revalidatePath("/admin/links");
  } catch (err) {
    console.error("[admin-api] revalidate /admin/links failed", err instanceof Error ? err.message : String(err));
  }
}

/** Postgres "invalid input syntax" (a malformed id): the row can not exist. */
const isBadId = (error: { code?: string } | null) => error?.code === "22P02";

/** GET /links: every link, newest first, with its click counter. */
export async function listApiLinks(db: SupabaseClient): Promise<ApiShortLink[]> {
  const { data, error } = await db.from("links").select(LINK_COLUMNS).order("created_at", { ascending: false }).order("id", { ascending: false });
  if (error) throw dbError("links list", error);
  return ((data ?? []) as LinkDbRow[]).map(toShortLink);
}

export async function getLinkRow(db: SupabaseClient, id: string): Promise<LinkDbRow | null> {
  if (!id) return null;
  const { data, error } = await db.from("links").select(LINK_COLUMNS).eq("id", id).maybeSingle();
  if (error) {
    if (isBadId(error)) return null;
    throw dbError("link read", error);
  }
  return (data as LinkDbRow | null) ?? null;
}

/* ------------------------------------------------------------------ */
/* Create                                                              */
/* ------------------------------------------------------------------ */

type Body = Record<string, unknown>;

/** Optional text (UTM fields, label): trimmed, blank or not text becomes null. */
function optionalText(value: unknown): string | null {
  const parsed = z.string().safeParse(value);
  if (!parsed.success) return null;
  return parsed.data.trim() || null;
}

/**
 * POST /links { slug, destination?, utmSource?, utmMedium?, utmCampaign?, label? } -> 201 ShortLink.
 * The slug is trimmed and lowercased, then must be letters, numbers and
 * single dashes (60 at most) and not reserved. The destination defaults to
 * "/" and is a site path or a full https:// URL. When several fields are
 * wrong, `code` names the slug problem first and `fields` carries every one.
 */
export async function createLinkFromApi(db: SupabaseClient, raw: unknown): Promise<ApiShortLink> {
  const bodyParse = z.record(z.string(), z.unknown()).safeParse(raw);
  if (!bodyParse.success) throw new ApiError(400, "input", MESSAGES.invalid);
  const body: Body = bodyParse.data;

  const slugParse = z.string().safeParse(body.slug);
  const slug = slugParse.success ? slugParse.data.trim().toLowerCase() : "";

  const rawDestination = body.destination;
  const destinationParse = z.string().safeParse(rawDestination);
  const destination =
    rawDestination === undefined || rawDestination === null || rawDestination === ""
      ? "/"
      : destinationParse.success
        ? destinationParse.data.trim()
        : "";

  const fields: Record<string, string> = {};
  let code: "slug" | "reserved" | "destination" | null = null;
  if (!LINK_SLUG_RE.test(slug) || slug.length > LINK_SLUG_MAX) {
    fields.slug = LINK_COPY.slug;
    code = "slug";
  } else if (isReservedSlug(slug)) {
    fields.slug = LINK_COPY.reserved;
    code = "reserved";
  }
  const destinationOk =
    destination.length <= LINK_DESTINATION_MAX && (LINK_PATH_RE.test(destination) || LINK_HTTPS_RE.test(destination));
  if (!destinationOk) {
    fields.destination = LINK_COPY.destination;
    code = code ?? "destination";
  }
  if (code) {
    const message = code === "destination" ? LINK_COPY.destination : (fields.slug ?? LINK_COPY.slug);
    throw new ApiError(400, code, message, fields);
  }

  const dupe = () => conflict("dupe", LINK_COPY.dupe, { slug: LINK_COPY.dupe });
  const { data: existing, error: lookupError } = await db.from("links").select("id").eq("slug", slug).limit(1);
  if (lookupError) throw dbError("link slug lookup", lookupError);
  if ((existing ?? []).length > 0) throw dupe();

  const result = await insertLink({
    slug,
    destination,
    utm_source: optionalText(body.utmSource),
    utm_medium: optionalText(body.utmMedium),
    utm_campaign: optionalText(body.utmCampaign),
    label: optionalText(body.label),
  });
  if (!result.ok) {
    if (result.reason === "dupe") throw dupe();
    if (result.reason === "config") throw notConfigured();
    throw new ApiError(500, "unavailable", MESSAGES.unavailable);
  }
  refreshAdminLinks();
  return toShortLink(result.link as LinkDbRow);
}

/* ------------------------------------------------------------------ */
/* Enable, disable, delete                                             */
/* ------------------------------------------------------------------ */

/** PATCH /links/:id { active }: 404 first, then 400 `active` when it is not a boolean. Other keys are ignored. */
export async function setLinkActiveFromApi(db: SupabaseClient, id: string, raw: unknown): Promise<ApiShortLink> {
  const current = await getLinkRow(db, id);
  if (!current) throw missing();
  const body = z.record(z.string(), z.unknown()).safeParse(raw);
  const active = z.boolean().safeParse(body.success ? body.data.active : undefined);
  if (!active.success) throw new ApiError(400, "active", LINK_COPY.active, { active: LINK_COPY.active });

  const result = await setLinkActive(String(current.id), active.data);
  if (!result.ok) {
    if (result.reason === "config") throw notConfigured();
    throw new ApiError(500, "unavailable", MESSAGES.unavailable);
  }
  if (!result.link) throw missing();
  refreshAdminLinks();
  return toShortLink(result.link as LinkDbRow);
}

/** DELETE /links/:id -> null. The clicks stay on record; the slug can be reused. */
export async function deleteLinkFromApi(db: SupabaseClient, id: string): Promise<null> {
  const current = await getLinkRow(db, id);
  if (!current) throw missing();
  const result = await deleteLink(String(current.id));
  if (!result.ok) {
    if (result.reason === "config") throw notConfigured();
    throw new ApiError(500, "unavailable", MESSAGES.unavailable);
  }
  if (!result.deleted) throw missing();
  refreshAdminLinks();
  return null;
}

/* ------------------------------------------------------------------ */
/* Clicks                                                              */
/* ------------------------------------------------------------------ */

/** Whether any click was logged for this link id (a deleted link's history is still readable). */
async function hasClicks(db: SupabaseClient, linkId: string): Promise<boolean> {
  const { data, error } = await db.from("link_clicks").select("id").eq("link_id", linkId).limit(1);
  if (error) {
    if (isBadId(error)) return false;
    throw dbError("link clicks lookup", error);
  }
  return (data ?? []).length > 0;
}

const clickCursor = z.tuple([z.string(), z.union([z.string(), z.number()])]);

/**
 * GET /links/clicks?linkId=&cursor=&limit=: newest first, for one link or
 * every link. A link id that is neither a link nor in the click log is 404.
 */
export async function listClickPage(
  db: SupabaseClient,
  opts: { linkId?: string; cursor?: string; limit: number },
): Promise<Page<ApiLinkClick>> {
  const linkId = opts.linkId?.trim() || undefined;
  if (linkId && !(await getLinkRow(db, linkId)) && !(await hasClicks(db, linkId))) throw missing();

  const after = decodeCursor(opts.cursor, clickCursor);
  let query = db
    .from("link_clicks")
    .select(CLICK_COLUMNS)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(opts.limit + 1);
  if (linkId) query = query.eq("link_id", linkId);
  if (after) query = query.or(keysetFilter(["created_at", "id"], after, "desc"));
  const { data, error } = await query;
  if (error) throw dbError("link clicks list", error);
  return toPage((data ?? []) as ClickDbRow[], opts.limit, (row) => [row.created_at, row.id], toLinkClick);
}
