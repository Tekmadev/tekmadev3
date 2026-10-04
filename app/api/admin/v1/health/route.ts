import { publicRoute } from "@/lib/admin-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /health: no sign-in. Says the API is up and which deploy answered, so
 * the app (or a person with curl) can tell "server down" from "signed out".
 * Nothing private: no settings, no counts, no user data.
 */
export const GET = publicRoute({ method: "GET" }, () => ({
  status: "ok",
  api: "v1",
  commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
}));
