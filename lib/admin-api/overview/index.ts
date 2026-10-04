import type { ApiContext } from "../auth";
import { dbError, instant, requireDb } from "../data";
import { getAnalytics, type AnalyticsPoint, type LabelCount } from "../analytics";
import { addDays, torontoDayStart, torontoToday } from "../analytics/calendar";
import { listSubscriptions, type Subscription } from "../billing";
import { clientAttention, loadClientRows, rowNeedsAttention, type ApiClientRow, type ClientRowEntry } from "../clients/core/list";
import type { AppStage } from "../clients/core/enums";
import { listLeads, storedValuesFor, type Lead } from "../leads";
import { inboxSummary, inboxViewer, type NotificationSummary } from "../notifications";

/**
 * GET /overview: Home in one call (docs/api-requests/overview.md in the app
 * repo, schema src/api/schemas/overview.ts).
 *
 * Every number comes from the same code the screen it opens uses, at request
 * time, so a KPI or a "Needs you" card always matches its list:
 *
 *   kpis.totalLeads, bookedCalls  the leads table, read like GET /leads
 *   kpis.activeSubs               live subscriptions that are active, trialing or past due
 *   kpis.pageviews30d, traffic    GET /analytics?range=30d (lib/admin-api/analytics)
 *   attention, attentionClients   the Clients list rows and rules (lib/admin-api/clients/core/list)
 *   attention.needsAction, inbox  the caller's Inbox summary (test rows excluded)
 *   topLinks                      visits per short link over the same 30 Toronto days
 *   recentLeads                   the first 8 rows of GET /leads
 *   recentSubscriptions           the first 8 rows of GET /billing/subscriptions
 *
 * Who sees what: any staff may call it. Test clients never count, for anyone.
 * The inbox block is the caller's own. `topLinks` needs `links.view` (owner and
 * staff; null for a manager). Subscription data needs `overview.revenue` (owner
 * and manager): for staff, `activeSubs` and `recentSubscriptions` are null, not
 * zero, because zero would be a number the staff role is not shown.
 */

/** Home shows 8 recent leads and 8 recent subscriptions. */
export const RECENT_ROWS = 8;
/** "Top tracking links (30d)" shows at most 10 bars. */
export const TOP_LINKS_MAX = 10;
/** "Top pages (30d)" shows 10. */
export const TOP_PAGES_MAX = 10;
/** The traffic block covers today and the 29 Toronto days before. */
const WINDOW_DAYS = 30;

/** Subscriptions still running while Stripe retries count as active, Webline Care included. */
export const ACTIVE_SUBSCRIPTION_STATUSES = ["active", "trialing", "past_due"] as const;

export type TopLink = { id: string; slug: string; label: string | null; count: number };

type AttentionBase = { clientId: string; businessName: string; url: string };

export type AttentionClients = {
  blockedOnboardings: (AttentionBase & { stage: AppStage | null; blockedReason: string | null })[];
  callsToReview: (AttentionBase & { count: number })[];
  intakesToReview: (AttentionBase & { version: number; submittedAt: string | null })[];
  behindPace: (AttentionBase & { counted: number; target: number; expectedByNow: number; daysLeft: number })[];
};

export type Overview = {
  kpis: { totalLeads: number; bookedCalls: number; activeSubs: number | null; pageviews30d: number };
  attention: { needsAction: number; blockedOnboardings: number; callsToReview: number; intakesToReview: number; behindPace: number };
  attentionClients: AttentionClients;
  traffic: { series: AnalyticsPoint[]; topSources: LabelCount[]; topPages: LabelCount[] };
  topLinks: TopLink[] | null;
  recentLeads: Lead[];
  recentSubscriptions: Subscription[] | null;
  inbox: NotificationSummary;
};

/* ------------------------------------------------------------------ */
/* Parts                                                               */
/* ------------------------------------------------------------------ */

/** Every lead, and the leads whose status reads "booked" (the same folding GET /leads?status=booked uses). */
async function leadCounts(): Promise<{ total: number; booked: number }> {
  const db = requireDb();
  const [all, booked] = await Promise.all([
    db.from("leads").select("id", { count: "exact", head: true }),
    db.from("leads").select("id", { count: "exact", head: true }).in("status", storedValuesFor("booked")),
  ]);
  if (all.error) throw dbError("overview lead count", all.error);
  if (booked.error) throw dbError("overview booked count", booked.error);
  return { total: all.count ?? 0, booked: booked.count ?? 0 };
}

