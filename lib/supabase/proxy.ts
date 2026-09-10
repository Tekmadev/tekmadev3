import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase auth session for a request so server components
 * always see a valid token, and writes the refreshed cookies onto the
 * response. `target` turns the response into a rewrite (used by the portal
 * subdomain) instead of a plain pass-through. No-ops when auth env is absent.
 */
export async function updateSession(request: NextRequest, target?: URL): Promise<NextResponse> {
  const make = () => (target ? NextResponse.rewrite(target, { request }) : NextResponse.next({ request }));
  let response = make();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = make();
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Do not run other code between creating the client and this call; it refreshes
  // the token and writes the updated cookies onto the response.
  await supabase.auth.getUser();

  return response;
}
