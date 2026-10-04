import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import { adminCan, requireAdminCapability, type AdminRole } from "@/lib/admin";
import { listAdmins } from "@/lib/admin-users";
import {
  ACTIVITY_RANGES,
  ACTIVITY_RANGE_LABELS,
  loadStaffActivity,
  type ActivityRange,
  type StaffActivityReport,
  type StaffActivityRow,
  type StaffPerson,
} from "@/lib/staff-activity";
import { CREDIT_ROLE_LABELS, StaffDataNotReady } from "@/lib/staff-constants";
import { ACTIVITY_NOT_READY } from "@/lib/admin-api/staff";
import { PageHeader, Panel, Notice, Badge, StatCard, fmtDate } from "@/components/admin/ui";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

/**
 * The staff activity scoreboard (docs/admin-api/staff.md section 5), from
 * the same lib/staff-activity.ts the admin API answers GET /team/activity and
 * GET /me/activity with. Owners and managers (`team.activity`) see everyone on
 * the team, sortable; everyone else (`activity.own`) sees only their own
 * numbers and credit rows ("My activity").
 */

const ROLE_COPY: Record<AdminRole, { label: string; tone: "gold" | "neutral" | "muted" }> = {
  owner: { label: "Owner", tone: "gold" },
  manager: { label: "Manager", tone: "neutral" },
  staff: { label: "Staff", tone: "muted" },
};

type SortKey =
  | "name"
  | "leadsFound"
  | "call"
  | "email"
  | "dm"
  | "meeting"
  | "touches"
  | "dueToday"
  | "overdue"
  | "callsBooked"
  | "clientsWon"
  | "clientsHelped";

type Column = { key: SortKey; label: string; title: string; value: (r: StaffActivityRow) => number };

const COLUMNS: Column[] = [
  { key: "leadsFound", label: "Leads found", title: "Leads they added by hand, in the range", value: (r) => r.leadsFound },
  { key: "call", label: "Calls", title: "Calls logged on leads, in the range", value: (r) => r.touches.call },
  { key: "email", label: "Emails", title: "Emails logged on leads, in the range", value: (r) => r.touches.email },
  { key: "dm", label: "DMs", title: "DMs logged on leads, in the range", value: (r) => r.touches.dm },
  { key: "meeting", label: "Meetings", title: "Meetings logged on leads, in the range", value: (r) => r.touches.meeting },
  { key: "touches", label: "Touches", title: "Every touch logged, other kinds included, in the range", value: (r) => r.touches.total },
  { key: "dueToday", label: "Due today", title: "Leads assigned to them with a follow-up today (any range)", value: (r) => r.followUps.dueToday },
  { key: "overdue", label: "Overdue", title: "Leads assigned to them with a follow-up before today (any range)", value: (r) => r.followUps.overdue },
  { key: "callsBooked", label: "Calls booked", title: "Leads they booked, in the range", value: (r) => r.callsBooked },
  { key: "clientsWon", label: "Clients won", title: "Their credit shares on clients won in the range (1.5 is one whole client and a half)", value: (r) => r.clientsWon },
  { key: "clientsHelped", label: "Clients helped", title: "Clients where they changed a task, logged a call or wrote activity, in the range", value: (r) => r.clientsHelped },
];

const SORT_KEYS: readonly SortKey[] = ["name", ...COLUMNS.map((c) => c.key)];

const display = (r: { name: string | null; email: string }) => (r.name || r.email).toLowerCase();

/** The admin API's order: most clients won, then calls booked, touches and leads found; ties by name. */
function byScore(a: StaffActivityRow, b: StaffActivityRow): number {
  return (
    b.clientsWon - a.clientsWon ||
    b.callsBooked - a.callsBooked ||
    b.touches.total - a.touches.total ||
    b.leadsFound - a.leadsFound ||
    display(a).localeCompare(display(b), "en")
  );
}

function sortRows(rows: readonly StaffActivityRow[], key: SortKey | null, dir: "asc" | "desc"): StaffActivityRow[] {
  if (!key) return [...rows].sort(byScore);
  const sign = dir === "asc" ? 1 : -1;
  if (key === "name") return [...rows].sort((a, b) => sign * display(a).localeCompare(display(b), "en"));
  const col = COLUMNS.find((c) => c.key === key);
  if (!col) return [...rows].sort(byScore);
  return [...rows].sort((a, b) => sign * (col.value(a) - col.value(b)) || byScore(a, b));
}

/** 1.5 -> "1.5", 2 -> "2", 0.3333 -> "0.33". */
const num = (n: number): string => String(Math.round(n * 100) / 100);

const pick = <T extends string>(v: string | undefined, allowed: readonly T[]): T | null => (allowed as readonly string[]).includes(v ?? "") ? (v as T) : null;