async function activeSubscriptionCount(): Promise<number> {
  const { count, error } = await requireDb()
    .from("subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("livemode", true)
    .in("status", [...ACTIVE_SUBSCRIPTION_STATUSES]);
  if (error) throw dbError("overview active subscriptions", error);
  return count ?? 0;
}

async function topLinks(nowMs: number): Promise<TopLink[]> {
  const since = torontoDayStart(addDays(torontoToday(nowMs), -(WINDOW_DAYS - 1)));
  const { data, error } = await requireDb().rpc("admin_api_top_links", { p_since: since, p_limit: TOP_LINKS_MAX });
  if (error) throw dbError("overview top links", error);
  return ((data ?? []) as { id: string; slug: string; label: string | null; visits: number }[]).map((row) => ({
    id: String(row.id),
    slug: row.slug,
    label: row.label?.trim() ? row.label : null,
    count: Number(row.visits) || 0,
  }));
}

const clientUrl = (id: string, section: "onboarding" | "calls" | "intake") => `/admin/clients/${encodeURIComponent(id)}#${section}`;

/** Same formula as the client's guarantee card (guaranteeFor in lib/admin-api/clients/sections/calls.ts). */
const expectedByNow = (g: ApiClientRow["guarantee"]) => Math.floor((g.target * g.daysIn) / Math.max(g.windowDays, 1));

/**
 * The clients behind each client card of "Needs you", most urgent first. The
 * lengths (and the sum of `count` for calls) equal clientAttention's numbers,
 * because both read the same rows with the same rules.
 */
function attentionClientsOf(entries: readonly ClientRowEntry[]): AttentionClients {
  const out: AttentionClients = { blockedOnboardings: [], callsToReview: [], intakesToReview: [], behindPace: [] };
  for (const { row, latestIntakeAt, latestIntakeVersion } of entries) {
    const base = { clientId: row.id, businessName: row.businessName };
    if (rowNeedsAttention(row, "blocked")) {
      out.blockedOnboardings.push({ ...base, url: clientUrl(row.id, "onboarding"), stage: row.stage, blockedReason: row.blockedReason });
    }
    if (row.callsToReview > 0) {
      out.callsToReview.push({ ...base, url: clientUrl(row.id, "calls"), count: row.callsToReview });
    }
    if (rowNeedsAttention(row, "intake_to_review")) {
      out.intakesToReview.push({ ...base, url: clientUrl(row.id, "intake"), version: latestIntakeVersion ?? 1, submittedAt: instant(latestIntakeAt) });
    }
    if (rowNeedsAttention(row, "behind_pace")) {
      out.behindPace.push({
        ...base,
        url: clientUrl(row.id, "calls"),
        counted: row.guarantee.counted,
        target: row.guarantee.target,
        expectedByNow: expectedByNow(row.guarantee),
        daysLeft: row.guarantee.daysLeft,
      });
    }
  }
  const byName = (a: { businessName: string }, b: { businessName: string }) => a.businessName.localeCompare(b.businessName);
  // Blocked: by business name.
  out.blockedOnboardings.sort(byName);
  // Calls: the most appointments waiting first.
  out.callsToReview.sort((a, b) => b.count - a.count || byName(a, b));
  // Intakes: waiting longest first (oldest submittedAt; never-dated ones first).
  out.intakesToReview.sort((a, b) => sortKey(a.submittedAt).localeCompare(sortKey(b.submittedAt)) || byName(a, b));
  // Behind pace: the largest shortfall first, then the fewest days left.
  out.behindPace.sort((a, b) => b.expectedByNow - b.counted - (a.expectedByNow - a.counted) || a.daysLeft - b.daysLeft || byName(a, b));
  return out;
}

/** "…22Z" and "…22.5Z" compare as instants do (fractions padded). */
function sortKey(value: string | null): string {
  if (!value) return "";
  const m = value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?Z$/);
  return m ? `${m[1]}.${(m[2] ?? "").padEnd(9, "0")}` : value;
}

/* ------------------------------------------------------------------ */
/* GET /overview                                                       */
/* ------------------------------------------------------------------ */

export async function buildOverview(ctx: ApiContext, nowMs: number = Date.now()): Promise<Overview> {
  const seesRevenue = ctx.can("overview.revenue");
  const seesLinks = ctx.can("links.view");

  const [leads, activeSubs, traffic, clientEntries, inbox, links, recentLeads, recentSubscriptions] = await Promise.all([
    leadCounts(),
    seesRevenue ? activeSubscriptionCount() : Promise.resolve(null),
    getAnalytics("30d", nowMs),
    // Real clients only: test clients never count on Home, for anyone.
    loadClientRows({ includeTest: false }),
    inboxSummary(inboxViewer(ctx)),
    seesLinks ? topLinks(nowMs) : Promise.resolve(null),
    listLeads(ctx, { limit: RECENT_ROWS }),
    seesRevenue ? listSubscriptions({ limit: RECENT_ROWS }) : Promise.resolve(null),
  ]);

  const counts = clientAttention(clientEntries.map((e) => e.row));

  return {
    kpis: {
      totalLeads: leads.total,
      bookedCalls: leads.booked,
      activeSubs,
      pageviews30d: traffic.total,
    },
    attention: {
      needsAction: inbox.needsAction,
      blockedOnboardings: counts.blockedOnboardings,
      callsToReview: counts.callsToReview,
      intakesToReview: counts.intakesToReview,
      behindPace: counts.behindPace,
    },
    attentionClients: attentionClientsOf(clientEntries),
    traffic: {
      series: traffic.series,
      topSources: traffic.topSources,
      topPages: traffic.topPages.slice(0, TOP_PAGES_MAX),
    },
    topLinks: links,
    recentLeads: recentLeads.items,
    recentSubscriptions: recentSubscriptions ? recentSubscriptions.items : null,
    inbox,
  };
}
