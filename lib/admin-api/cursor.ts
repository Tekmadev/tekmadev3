import { z } from "zod";
import { ApiError, MESSAGES } from "./errors";

/**
 * Lists: `?cursor=&limit=` (limit default 30, max 100) answer
 * `{ items, nextCursor }` (contract v1). Cursors are keyset cursors: the sort
 * values of the last row sent, so a row inserted or bumped between two page
 * loads is never repeated or skipped.
 *
 * A cursor is opaque to the app: base64url of a JSON array of the sort tuple.
 * Timestamps go in as the exact strings Postgres returned (microseconds
 * intact) and come back out unchanged; never route them through a JS Date,
 * which keeps only milliseconds and would skip or repeat rows.
 *
 * Typical list (newest first by created_at, ties by id):
 *
 *   const { limit, cursor } = input.query;            // from pageQuery
 *   const after = decodeCursor(cursor, z.tuple([z.string(), z.string()]));
 *   let q = db.from("leads").select("*").order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
 *   if (after) q = q.or(keysetFilter(["created_at", "id"], after, "desc"));
 *   const { data, error } = await q;
 *   if (error) throw dbError("leads list", error);
 *   return toPage(data, limit, (row) => [row.created_at, row.id], toLead);
 */

export const DEFAULT_LIMIT = 30;
export const MAX_LIMIT = 100;

export type CursorPart = string | number | boolean | null;
export type Page<T> = { items: T[]; nextCursor: string | null };

const cursorError = () => new ApiError(400, "cursor", MESSAGES.cursor);

export function encodeCursor(tuple: readonly CursorPart[]): string {
  return Buffer.from(JSON.stringify(tuple), "utf8").toString("base64url");
}

/**
 * The sort tuple from a cursor, or null when there is none (the first page).
 * A cursor that does not decode, or does not match `shape`, is a 400 `cursor`
 * "That page is out of date. Pull to refresh.".
 */
export function decodeCursor(raw: string | null | undefined): CursorPart[] | null;
export function decodeCursor<S extends z.ZodType>(raw: string | null | undefined, shape: S): z.output<S> | null;
export function decodeCursor(raw: string | null | undefined, shape?: z.ZodType): unknown {
  if (raw === null || raw === undefined || raw === "") return null;
  if (raw.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(raw)) throw cursorError();
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    throw cursorError();
  }
  if (!Array.isArray(parsed)) throw cursorError();
  if (!shape) return parsed as CursorPart[];
  const checked = shape.safeParse(parsed);
  if (!checked.success) throw cursorError();
  return checked.data;
}

/** A `limit` query value clamped to 1..100, default 30 (bad values fall back, never 400). */
export function clampLimit(raw: unknown, fallback = DEFAULT_LIMIT): number {
  const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), 1), MAX_LIMIT);
}

/** zod pieces for list queries: spread into a query schema, `z.object({ ...pageQuery, q: ... })`. */
export const pageQuery = {
  cursor: z.string().optional(),
  limit: z.unknown().optional().transform((v) => clampLimit(v)),
};

/** The same, for a list whose default page size is not 30. */
export function pageQueryWith(defaultLimit: number) {
  return { cursor: z.string().optional(), limit: z.unknown().optional().transform((v) => clampLimit(v, defaultLimit)) };
}

/**
 * The page answer from `limit + 1` fetched rows: the extra row only tells
 * whether there is a next page. `cursorOf` gives the sort tuple of a row,
 * `map` turns a row into the API item.
 */
export function toPage<Row, Item = Row>(
  rows: readonly Row[] | null | undefined,
  limit: number,
  cursorOf: (row: Row) => readonly CursorPart[],
  map?: (row: Row) => Item,
): Page<Item> {
  const list = rows ?? [];
  const pageRows = list.slice(0, limit);
  const hasMore = list.length > limit && pageRows.length > 0;
  return {
    items: map ? pageRows.map(map) : (pageRows as unknown as Item[]),
    nextCursor: hasMore ? encodeCursor(cursorOf(pageRows[pageRows.length - 1])) : null,
  };
}

/**
 * Page over an array already sorted in memory (small tables, computed lists).
 * The cursor holds the offset; prefer keyset paging for database lists.
 */
export function pageArray<T>(items: readonly T[], limit: number, cursor: string | null | undefined): Page<T> {
  const decoded = decodeCursor(cursor, z.tuple([z.literal("o"), z.number().int().min(0)]));
  const offset = decoded ? decoded[1] : 0;
  const slice = items.slice(offset, offset + limit);
  const next = offset + limit < items.length ? encodeCursor(["o", offset + limit]) : null;
  return { items: slice, nextCursor: next };
}

/** A PostgREST filter value in double quotes, so commas, dots, colons and brackets are literal. */
export function pgQuote(value: string | number | boolean): string {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * The `.or()` filter for "rows after this cursor" on a two-column keyset:
 * `(a, b) < (va, vb)` for "desc", `(a, b) > (va, vb)` for "asc". Both columns
 * must be ordered the same direction in the query, and `b` must be unique (id).
 */
export function keysetFilter(
  columns: readonly [string, string],
  values: readonly [string | number, string | number],
  direction: "asc" | "desc",
): string {
  const op = direction === "desc" ? "lt" : "gt";
  const [a, b] = columns;
  const [va, vb] = values;
  return `${a}.${op}.${pgQuote(va)},and(${a}.eq.${pgQuote(va)},${b}.${op}.${pgQuote(vb)})`;
}
