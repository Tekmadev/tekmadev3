import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client using the Secret (service-role) key, which
 * bypasses row-level security. NEVER import this into a client component or any
 * code that ships to the browser.
 *
 * Returns null when the env is not configured so every caller (webhooks,
 * consent log) can degrade gracefully instead of throwing.
 */
let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (cached) return cached;
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
