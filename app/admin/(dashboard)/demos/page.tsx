import Link from "next/link";
import { Hammer, Inbox, MonitorPlay, Sparkles, UserRound } from "lucide-react";
import { requireAdminCapability } from "@/lib/admin";
import { ApiError, isUuid } from "@/lib/admin-api";
import { DEMO_STATUS_FILTERS, listDemos, type DemoList as DemoListResult, type DemoStatusFilter } from "@/lib/admin-api/demos";
import { demoActorFor } from "@/lib/demos-admin";
import { PageHeader, Panel, StatCard, Notice } from "@/components/admin/ui";
import { DemoList } from "@/components/admin/demos/DemoList";
import { btnGhost, btnSecondary } from "@/components/portal/ui";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

const FILTERS: { key: DemoStatusFilter; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "requested", label: "Requested" },
  { key: "building", label: "Building" },
  { key: "ready", label: "Ready to show" },
  { key: "shown", label: "Shown" },
  { key: "cancelled", label: "Cancelled" },
  { key: "all", label: "All" },
];

const chip = (active: boolean) =>
  cn(
    "inline-flex min-h-11 shrink-0 snap-start items-center rounded-full border px-4 py-1.5 text-sm transition-colors",
    active ? "border-gold bg-gold/15 text-gold-deep" : "border-line-strong text-ink-3 hover:text-ink",
  );

const PAGE = 50;

export default async function DemosPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; mine?: string; cursor?: string; clientId?: string; leadId?: string }>;
}) {
  const ctx = await requireAdminCapability("demos.view");
  const sp = await searchParams;
  const status = (DEMO_STATUS_FILTERS as readonly string[]).includes(sp.status ?? "") ? (sp.status as DemoStatusFilter) : "open";
  const mine = sp.mine === "1";
  const clientId = isUuid(sp.clientId) ? sp.clientId.toLowerCase() : undefined;
  const leadId = isUuid(sp.leadId) ? sp.leadId.toLowerCase() : undefined;

  let result: DemoListResult | null = null;
  let problem: string | null = null;
  try {
    result = await listDemos(demoActorFor(ctx), { status, mine, clientId, leadId, cursor: sp.cursor || undefined, limit: PAGE });
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
    problem = err.code === "cursor" ? "That page is out of date. Start again from the first page." : err.message;
  }

  /** The link for a filter change; a new filter starts again from the first page. */
  const href = (next: { status?: DemoStatusFilter; mine?: boolean; cursor?: string }) => {
    const q = new URLSearchParams();
    const s = next.status ?? status;
    if (s !== "open") q.set("status", s);
    if (next.mine ?? mine) q.set("mine", "1");
    if (clientId) q.set("clientId", clientId);
    if (leadId) q.set("leadId", leadId);
    if (next.cursor) q.set("cursor", next.cursor);
    const qs = q.toString();
    return qs ? `/admin/demos?${qs}` : "/admin/demos";
  };

  const counts = result?.counts;
  const forWho = result?.items.find((d) => (clientId ? d.clientId === clientId : d.leadId === leadId));
  const scopeLabel = clientId ? (forWho?.clientName ?? "this client") : leadId ? (forWho?.leadName ?? "this lead") : null;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Demos"
        subtitle="Demo websites salespeople asked for. Ask for one from a client or a lead; an owner or manager builds it."
      />

      {problem && <Notice kind="err">{problem}</Notice>}

      {scopeLabel && (
        <Notice kind="ok">
          Showing demo requests for {scopeLabel}.{" "}
          <Link href="/admin/demos" className="inline-flex min-h-11 items-center font-medium text-gold hover:underline">
            Show everyone&apos;s
          </Link>
        </Notice>
      )}

      {counts && (
        <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
          <StatCard label="Open" value={counts.open} icon={MonitorPlay} />
          <StatCard label="Requested" value={counts.requested} icon={Inbox} sub="waiting for a builder" />
          <StatCard label="Building" value={counts.building} icon={Hammer} />
          <StatCard label="Ready to show" value={counts.ready} icon={Sparkles} />
          <StatCard label="Mine" value={counts.mine} icon={UserRound} sub="your open requests" />
        </section>
      )}

      <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
        {FILTERS.map((f) => (
          <Link key={f.key} href={href({ status: f.key })} className={chip(status === f.key)} aria-current={status === f.key ? "page" : undefined}>
            {f.label}
          </Link>
        ))}
        <span className="mx-1 w-px shrink-0 bg-line" aria-hidden />
        <Link href={href({ mine: !mine })} className={chip(mine)} aria-pressed={mine}>
          Mine
        </Link>
      </div>

      <Panel title={FILTERS.find((f) => f.key === status)?.label ?? "Requests"}>
        {result && (
          <DemoList
            demos={result.items}
            empty={mine ? "You have no demo requests here." : "No demo requests here. Ask for one from a client or a lead."}
          />
        )}
        {(sp.cursor || result?.nextCursor) && (
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            {sp.cursor && (
              <Link href={href({})} className={btnGhost}>
                Newest
              </Link>
            )}
            {result?.nextCursor && (
              <Link href={href({ cursor: result.nextCursor })} className={btnSecondary}>
                Older
              </Link>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}
