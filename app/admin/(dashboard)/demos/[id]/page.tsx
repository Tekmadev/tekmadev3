import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { requireAdminCapability } from "@/lib/admin";
import { ApiError } from "@/lib/admin-api";
import {
  DEMO_STATUSES,
  DEMO_STATUS_LABELS,
  MANAGE_MOVES,
  demoTeam,
  getDemo,
  type DemoEvent,
  type DemoRequest,
  type DemoStatus,
} from "@/lib/admin-api/demos";
import { demoActorFor } from "@/lib/demos-admin";
import { PageHeader, Panel, Notice } from "@/components/admin/ui";
import { Row, btnPrimary, btnSecondary, fmtDateTime } from "@/components/portal/ui";
import { PendingSubmit } from "@/components/PendingSubmit";
import { DemoStatusBadge, fmtCalendarDate } from "@/components/admin/demos/DemoList";
import { DemoRequestForm } from "@/components/admin/demos/DemoRequestForm";
import { DemoManageForm, type ManageMove } from "@/components/admin/demos/DemoManageForm";
import { cn } from "@/lib/cn";
import { demoStatusAction } from "../actions";

export const dynamic = "force-dynamic";

const OK: Record<string, string> = {
  created: "Demo requested. The owners and managers who build demos have been told.",
  /** Added with "Already built? Demo link": ready to show from the start. */
  built: "Saved as ready to show.",
  shown: "Marked as shown.",
  cancelled: "Request cancelled.",
};

const CANCEL_CONFIRM = "Cancel this demo request? A cancelled request cannot be reopened.";

/** The status buttons a builder gets now, by MANAGE_MOVES. */
function movesFor(status: DemoStatus): ManageMove[] {
  return MANAGE_MOVES[status].map((to) => {
    if (to === "building") return { status: to, label: status === "ready" ? "Back to building" : "Start building" };
    if (to === "ready") return { status: to, label: "Mark ready" };
    if (to === "shown") return { status: to, label: "Mark as shown" };
    return { status: to, label: "Cancel request", confirm: CANCEL_CONFIRM };
  });
}

const statusLabel = (v: string | null) => (v && (DEMO_STATUSES as readonly string[]).includes(v) ? DEMO_STATUS_LABELS[v as DemoStatus] : (v ?? "-"));

function eventText(e: DemoEvent, nameOf: (email: string) => string): string {
  switch (e.type) {
    case "created":
      return "asked for the demo";
    case "edited":
      return "edited the details";
    case "status":
      return `moved it from ${statusLabel(e.from)} to ${statusLabel(e.to)}`;
    case "builder":
      return e.to ? `set the builder to ${nameOf(e.to)}` : "cleared the builder";
    case "link":
      return e.to ? (e.from ? "changed the demo link" : "added the demo link") : "removed the demo link";
  }
}

const text = (v: string | null) => (v ? <span className="whitespace-pre-wrap">{v}</span> : "-");

