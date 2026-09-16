import { requireClient } from "@/lib/portal-auth";
import { countsTowardGuarantee, guaranteeSummary, listBookedCalls, type BookedCall } from "@/lib/onboarding-data";
import { Badge, EmptyState, PageHeader, Panel, ProgressBar, StatCard, fmtDateTime, humanize, type Tone } from "@/components/portal/ui";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<BookedCall["status"], Tone> = {
  booked: "gold",
  confirmed: "gold",
  showed: "ok",
  no_show: "warn",
  cancelled: "muted",
  rescheduled: "neutral",
};

export default async function CallsPage() {
  const { client } = await requireClient();
  const calls = await listBookedCalls(client.id, 500);
  const g = guaranteeSummary(client, calls);
  const endsAtMs = g.endsAt ? new Date(g.endsAt).getTime() : null;
  const thisMonth = calls.filter((c) => new Date(c.booked_at).getMonth() === new Date().getMonth() && c.qualified).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Booked appointments"
        subtitle="Every call the system books for you, and whether it counts. Spam, duplicates, out-of-area and wrong-service never count against you."
      />

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Counted" value={g.eligible ? `${g.counted} / ${g.target}` : g.counted} sub={g.eligible ? "toward your guarantee" : "qualified appointments"} />
        <StatCard label="Days left" value={g.eligible && g.startedAt ? g.daysLeft : "-"} sub={g.startedAt ? `of ${g.windowDays}` : "clock starts at go-live"} />
        <StatCard label="This month" value={thisMonth} sub="qualified" />
        <StatCard label="All time" value={calls.filter((c) => c.qualified).length} sub="qualified" />
      </section>

      {g.eligible && g.startedAt && (
        <Panel title="Guarantee pace" description={`${g.target} in ${g.windowDays} days. ${g.expectedByNow} expected by today at an even pace.`}>
          <div className="flex items-center justify-between text-sm text-ink-3">
            <span>{g.counted} counted</span>
            <Badge tone={g.onTrack ? "ok" : "warn"}>{g.onTrack ? "On pace" : "Behind pace"}</Badge>
          </div>
          <div className="mt-2">
            <ProgressBar percent={g.percent} tone={g.onTrack ? "ok" : "gold"} />
          </div>
        </Panel>
      )}

      <Panel title="All calls">
        {calls.length === 0 ? (
          <EmptyState title="No booked appointments yet" body="They start landing here the day your system goes live." />
        ) : (
          <>
            {/* Mobile: cards */}
            <ul className="flex flex-col divide-y divide-line md:hidden">
              {calls.map((c) => (
                <li key={c.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{c.contact_name || "Unknown"}</p>
                      <p className="text-xs text-ink-3">{c.service_requested || "-"}</p>
                    </div>
                    <Badge tone={STATUS_TONE[c.status]}>{humanize(c.status)}</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-4">
                    <span>Booked {fmtDateTime(c.booked_at)}</span>
                    {c.booked_for && <span>For {fmtDateTime(c.booked_for)}</span>}
                    <span>{humanize(c.source)}</span>
                    {!c.qualified && <Badge tone="muted">Not counted: {humanize(c.disqualified_reason)}</Badge>}
                    {c.qualified && countsTowardGuarantee(client, c, endsAtMs) && <Badge tone="ok">Counts</Badge>}
                  </div>
                </li>
              ))}
            </ul>
            {/* Desktop: table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-4">
                    <th className="py-2 pr-4 font-medium">Booked</th>
                    <th className="py-2 pr-4 font-medium">Contact</th>
                    <th className="py-2 pr-4 font-medium">Service</th>
                    <th className="py-2 pr-4 font-medium">Appointment</th>
                    <th className="py-2 pr-4 font-medium">Source</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Counts</th>
                  </tr>
                </thead>
                <tbody>
                  {calls.map((c) => (
                    <tr key={c.id} className="border-b border-line last:border-0">
                      <td className="py-2.5 pr-4 whitespace-nowrap text-ink-2">{fmtDateTime(c.booked_at)}</td>
                      <td className="py-2.5 pr-4 text-ink">{c.contact_name || "Unknown"}</td>
                      <td className="py-2.5 pr-4 text-ink-2">{c.service_requested || "-"}</td>
                      <td className="py-2.5 pr-4 whitespace-nowrap text-ink-2">{c.booked_for ? fmtDateTime(c.booked_for) : "-"}</td>
                      <td className="py-2.5 pr-4 text-ink-2">{humanize(c.source)}</td>
                      <td className="py-2.5 pr-4">
                        <Badge tone={STATUS_TONE[c.status]}>{humanize(c.status)}</Badge>
                      </td>
                      <td className="py-2.5 pr-4">
                        {!c.qualified ? (
                          <Badge tone="muted">{humanize(c.disqualified_reason)}</Badge>
                        ) : countsTowardGuarantee(client, c, endsAtMs) ? (
                          <Badge tone="ok">Yes</Badge>
                        ) : (
                          <span className="text-xs text-ink-4">Outside window</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
