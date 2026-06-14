import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Next.js 16 proxy (formerly middleware). Only runs on the admin area so the
// marketing site keeps its static performance.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const proxyConfig = {
  matcher: ["/admin", "/admin/:path*"],
};
