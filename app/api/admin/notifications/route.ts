import { NextResponse, type NextRequest } from "next/server";
import { getAdminContext, getAdminContextFromBearer } from "@/lib/admin";
import {
  decodeCursor,
  encodeCursor,
  getNotificationPrefs,
  getNotificationSummary,
  isCategory,
  listNotifications,
  markAllNotificationsRead,
  markNotificationsRead,
  setCategoryPref,
  setNotificationResolved,
  type NotificationFilter,
} from "@/lib/admin-notifications-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The admin inbox as JSON. The bell polls it today; it is also the contract a
 * mobile app will read, so it returns plain data and nothing about how the web
 * admin renders it.
 *
 * Auth: a browser session cookie, or `Authorization: Bearer <Supabase access
 * token>` for a client that has no cookies. Either way the account must be on
 * the staff list. Anything else is a 401 with no detail.
 *
 * GET  ?filter=all|unread|action &category= &test=1 &cursor=<opaque> &limit= &prefs=1
 *      -> { ok, summary: { unread, needsAction, criticalUnread }, items, nextCursor, prefs? }
 * POST { action: "read", ids } | { action: "read_all", seen? }
 *      | { action: "resolve" | "reopen", id }
 *      | { action: "pref", category, muted?, push? }
 *      -> { ok, summary }
 *
 * A failure is reported as one (500, ok:false). An empty inbox and a database
 * that could not be reached must never look the same to a client.
 */

const FILTERS: NotificationFilter[] = ["all", "unread", "action"];
const noStore = { "cache-control": "no-store" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: noStore });

async function viewerOf(req: NextRequest) {
  const ctx = (await getAdminContext()) ?? (await getAdminContextFromBearer(req.headers.get("authorization")));
  return ctx ? { ctx, viewer: { userId: ctx.user.id, isOwner: ctx.role === "owner" } } : null;
}

export async function GET(req: NextRequest) {
  const who = await viewerOf(req);
  if (!who) return json({ ok: false }, 401);
  const { viewer } = who;

  const q = req.nextUrl.searchParams;
  const filterParam = q.get("filter") as NotificationFilter | null;
  const filter = filterParam && FILTERS.includes(filterParam) ? filterParam : "all";
  const category = q.get("category");
  const limit = Math.min(Math.max(Math.floor(Number(q.get("limit"))) || 20, 1), 100);

  const [summary, items, prefs] = await Promise.all([
    getNotificationSummary(viewer),
    listNotifications(viewer, {
      filter,
      category: isCategory(category) ? category : null,
      includeTest: q.get("test") === "1",
      cursor: decodeCursor(q.get("cursor")),
      limit,
    }),
    q.get("prefs") === "1" ? getNotificationPrefs(viewer) : Promise.resolve(undefined),
  ]);
  if (!summary || !items) return json({ ok: false, error: "unavailable" }, 500);

  return json({
    ok: true,
    summary,
    items,
    nextCursor: items.length === limit ? encodeCursor(items[items.length - 1]) : null,
    ...(prefs ? { prefs } : {}),
  });
}

export async function POST(req: NextRequest) {
  // Cookies ride along on cross-site form posts. JSON only, and from this site
  // only, so a page on another subdomain cannot mark the owner's inbox read.
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return json({ ok: false, error: "json_only" }, 415);
  }
  const origin = req.headers.get("origin");
  if (origin) {
    let sameSite = false;
    try {
      sameSite = new URL(origin).host === (req.headers.get("host") ?? req.nextUrl.host);
    } catch {
      /* a malformed Origin is not ours */
    }
    if (!sameSite) return json({ ok: false, error: "bad_origin" }, 403);
  }

  const who = await viewerOf(req);
  if (!who) return json({ ok: false }, 401);
  const { ctx, viewer } = who;

  let body: { action?: string; ids?: unknown; id?: unknown; seen?: unknown; category?: unknown; muted?: unknown; push?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "bad_request" }, 400);
  }

  let ok = false;
  if (body.action === "read" && Array.isArray(body.ids)) {
    ok = await markNotificationsRead(viewer, body.ids.filter((v): v is string => typeof v === "string"));
  } else if (body.action === "read_all") {
    ok = await markAllNotificationsRead(viewer, typeof body.seen === "string" ? body.seen : null);
  } else if ((body.action === "resolve" || body.action === "reopen") && typeof body.id === "string") {
    ok = await setNotificationResolved(viewer, body.id, body.action === "resolve", ctx.email);
  } else if (body.action === "pref" && typeof body.category === "string" && isCategory(body.category)) {
    ok = await setCategoryPref(viewer, body.category, {
      ...(typeof body.muted === "boolean" ? { muted: body.muted } : {}),
      ...(typeof body.push === "boolean" ? { push: body.push } : {}),
    });
  } else {
    return json({ ok: false, error: "unknown_action" }, 400);
  }

  return json({ ok, summary: await getNotificationSummary(viewer) });
}
