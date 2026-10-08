import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * Lead conversion for demo requests (docs/admin-api/demos.md): when a lead
 * becomes a client, its demo requests get that client id and keep the lead
 * id, so they show on the client too. Requests already tied to a client keep
 * theirs.
 *
 * Called wherever a client gets its lead (lib/client-provisioning.ts, the
 * admin API's POST /clients `leadId`). A leaf (only the Supabase client), and
 * it never throws: provisioning runs inside the Stripe webhook, and a demo
 * link is never worth failing that. Before the demo requests migration it
 * does nothing.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The demo requests migration (20261005000100) is not applied yet. */
export function demoSchemaMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return ["42P01", "42703", "PGRST204", "PGRST205"].includes(error.code ?? "") && /demo_request/.test(error.message ?? "");
}

/** How many requests got the client (0 on any problem, which is logged). */
export async function linkDemoRequestsToClient(leadId: string | null | undefined, clientId: string | null | undefined): Promise<number> {
  try {
    if (!leadId || !clientId || !UUID_RE.test(leadId) || !UUID_RE.test(clientId)) return 0;
    const db = getSupabaseAdmin();
    if (!db) return 0;
    const { data, error } = await db
      .from("demo_requests")
      .update({ client_id: clientId })
      .eq("lead_id", leadId)
      .is("client_id", null)
      .select("id");
    if (error) {
      if (!demoSchemaMissing(error)) console.error("[demos] linking a converted lead's demo requests failed", error.code, error.message);
      return 0;
    }
    return (data ?? []).length;
  } catch (err) {
    console.error("[demos] linking a converted lead's demo requests threw", err instanceof Error ? err.message : String(err));
    return 0;
  }
}
