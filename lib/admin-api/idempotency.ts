import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { ApiError, MESSAGES } from "./errors";

/**
 * Idempotency-Key for creates (contract v1). The app sends a fresh key per
 * intent and the same key when it retries that intent after a timeout, so a
 * create that already happened is answered again instead of done twice.
 *
 * Stored in `admin_api_idempotency` (migration 20261003000002), one row per
 * (user, key), kept 24 hours:
 *   - same key, same method, path and body, finished: the stored status and
 *     body are replayed (header `Idempotent-Replayed: true`)
 *   - same key, different method, path or body: 409 `idempotency_conflict`
 *   - same key while the first request is still running: 409 `idempotency_running`
 *   - a 5xx or a crash is not stored, so the retry runs again
 *
 * If the table is missing (migration not applied yet) the request runs without
 * replay protection and the error is logged: a create must not fail because of it.
 * The route helper calls this for `route({ idempotent: true })`; nothing else
 * should need it.
 */

const TABLE = "admin_api_idempotency";
const RETENTION_MS = 24 * 60 * 60 * 1000;
/** A row still "running" after this long belongs to a crashed request. */
const STALE_RUNNING_MS = 2 * 60 * 1000;
const KEY_RE = /^[\x21-\x7e]{1,200}$/;

export type StoredResponse = { status: number; body: unknown };

type Row = {
  id: number | string;
  method: string;
  path: string;
  request_hash: string;
  status: number | null;
  body: unknown;
  created_at: string;
};

/** JSON with object keys sorted, so `{a,b}` and `{b,a}` hash the same. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export function requestHash(method: string, path: string, body: unknown): string {
  return createHash("sha256").update(`${method.toUpperCase()} ${path}\n${canonicalJson(body)}`).digest("hex");
}

export function isValidIdempotencyKey(key: string): boolean {
  return KEY_RE.test(key);
}

/**
 * Run `execute` at most once per (user, key). Returns what `execute` returned,
 * or the stored response of the first run with `replayed: true`.
 */
export async function withIdempotency(
  opts: { userId: string; key: string; method: string; path: string; body: unknown },
  execute: () => Promise<StoredResponse>,
): Promise<StoredResponse & { replayed: boolean }> {
  if (!isValidIdempotencyKey(opts.key)) {
    throw new ApiError(400, "idempotency_key", "That request carried a bad Idempotency-Key. Update the app and try again.");
  }
  const db = getSupabaseAdmin();
  if (!db) return { ...(await execute()), replayed: false };

  const hash = requestHash(opts.method, opts.path, opts.body);
  const claim = () =>
    db
      .from(TABLE)
      .insert({ user_id: opts.userId, key: opts.key, method: opts.method.toUpperCase(), path: opts.path, request_hash: hash })
      .select("id")
      .single();

  let claimed = await claim();
  for (let attempt = 0; claimed.error && attempt < 2; attempt++) {
    if (claimed.error.code !== "23505") {
      // Not a duplicate (most likely the table does not exist yet): run unprotected.
      console.error("[admin-api] idempotency claim failed; running without replay protection", claimed.error.code, claimed.error.message);
      return { ...(await execute()), replayed: false };
    }
    const { data: existing, error } = await db
      .from(TABLE)
      .select("id,method,path,request_hash,status,body,created_at")
      .eq("user_id", opts.userId)
      .eq("key", opts.key)
      .maybeSingle<Row>();
    if (error) {
      console.error("[admin-api] idempotency lookup failed", error.code, error.message);
      throw new ApiError(500, "unavailable", MESSAGES.unavailable);
    }
    if (!existing) {
      // Removed between our insert and this read: claim again.
      claimed = await claim();
      continue;
    }
    const age = Date.now() - Date.parse(existing.created_at);
    const stale = age > RETENTION_MS || (existing.status === null && age > STALE_RUNNING_MS);
    if (stale) {
      await db.from(TABLE).delete().eq("id", existing.id);
      claimed = await claim();
      continue;
    }
    if (existing.request_hash !== hash || existing.method !== opts.method.toUpperCase() || existing.path !== opts.path) {
      throw new ApiError(409, "idempotency_conflict", MESSAGES.idempotencyConflict);
    }
    if (existing.status === null) throw new ApiError(409, "idempotency_running", MESSAGES.idempotencyRunning);
    return { status: existing.status, body: existing.body, replayed: true };
  }
  if (claimed.error || !claimed.data) {
    console.error("[admin-api] idempotency claim kept failing", claimed.error?.code, claimed.error?.message);
    throw new ApiError(409, "idempotency_running", MESSAGES.idempotencyRunning);
  }
  const rowId = (claimed.data as { id: number | string }).id;

  let result: StoredResponse;
  try {
    result = await execute();
  } catch (err) {
    // Not stored: a retry with the same key runs again.
    await db.from(TABLE).delete().eq("id", rowId);
    throw err;
  }

  if (result.status >= 500) {
    await db.from(TABLE).delete().eq("id", rowId);
  } else {
    const { error } = await db
      .from(TABLE)
      .update({ status: result.status, body: result.body, completed_at: new Date().toISOString() })
      .eq("id", rowId);
    if (error) console.error("[admin-api] idempotency store failed", error.code, error.message);
  }

  // Now and then, drop rows past the 24 hour retention.
  if (Math.random() < 0.05) {
    const cutoff = new Date(Date.now() - RETENTION_MS).toISOString();
    const { error } = await db.from(TABLE).delete().lt("created_at", cutoff);
    if (error) console.error("[admin-api] idempotency cleanup failed", error.code, error.message);
  }

  return { ...result, replayed: false };
}
