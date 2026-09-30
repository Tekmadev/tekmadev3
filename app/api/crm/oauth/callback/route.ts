import { NextResponse, type NextRequest } from "next/server";
import { business } from "@/config/site";
import { crmAppConfig, crmConfig, writeCrmSetting } from "@/lib/crm/config";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Where the CRM sends the browser after the owner installs the private webhook
 * app, with a one-time ?code= on the end.
 *
 * The platform requires a redirect URL on every app, and its install is only
 * complete once that code is traded for a token. So this route makes the
 * trade, keeps the facts (which account, when) and throws the token away: the
 * site never calls the API as the app, because everything it sends goes out
 * with the sub-account token instead. No token stored means none to leak and
 * none to refresh.
 *
 * No login is required, and none could be: a redirect to the admin login would
 * drop the code. The code itself is the credential, it is single use, and it
 * only trades successfully together with our client secret and this exact
 * redirect URL. The worst a stranger can do here is fail an exchange.
 *
 * The path is neutral on purpose, like /api/webhooks/crm: the vendor may be
 * named in the admin, but a URL on our own domain is a needless disclosure.
 */

const TOKEN_URL = "https://services.leadconnectorhq.com/oauth/token";
// Must match the Redirect URL saved in the app, character for character,
// or the exchange is refused. Always the www host: the bare domain redirects.
const REDIRECT_URI = `${business.url}/api/crm/oauth/callback`;

function done(query: string) {
  return NextResponse.redirect(`${business.url}/admin/crm?${query}`, 303);
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

export async function GET(req: NextRequest) {
  // A real install arrives once. Anything faster is someone replaying codes.
  if (!rateLimit(`crm-oauth:${clientIp(req.headers)}`, 10, 10 * 60 * 1000).ok) return done("e=app_rate");

  const query = req.nextUrl.searchParams;
  if (query.get("error")) return done("e=app_denied");
  const code = query.get("code")?.trim() ?? "";
  if (!code || code.length > 4096) return done("e=app_nocode");

  const app = crmAppConfig();
  if (!app) return done("e=app_not_configured");

  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      // user_type is left out on purpose: an agency install and a sub-account
      // install return different kinds of token, and naming one refuses the other.
      body: new URLSearchParams({
        client_id: app.clientId,
        client_secret: app.clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    console.error("[crm oauth] token exchange failed to send", err instanceof Error ? err.message : String(err));
    return done("e=app_exchange");
  }

  const text = await res.text();
  if (!res.ok) {
    // The body is their error message, never our secret, and the code is spent
    // either way, so logging it is safe and the only way to diagnose a refusal.
    console.error("[crm oauth] token exchange refused", res.status, text.slice(0, 400));
    return done("e=app_exchange");
  }

  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
  } catch {
    // A 200 we cannot read still completed the install on their side.
  }

  const locationId = str(body.locationId);
  const ours = !!locationId && locationId === crmConfig()?.locationId;
  const saved = await writeCrmSetting(
    "crm_app",
    {
      installedAt: new Date().toISOString(),
      userType: str(body.userType),
      locationId,
      companyId: str(body.companyId),
      ours,
    },
    "app-install",
  );
  if (!saved) console.error("[crm oauth] install succeeded but could not be recorded");

  return done(`ok=app_connected${ours ? "" : "&where=other"}`);
}