export default async function DemoDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; e?: string }>;
}) {
  const ctx = await requireAdminCapability("demos.view");
  const actor = demoActorFor(ctx);
  const [{ id }, sp] = await Promise.all([params, searchParams]);

  let found: DemoRequest | null = null;
  try {
    found = await getDemo(actor, id);
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
    return (
      <div className="flex flex-col gap-8">
        <PageHeader title="Demo request" />
        <Notice kind="err">{err.message}</Notice>
      </div>
    );
  }
  if (!found) notFound();
  const demo = found;

  const team = demo.can.manage ? await demoTeam(actor).catch(() => new Map<string, string | null>()) : new Map<string, string | null>();
  const nameOf = (email: string) => team.get(email) || (email === demo.requestedBy ? demo.requestedByName : null) || email;
  const b = demo.business;
  const forLine = demo.clientId ? (
    <Link href={`/admin/clients/${demo.clientId}`} className="text-gold hover:underline">
      {demo.clientName ?? "the client"}
    </Link>
  ) : (
    <span>{demo.leadName ?? "a lead"}</span>
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={b.name} subtitle={`${b.type} · ${b.area}`}>
        <DemoStatusBadge status={demo.status} />
        {demo.demoUrl && (
          <a href={demo.demoUrl} target="_blank" rel="noopener noreferrer" className={btnPrimary}>
            Open demo
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        )}
      </PageHeader>

      {(sp.ok || sp.e) && (
        <div role="status" aria-live="polite">
          {sp.e ? <Notice kind="err">{sp.e}</Notice> : <Notice kind="ok">{OK[sp.ok ?? ""] ?? "Saved."}</Notice>}
        </div>
      )}

      <Panel title="Request">
        <dl className="divide-y divide-line">
          <Row label="For">
            {forLine}
            {demo.clientId && demo.leadId && <span className="text-ink-4"> (came from the lead {demo.leadName ?? ""})</span>}
          </Row>
          <Row label="Asked by">
            {demo.requestedByName || demo.requestedBy} on {fmtDateTime(demo.createdAt)}
          </Row>
          <Row label="Needed by">{fmtCalendarDate(demo.neededBy)}</Row>
          <Row label="What they sell or do">{text(b.offer)}</Row>
          <Row label="Website or social links">{text(b.website)}</Row>
          <Row label="Logo and brand colours">{text(b.brand)}</Row>
          <Row label="Their customers">{text(b.customers)}</Row>
          <Row label="Wants to see">{text(demo.wants)}</Row>
        </dl>
      </Panel>

      {demo.can.manage ? (
        <Panel title="Build">
          <DemoManageForm
            demoId={demo.id}
            builderEmail={demo.builderEmail}
            demoUrl={demo.demoUrl}
            builderNote={demo.builderNote}
            team={[...team.entries()]
              .map(([email, name]) => ({ email, name }))
              .sort((a, c) => (a.name || a.email).localeCompare(c.name || c.email, "en"))}
            moves={movesFor(demo.status)}
          />
        </Panel>
      ) : (
        <Panel title="Build">
          <dl className="divide-y divide-line">
            <Row label="Builder">{demo.builderEmail ? nameOf(demo.builderEmail) : "Nobody yet"}</Row>
            <Row label="Demo link">
              {demo.demoUrl ? (
                <a href={demo.demoUrl} target="_blank" rel="noopener noreferrer" className="break-all text-gold hover:underline">
                  {demo.demoUrl}
                </a>
              ) : (
                "Not ready yet"
              )}
            </Row>
            <Row label="Note from the builder">{text(demo.builderNote)}</Row>
            {demo.readyAt && <Row label="Ready">{fmtDateTime(demo.readyAt)}</Row>}
            {demo.shownAt && <Row label="Shown">{fmtDateTime(demo.shownAt)}</Row>}
            {demo.cancelledAt && <Row label="Cancelled">{fmtDateTime(demo.cancelledAt)}</Row>}
          </dl>
          {(demo.can.markShown || demo.can.cancel) && (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {demo.can.markShown && (
                <form action={demoStatusAction}>
                  <input type="hidden" name="demo_id" value={demo.id} />
                  <input type="hidden" name="status" value="shown" />
                  <PendingSubmit className={cn(btnPrimary, "w-full sm:w-auto")} pendingLabel="Saving">
                    Mark as shown
                  </PendingSubmit>
                </form>
              )}
              {demo.can.cancel && (
                <form action={demoStatusAction}>
                  <input type="hidden" name="demo_id" value={demo.id} />
                  <input type="hidden" name="status" value="cancelled" />
                  <PendingSubmit className={cn(btnSecondary, "w-full sm:w-auto")} pendingLabel="Cancelling" confirm={CANCEL_CONFIRM}>
                    Cancel request
                  </PendingSubmit>
                </form>
              )}
            </div>
          )}
        </Panel>
      )}

      {demo.can.edit && (
        <Panel title="Edit the details">
          <DemoRequestForm
            mode="edit"
            demoId={demo.id}
            initial={{
              businessName: b.name,
              businessType: b.type,
              area: b.area,
              offer: b.offer,
              website: b.website ?? "",
              brand: b.brand ?? "",
              customers: b.customers ?? "",
              wants: demo.wants ?? "",
              neededBy: demo.neededBy ?? "",
            }}
          />
        </Panel>
      )}

      <Panel title="History">
        {demo.events.length === 0 ? (
          <p className="text-sm text-ink-4">Nothing yet.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {demo.events.map((e, i) => (
              <li key={i} className="flex min-w-0 flex-col gap-0.5 text-sm sm:flex-row sm:gap-3">
                <span className="shrink-0 text-xs text-ink-4 sm:w-44 sm:pt-0.5">{fmtDateTime(e.at)}</span>
                <span className="min-w-0 break-words text-ink-2">
                  <span className="font-medium text-ink">{e.byName || nameOf(e.by)}</span> {eventText(e, nameOf)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      <p className="flex flex-wrap items-center gap-x-2 text-xs text-ink-4">
        <Link href="/admin/demos" className="inline-flex min-h-11 items-center hover:text-ink">
          Back to demos
        </Link>
        <span aria-hidden>·</span>
        <span className="break-all">
          id <span className="font-mono">{demo.id}</span>
        </span>
      </p>
    </div>
  );
}
