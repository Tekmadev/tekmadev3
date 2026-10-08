import type { Metadata } from "next";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import { adminCan, requireAdminCapability } from "@/lib/admin";
import { ApiError } from "@/lib/admin-api/errors";
import { GROW_LEAD_SOURCE } from "@/config/grow";
import { loadLeadFormsPreview, loadLeadList, loadProblem } from "@/lib/leads-web";
import { isNarrowed, leadListHref, leadListParamsFrom, type Lead, type LeadListParams } from "@/lib/leads-ui";
import { Notice, PageHeader, Panel } from "@/components/admin/ui";
import { btnPrimary, btnSecondary } from "@/components/portal/ui";
import { LeadRow } from "@/components/admin/leads/LeadRow";
import { LeadListControls } from "@/components/admin/leads/LeadListControls";
import { LeadListMore } from "@/components/admin/leads/LeadListMore";
import { PendingLogBanner } from "@/components/admin/leads/PendingLogBanner";
import { RefreshControl, RetryNotice } from "@/components/admin/leads/RetryNotice";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Leads" };

/** The shared list schema's 400 codes for a bad filter value in the URL ("Unknown lead source."). */
const FILTER_ERROR_CODES = new Set(["source", "status", "need", "assigned", "follow_up"]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Rows inside an admin Panel. The Panel pads 20px; on phones the rows reach
 * 8px into that (12px from the card's edge) so the name keeps its room, and
 * the rows' own py-3 replaces the Panel's top and bottom padding.
 */
const listCls = "-mx-2 -my-3 divide-y divide-line sm:mx-0";
const textLinkCls = "inline-flex min-h-11 items-center text-gold hover:underline";

function isFilterError(err: unknown): err is ApiError {
  return err instanceof ApiError && err.status === 400 && FILTER_ERROR_CODES.has(err.code);
}

/** "Your follow-ups due today and earlier." with a switch to everyone's (and back). */
function DueLine({ params }: { params: LeadListParams }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-sm text-ink-3">
      <span>{params.everyone ? "Everyone's follow-ups due today and earlier." : "Your follow-ups due today and earlier."}</span>
      <Link href={leadListHref(params, { everyone: !params.everyone })} replace scroll={false} className={textLinkCls}>
        {params.everyone ? "Show only mine" : "Show everyone's"}
      </Link>
    </p>
  );
}

/** The list panel's title: what the list holds ("All leads" under "Lead forms", as in the app). */
function listTitle(params: LeadListParams): string {
  if (params.view === "due") return "Follow-ups due";
  if (params.view === "mine") return "My leads";
  return "All leads";
}

/** The empty list, with what to do next. Never shown for a failed load. */
function EmptyLeads({ params, canAdd }: { params: LeadListParams; canAdd: boolean }) {
  let title = "No leads match these filters.";
  let body: string | null = null;
  let action: { href: string; label: string } | null = { href: "/admin/leads", label: "Clear filters" };
  if (!params.q && !isNarrowed(params)) {
    title = "No leads yet.";
    body = "Lead forms, booked calls, free tool submissions and portal sign-ups appear here.";
    action = canAdd ? { href: "/admin/leads/new", label: "Add a lead" } : null;
  } else if (params.view === "due" && !params.q && !params.source && !params.status && !params.need) {
    title = "No follow-ups due.";
    body = "Plan one on a lead and it shows here on the day.";
    action = { href: "/admin/leads", label: "Show all leads" };
  }
  return (
    <Panel title={listTitle(params)}>
      <p className="text-sm font-medium text-ink">{title}</p>
      {body && <p className="mt-1 text-sm text-ink-3">{body}</p>}
      {action && (
        <Link href={action.href} className={cn(btnSecondary, "mt-4")}>
          {action.label}
        </Link>
      )}
    </Panel>
  );
}

/**
 * Leads: the list a salesperson works from all day, on an iPhone first.
 * Search, quick views and filters live in the URL and run on the server
 * through the shared list (the same rules as the app's GET /leads). Rows open
 * the lead; the round button calls it and leaves a "Log this call" reminder.
 * A failed load shows its message and a Retry, never an empty list.
 */
export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await requireAdminCapability("leads.view");
  const sp = await searchParams;
  const params = leadListParamsFrom(sp);
  const nowMs = Date.now();
  const canAdd = adminCan(admin, "leads.create");
  const showAssignee = params.view === "due" && params.everyone;
  const showForms = params.view === "all" && params.sort === "newest" && !params.source;
  const [listRes, formsRes] = await Promise.allSettled([
    loadLeadList(admin, params),
    showForms ? loadLeadFormsPreview(admin, params) : null,
  ]);

  const addedRaw = Array.isArray(sp.added) ? sp.added[0] : sp.added;
  const added = typeof addedRaw === "string" && addedRaw.trim() !== "";
  const addedId = added && UUID_RE.test(addedRaw.trim()) ? addedRaw.trim() : null;

  let rows: React.ReactNode;
  if (listRes.status === "rejected") {
    const err: unknown = listRes.reason;
    rows = isFilterError(err) ? (
      <div role="alert">
        <Notice kind="err">
          <p>{err.message}</p>
          <Link href="/admin/leads" className={cn(btnSecondary, "mt-3")}>
            Clear filters
          </Link>
        </Notice>
      </div>
    ) : (
      <RetryNotice message={loadProblem(err, "leads list")} />
    );
  } else if (listRes.value.items.length === 0) {
    rows = <EmptyLeads params={params} canAdd={canAdd} />;
  } else {
    const page = listRes.value;
    const ids = page.items.map((lead) => lead.id);
    const forms = showForms && formsRes.status === "fulfilled" ? formsRes.value : null;
    const formsFailed = showForms && formsRes.status === "rejected";
    const formsShown = formsFailed || (forms !== null && forms.items.length > 0);
    rows = (
      <>
        {formsShown && (
          <Panel
            title="Lead forms"
            action={
              forms?.more && (
                <Link href={leadListHref(params, { source: GROW_LEAD_SOURCE })} aria-label="View all lead forms" className={cn(textLinkCls, "text-sm font-medium")}>
                  View all
                </Link>
              )
            }
          >
            {formsFailed ? (
              <RetryNotice compact message={loadProblem(formsRes.reason, "lead forms preview")} />
            ) : (
              <ul className={listCls}>
                {(forms?.items ?? []).slice(0, 3).map((lead: Lead) => (
                  <LeadRow key={lead.id} lead={lead} nowMs={nowMs} showAssignee={showAssignee} />
                ))}
              </ul>
            )}
          </Panel>
        )}
        <Panel title={listTitle(params)}>
          <ul className={listCls}>
            {page.items.map((lead) => (
              <LeadRow key={lead.id} lead={lead} nowMs={nowMs} showAssignee={showAssignee} />
            ))}
            <LeadListMore
              key={`${leadListHref(params)}|${ids.join(",")}`}
              params={params}
              cursor={page.nextCursor}
              seenIds={ids}
              showAssignee={showAssignee}
            />
          </ul>
        </Panel>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-5 lg:max-w-5xl max-lg:pb-[var(--lead-prompt-space,0px)]">
      <PageHeader title="Leads">
        {/* Wraps on a phone, so the offline line next to Refresh never squeezes Add lead. */}
        <div className="flex flex-wrap items-center gap-3">
          {canAdd && (
            <Link href="/admin/leads/new" className={btnPrimary}>
              <UserPlus aria-hidden="true" className="h-4 w-4" />
              Add lead
            </Link>
          )}
          <RefreshControl />
        </div>
      </PageHeader>

      <PendingLogBanner />

      {added && (
        <div role="status" aria-live="polite">
          <Notice kind="ok">
            Lead added.
            {addedId && (
              <>
                {" "}
                <Link href={`/admin/leads/${addedId}`} className="font-medium text-gold underline underline-offset-2">
                  Open it
                </Link>
              </>
            )}
          </Notice>
        </div>
      )}

      <LeadListControls params={params} />

      {params.view === "due" && <DueLine params={params} />}

      {rows}
    </div>
  );
}
