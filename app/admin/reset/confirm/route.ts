import { type NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Landing point for the password reset email link. The Supabase "Reset
 * password" template sends users here with a token_hash. We verify it
 * (server-side, so it works across devices, no PKCE cookie needed), which
 * establishes a recovery session, then send them to the set-new-password page.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  if (tokenHash && type === "recovery") {
    const supabase = await createSupabaseServerClient();
    if (supabase) {
      const { error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
      if (!error) redirect("/admin/reset");
      console.error("[reset/confirm] verifyOtp failed", error?.message);
    }
  }

  redirect("/admin/forgot?e=expired");
}
