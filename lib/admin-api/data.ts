import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";
import { ApiError, MESSAGES, notConfigured } from "./errors";

/**
 * Small helpers every domain uses to read and shape data for the app.
 */

/** The service-role client, or 503 `not_configured` when Supabase env is missing. */
export function requireDb(): SupabaseClient {
  const db = getSupabaseAdmin();
  if (!db) throw notConfigured();
  return db;
}

/**
 * Log a failed query server side (with what was being done) and get the 500
 * the app shows as "Could not load this just now...". Never put the database
 * message in the response.
 *
 *   const { data, error } = await db.from("leads").select("*");
 *   if (error) throw dbError("leads list", error);
 */
export function dbError(what: string, error: { message?: string; code?: string } | null | undefined): ApiError {
  console.error(`[admin-api] ${what} failed`, error?.code ?? "", error?.message ?? "");
  return new ApiError(500, "unavailable", MESSAGES.unavailable);
}

/**
 * An instant for the app: ISO 8601 UTC with the fraction digits exactly as
 * Postgres sent them ("2026-09-30T14:03:22.123456+00:00" becomes
 * "2026-09-30T14:03:22.123456Z"). String work only: a JS Date keeps
 * milliseconds and would corrupt cursors and watermarks the app sends back.
 * A value in another offset is shifted to UTC with its fraction kept.
 */
export function instant(value: string): string;
export function instant(value: string | null | undefined): string | null;
export function instant(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = value.trim().match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}(?::?\d{2})?)?$/i);
  if (!m) return value;
  const [, date, time, fraction = "", zone = "Z"] = m;
  const normalizedZone = zone.toUpperCase();
  if (normalizedZone === "Z" || /^[+-]00(:?00)?$/.test(normalizedZone)) return `${date}T${time}${fraction}Z`;
  // Whole seconds through Date (exact), the fraction carried over as text.
  const offset = normalizedZone.length === 3 ? `${normalizedZone}:00` : normalizedZone.replace(/^([+-]\d{2})(\d{2})$/, "$1:$2");
  const base = new Date(`${date}T${time}${offset}`);
  if (Number.isNaN(base.getTime())) return value;
  return `${base.toISOString().slice(0, 19)}${fraction}Z`;
}

/** Money for the app: integer cents with a currency (CAD unless the row says otherwise). */
export function money(cents: number | null | undefined, currency?: string | null): { amount: number; currency: string } {
  return { amount: Math.round(Number(cents ?? 0)) || 0, currency: (currency || "CAD").toUpperCase() };
}

/** Same as money(), but null stays null (an amount that does not exist is not $0). */
export function moneyOrNull(cents: number | null | undefined, currency?: string | null): { amount: number; currency: string } | null {
  return cents === null || cents === undefined ? null : money(cents, currency);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether an id param looks like a uuid. Use it to answer 404 before Postgres errors on a bad uuid. */
export function isUuid(value: string | null | undefined): value is string {
  return !!value && UUID_RE.test(value);
}