function href(range: ActivityRange, sort: SortKey | null, dir: "asc" | "desc"): string {
  const q = new URLSearchParams();
  if (range !== "7d") q.set("range", range);
  if (sort) {
    q.set("sort", sort);
    q.set("dir", dir);
  }
  const s = q.toString();
  return s ? `/admin/activity?${s}` : "/admin/activity";
}

function touchLine(t: StaffActivityRow["touches"]): string {
  const parts = [
    t.call ? `${t.call} call${t.call === 1 ? "" : "s"}` : null,
    t.email ? `${t.email} email${t.email === 1 ? "" : "s"}` : null,
    t.dm ? `${t.dm} DM${t.dm === 1 ? "" : "s"}` : null,
    t.meeting ? `${t.meeting} meeting${t.meeting === 1 ? "" : "s"}` : null,
    t.other ? `${t.other} other` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "None logged";
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; sort?: string; dir?: string }>;
}) {
  const ctx = await requireAdminCapability("activity.own");
  const seesTeam = adminCan(ctx, "team.activity");
  const sp = await searchParams;
  const range: ActivityRange = pick(sp.range, ACTIVITY_RANGES) ?? "7d";
  const sort = seesTeam ? pick(sp.sort, SORT_KEYS) : null;
  const dir: "asc" | "desc" = sp.dir === "asc" ? "asc" : sp.dir === "desc" ? "desc" : sort === "name" ? "asc" : "desc";

  // Owners and managers: everyone on the team, paused people too. Everyone else: only themselves.
  const people: StaffPerson[] = seesTeam
    ? (await listAdmins()).map((a) => ({ email: a.email, name: a.name, role: a.role, paused: a.paused }))
    : [{ email: ctx.email, name: ctx.name, role: ctx.role, paused: false }];

  let report: StaffActivityReport | null = null;
  let problem: string | null = null;
  try {
    report = await loadStaffActivity(people, range);
  } catch (err) {
    if (err instanceof StaffDataNotReady) problem = ACTIVITY_NOT_READY;
    else {
      console.error("[activity] board failed", err instanceof Error ? err.message : String(err));
      problem = "Could not load the activity board just now. Reload to try again.";
    }
  }

  const title = seesTeam ? "Team activity" : "My activity";
  const subtitle = seesTeam
    ? "What each person on the team did: leads found, outreach, bookings and the clients they helped win"
    : "What you did: leads found, outreach, bookings and the clients you helped win";
  const since = report?.since ? `Since ${fmtDate(report.since)}` : "All time";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={title} subtitle={subtitle}>
        <nav aria-label="Range" className="inline-flex rounded-full border border-line-strong bg-surface p-1">
          {ACTIVITY_RANGES.map((r) => (
            <Link
              key={r}
              href={href(r, sort, dir)}
              aria-current={r === range ? "page" : undefined}
              className={cn(
                "inline-flex min-h-9 items-center rounded-full px-4 text-sm transition-colors",
                r === range ? "bg-ink font-medium text-bg" : "text-ink-3 hover:text-ink",
              )}
            >
              {ACTIVITY_RANGE_LABELS[r]}
            </Link>
          ))}
        </nav>
      </PageHeader>

      {problem && <Notice kind="err">{problem}</Notice>}

      {report && seesTeam && <TeamBoard report={report} rows={sortRows(report.rows, sort, dir)} range={range} sort={sort} dir={dir} since={since} />}
      {report && !seesTeam && report.rows[0] && <MyBoard row={report.rows[0]} since={since} />}
    </div>
  );
}

