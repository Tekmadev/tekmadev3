import Link from "next/link";
import { Building2, ExternalLink, Pencil } from "lucide-react";
import { adminCan, requireAdminCapability } from "@/lib/admin";
import { loadLeadDetail, loadProblem, type LeadDetail } from "@/lib/leads-web";
import { COPY, isContactKind, leadClientAction, leadTitle, newClientHref, rowSubtitle, type ContactKind } from "@/lib/leads-ui";
import { Notice, btnGhost, btnPrimary, btnSecondary } from "@/components/portal/ui";
import { cn } from "@/lib/cn";
import { StatusBadge, SourceBadge } from "@/components/admin/leads/LeadBadges";
import { RefreshControl, RetryNotice } from "@/components/admin/leads/RetryNotice";
import { LeadOutreachCard } from "@/components/admin/leads/outreach/LeadOutreachCard";
import { DemoRequestsCard } from "@/components/admin/demos/DemoRequestsCard";
import { BackToLeads } from "@/components/admin/leads/BackToLeads";
import { LeadContactActions } from "@/components/admin/leads/LeadContactActions";
import { TouchTimeline } from "@/components/admin/leads/TouchTimeline";
import { BookedCallCard, LeadAttribution, LeadDetails, LeadMessage } from "@/components/admin/leads/LeadInfo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lead" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** One readable column on every width. The bottom room is kept by the "Log this call" prompt while it floats. */
const PAGE = "flex flex-col gap-5 lg:max-w-3xl max-lg:pb-[var(--lead-prompt-space,0px)]";

/**
 * A lead (the app's lead detail): who it is, one-tap Call, Text and Email
 * (then "Log this call"), "Create client from this lead" or "Open client",
 * the booked call, Outreach (status, follow-up, owner, booking credit, "Log
 * outreach" and the timeline), demo requests, every field, the message and
 * the attribution. Every capability is checked here on the server, and every
 * write behind a button is checked again by its server action.
 *
 * `?added=1` says "Lead added." (Add lead lands here), `?updated=1` "Lead
 * updated." (Edit lead lands here; "Edit lead" shows only when the lead's
 * canEdit says this person may). `?log=call|email|text` opens Log outreach on
 * arrival (the Leads list's "Log this call" reminder).
 */
export default async function LeadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ added?: string | string[]; updated?: string | string[]; log?: string | string[] }>;
}) {
  // Outside any try: it redirects a signed-out, paused or forbidden person by throwing.
  const admin = await requireAdminCapability("leads.view");
  const { id } = await params;
  const sp = await searchParams;
  const nowMs = Date.now();
  const logParam = first(sp.log);
  const openLog: ContactKind | null = isContactKind(logParam) ? logParam : null;
  const added = first(sp.added) === "1";
  const updated = first(sp.updated) === "1";

  let detail: LeadDetail;
  try {
    detail = await loadLeadDetail(admin, id);
  } catch (err) {
    return (
      <div className={PAGE}>
        <div className="flex items-center justify-between gap-2">
          <BackToLeads />
        </div>
        <RetryNotice message={loadProblem(err, "lead")} />
      </div>
    );
  }

  const lead = detail.lead;
  if (!lead) {
    // Not the site's 404 page: the admin shell, the way back, and the app's words.
    return (
      <div className={PAGE}>
        <div className="flex items-center justify-between gap-2">
          <BackToLeads />
        </div>
        <div role="alert">
          <Notice kind="err">{COPY.notFound}</Notice>
        </div>
      </div>
    );
  }

  const canUpdate = adminCan(admin, "leads.update");
  const canOutreach = adminCan(admin, "leads.outreach");
  const showRevenue = adminCan(admin, "overview.revenue");
  const clientAction = leadClientAction(lead, {
    clientsView: adminCan(admin, "clients.view"),
    leadsConvert: adminCan(admin, "leads.convert"),
    clientsCreate: adminCan(admin, "clients.create"),
  });
  const subtitle = rowSubtitle(lead);
  // Keyed by the first page's touches, so a new touch starts the older pages over (as LeadListMore does).
  const timelineKey = detail.touches.ok ? detail.touches.items.map((t) => t.id).join(",") : "failed";

  return (
    <div className={PAGE}>
      <div className="flex items-center justify-between gap-2">
        <BackToLeads />
        <div className="flex flex-wrap items-center justify-end">
          <RefreshControl />
          {lead.canEdit ? (
            <Link href={`/admin/leads/${encodeURIComponent(lead.id)}/edit`} className={cn(btnGhost, "-mr-2 px-3")}>
              <Pencil className="h-4 w-4" aria-hidden />
              Edit lead
            </Link>
          ) : null}
        </div>
      </div>

      <header className="flex min-w-0 flex-col gap-2">
        <h1 className="font-display text-2xl font-bold text-ink break-words sm:text-3xl">{leadTitle(lead)}</h1>
        {subtitle !== null ? <p className="text-sm text-ink-3 break-words">{subtitle}</p> : null}
        <div className="flex flex-wrap gap-2 pt-1">
          <StatusBadge status={lead.status} dot />
          <SourceBadge source={lead.source} />
        </div>
      </header>

      {added ? (
        <div role="status" aria-live="polite">
          <Notice kind="ok">Lead added.</Notice>
        </div>
      ) : updated ? (
        <div role="status" aria-live="polite">
          <Notice kind="ok">Lead updated.</Notice>
        </div>
      ) : null}

      {/* On phones this is the dock fixed at the bottom; from lg an inline row under the title. */}
      <LeadContactActions lead={lead} canLog={canOutreach} restorePrompt={!openLog} />

      {clientAction === "open" && lead.convertedClientId ? (
        <>
          <Link
            href={`/admin/clients/${encodeURIComponent(lead.convertedClientId)}`}
            aria-describedby="lead-client-hint"
            className={cn(btnSecondary, "w-full sm:w-auto sm:self-start")}
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
            Open client
          </Link>
          <span id="lead-client-hint" className="sr-only">
            This lead is already a client. Opens the client.
          </span>
        </>
      ) : clientAction === "create" ? (
        <>
          <Link href={newClientHref(lead)} aria-describedby="lead-client-hint" className={cn(btnPrimary, "w-full sm:w-auto sm:self-start")}>
            <Building2 className="h-4 w-4" aria-hidden />
            Create client from this lead
          </Link>
          <span id="lead-client-hint" className="sr-only">
            {"Opens New client with this lead's details filled in"}
          </span>
        </>
      ) : null}

      {lead.bookingAt ? <BookedCallCard at={lead.bookingAt} nowMs={nowMs} /> : null}

      <LeadOutreachCard
        lead={lead}
        myEmail={admin.email}
        nowMs={nowMs}
        canUpdate={canUpdate}
        canOutreach={canOutreach}
        assignees={detail.assignees}
        openLog={openLog}
      >
        <TouchTimeline key={timelineKey} leadId={lead.id} initial={detail.touches} nowMs={nowMs} />
      </LeadOutreachCard>

      {/* Demo requests and "Request a demo" (demos.request), filled in with the business like the app. */}
      <DemoRequestsCard leadId={lead.id} businessName={lead.business} />

      <LeadDetails lead={lead} nowMs={nowMs} showRevenue={showRevenue} />
      <LeadMessage lead={lead} />
      <LeadAttribution lead={lead} />
    </div>
  );
}
