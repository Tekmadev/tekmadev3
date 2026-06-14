import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * Records a cookie-consent choice in `consent_log` (Law 25 demonstrable
 * consent). Called best-effort from the client on Accept / Decline. Always
 * returns 200-ish quietly so it never disrupts the visitor; problems are logged.
 */
export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false });

  let body: {
    choice?: string;
    anonymous_id?: string;
    policy_version?: string;
    path?: string;
    utm_source?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (body.choice !== "granted" && body.choice !== "denied") {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const str = (v: unknown, max: number) =>
    typeof v === "string" && v.length > 0 ? v.slice(0, max) : null;

  try {
    await supabase.from("consent_log").insert({
      choice: body.choice,
      anonymous_id: str(body.anonymous_id, 64),
      policy_version: str(body.policy_version, 32),
      path: str(body.path, 256),
      user_agent: (req.headers.get("user-agent") || "").slice(0, 512) || null,
      utm_source: str(body.utm_source, 128),
    });
  } catch (err) {
    console.error("[consent] insert error", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