function TeamBoard({
  report,
  rows,
  range,
  sort,
  dir,
  since,
}: {
  report: StaffActivityReport;
  rows: StaffActivityRow[];
  range: ActivityRange;
  sort: SortKey | null;
  dir: "asc" | "desc";
  since: string;
}) {
  const header = (key: SortKey, label: string, title: string, alignEnd: boolean) => {
    const active = sort === key;
    // A first click sorts numbers biggest first and names A to Z; a second click flips it.
    const next: "asc" | "desc" = active ? (dir === "asc" ? "desc" : "asc") : key === "name" ? "asc" : "desc";
    const Arrow = dir === "asc" ? ArrowUp : ArrowDown;
    return (
      <th
        key={key}
        scope="col"
        aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}
        className={cn("py-2 pr-4 font-medium whitespace-nowrap", alignEnd && "text-right")}
      >
        <Link href={href(range, key, next)} title={title} className={cn("inline-flex items-center gap-1 hover:text-ink", active && "text-ink")}>
          {label}
          {active && <Arrow className="h-3 w-3" aria-hidden />}
        </Link>
      </th>
    );
  };

  const total = (col: Column) => rows.reduce((sum, r) => sum + col.value(r), 0);
  const withCredits = rows.filter((r) => r.credits.length > 0);

  return (
    <>
      <Panel title={`${since} · today is ${fmtDate(`${report.today}T12:00:00`)}`}>
        {rows.length === 0 ? (
          <p className="text-sm text-ink-4">Nobody on the team yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-4">
                  {header("name", "Person", "Sort by name", false)}
                  {COLUMNS.map((c) => header(c.key, c.label, c.title, true))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.email} className={cn("border-b border-line last:border-0", r.paused && "opacity-70")}>
                    <th scope="row" className="py-2.5 pr-4 text-left align-top font-normal">
                      <span className="flex flex-col gap-1">
                        <span className="font-medium text-ink">{r.name || r.email}</span>
                        {r.name && <span className="text-xs text-ink-4">{r.email}</span>}
                        <span className="flex flex-wrap gap-1.5">
                          <Badge tone={ROLE_COPY[r.role].tone}>{ROLE_COPY[r.role].label}</Badge>
                          {r.paused && <Badge tone="neutral">Paused</Badge>}
                        </span>
                      </span>
                    </th>
                    {COLUMNS.map((c) => {
                      const v = c.value(r);
                      return (
                        <td
                          key={c.key}
                          className={cn(
                            "py-2.5 pr-4 text-right align-top tabular-nums",
                            v === 0 ? "text-ink-4" : c.key === "overdue" ? "font-medium text-signal" : "text-ink-2",
                            c.key === "clientsWon" && v > 0 && "font-semibold text-ink",
                          )}
                        >
                          {num(v)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              {rows.length > 1 && (
                <tfoot>
                  <tr className="border-t border-line-strong text-ink">
                    <th scope="row" className="py-2.5 pr-4 text-left font-medium">
                      Team
                    </th>
                    {COLUMNS.map((c) => (
                      <td key={c.key} className="py-2.5 pr-4 text-right font-medium tabular-nums">
                        {num(total(c))}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
        <p className="mt-4 text-xs text-ink-4">
          Clients won adds up each person&apos;s credit shares: 1.5 is one whole client and a half. Follow-ups count leads
          assigned to each person that are due today or overdue, whatever the range. Test and trashed clients never count.
        </p>
      </Panel>

      <Panel title="Credit on clients won">
        {withCredits.length === 0 ? (
          <p className="text-sm text-ink-4">No credit on clients won in this range.</p>
        ) : (
          <div className="flex flex-col gap-5">
            {withCredits.map((r) => (
              <div key={r.email}>
                <p className="text-sm font-medium text-ink">
                  {r.name || r.email} <span className="font-normal text-ink-4">· {num(r.clientsWon)} won</span>
                </p>
                <CreditList credits={r.credits} />
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}

function MyBoard({ row, since }: { row: StaffActivityRow; since: string }) {
  return (
    <>
      <p className="-mb-4 text-sm text-ink-3">{since}</p>
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Leads found" value={row.leadsFound} sub="Added by hand" />
        <StatCard label="Touches" value={row.touches.total} sub={touchLine(row.touches)} />
        <StatCard
          label="Follow-ups due today"
          value={row.followUps.dueToday}
          sub={row.followUps.overdue ? `${row.followUps.overdue} overdue` : "Nothing overdue"}
        />
        <StatCard label="Calls booked" value={row.callsBooked} />
        <StatCard label="Clients won" value={num(row.clientsWon)} sub="Your credit shares: 1.5 is one and a half" />
        <StatCard label="Clients helped" value={row.clientsHelped} sub="Tasks, calls and notes" />
      </section>
      <Panel title="Your credit">
        {row.credits.length === 0 ? (
          <p className="text-sm text-ink-4">No credit on clients won in this range yet.</p>
        ) : (
          <CreditList credits={row.credits} />
        )}
      </Panel>
    </>
  );
}

function CreditList({ credits }: { credits: StaffActivityRow["credits"] }) {
  return (
    <ul className="mt-2 divide-y divide-line">
      {credits.map((c) => (
        <li key={`${c.clientId}-${c.role}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
          <span className="min-w-0">
            <Link href={`/admin/clients/${c.clientId}#credit`} className="font-medium text-ink hover:text-gold">
              {c.businessName}
            </Link>
            <span className="ml-2 text-xs text-ink-4">won {fmtDate(c.wonAt)}</span>
          </span>
          <span className="flex items-center gap-2">
            <Badge tone="neutral">{CREDIT_ROLE_LABELS[c.role]}</Badge>
            <span className="tabular-nums text-ink-2">{num(c.share)}%</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
