import { Calculator, Mail, Users, TrendingDown } from "lucide-react";
import { requireAdmin } from "@/lib/admin";
import { getLeadMagnetSubmissions, getLeadMagnetStats } from "@/lib/lead-magnet-data";
import { getLeadMagnet } from "@/config/lead-magnets";
import { formatDollars, type LeakAnswers, type LeakResult } from "@/lib/revenue-leak";
import { PageHeader, Panel, StatCard, DataTable, Badge, fmtDateTime, txt } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

/**
 * Free tool submissions, newest first.
 *
 * The leak figure is the whole point of the list: it is what someone told us
 * their own bad follow-up costs them, which makes it the sharpest qualification
 * signal on the site. Sorting by it is the fastest route to the next call.
 */
export default async function AdminToolsPage() {
  await requireAdmin();
  const [rows, stats] = await Promise.all([getLeadMagnetSubmissions(200), getLeadMagnetStats()]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Free tools" subtitle="Everyone who ran a calculator and asked for the breakdown" />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Submissions" value={stats.total} icon={Calculator} />
        <StatCard label="Last 30 days" value={stats.last30} icon={Users} />
        <StatCard label="Newsletter opt-ins" value={stats.optedIn} icon={Mail} />
        <StatCard
          label="Leak reported"
          value={formatDollars(stats.pipelineScore)}
          sub="per month, all submissions"
          icon={TrendingDown}
        />
      </div>

      <Panel title="Submissions">
        <DataTable
          head={["When", "Tool", "Name", "Email", "Business", "Leak / mo", "Close rate", "Reply speed", "Newsletter", "Delivered"]}
          rows={rows.map((r) => {
            const a = r.answers as unknown as Partial<LeakAnswers>;
            const res = r.result as unknown as Partial<LeakResult>;
            return [
              fmtDateTime(r.created_at),
              getLeadMagnet(r.magnet)?.name ?? txt(r.magnet),
              txt(r.name),
              txt(r.email),
              txt(r.company),
              r.score === null ? "-" : formatDollars(Number(r.score)),
              a.closeRate === undefined
                ? "-"
                : `${a.closeRate}% → ${res.recoveredCloseRate ?? "?"}%`,
              txt(a.replyBand),
              r.consent_marketing ? <Badge tone="gold">Opted in</Badge> : <Badge tone="muted">No</Badge>,
              <span key="d" className="flex gap-1.5">
                {r.emailed_at ? <Badge tone="ok">Email</Badge> : <Badge tone="muted">No email</Badge>}
                {r.ghl_synced_at ? <Badge tone="ok">CRM</Badge> : <Badge tone="muted">No CRM</Badge>}
              </span>,
            ];
          })}
          empty="No submissions yet. They appear the moment someone asks for a breakdown."
        />
      </Panel>
    </div>
  );
}
