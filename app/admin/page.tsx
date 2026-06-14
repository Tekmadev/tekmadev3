import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { getDashboardData, type Row, type Tally } from "@/lib/admin-data";
import { signOutAction } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

function dt(v: unknown): string {
  if (typeof v !== "string") return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" });
}

function money(cents: unknown, currency: unknown): string {
  if (typeof cents !== "number") return "—";
  const cur = typeof currency === "string" ? currency.toUpperCase() : "USD";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(
    cents / 100,
  );
}

function txt(v: unknown): string {
  return typeof v === "string" && v.length > 0 ? v : "—";
}

export default async function AdminDashboard() {
  const user = await requireAdmin();
  const data = await getDashboardData();

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Dashboard</h1>
          <p className="mt-1 text-sm text-ink-3">{user.email}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/pricing"
            className="rounded-full border border-line-strong px-4 py-2 text-sm text-ink-2 transition-colors hover:border-ink hover:text-ink"
          >
            Edit pricing
          </Link>
          <form action={signOutAction}>
            <button
              type="submit"
              className="rounded-full border border-line-strong px-4 py-2 text-sm text-ink-2 transition-colors hover:border-ink hover:text-ink"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      {!data ? (
        <p className="mt-12 rounded-2xl border border-line-strong bg-surface p-6 text-sm text-ink-2">
          Connect the Supabase server env (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) to load data.
        </p>
      ) : (
        <>
          <section className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <Stat label="Total leads" value={data.counts.leads} />
            <Stat label="Booked calls" value={data.counts.bookings} />
            <Stat label="Active subscriptions" value={data.counts.activeSubs} />
            <Stat label="Pageviews (30d)" value={data.counts.pageviews30} />
            <Stat
              label="Consent (30d)"
              value={`${data.counts.consentGranted30} / ${data.counts.consentDenied30}`}
              sub={acceptRate(data.counts.consentGranted30, data.counts.consentDenied30)}
            />
          </section>

          <section className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title="Top traffic sources (30d)">
              <BarList items={data.topSources} />
            </Panel>
            <Panel title="Top pages (30d)">
              <BarList items={data.topPages} />
            </Panel>
          </section>

          <section className="mt-8">
            <Panel title="Pageviews by day (30d)">
              <ByDay data={data.byDay} />
            </Panel>
          </section>

          <section className="mt-8">
            <Panel title="Recent bookings / leads">
              <Table
                head={["When", "Name", "Email", "Status", "Source", "Campaign"]}
                rows={data.recentLeads.map((r) => [
                  dt(r.created_at),
                  txt(r.name),
                  txt(r.email),
                  txt(r.status),
                  txt(r.utm_source),
                  txt(r.utm_campaign),
                ])}
                empty="No bookings yet. They appear here once the Cal.com webhook is connected."
              />
            </Panel>
          </section>

          <section className="mt-8">
            <Panel title="Recent subscriptions">
              <Table
                head={["When", "Email", "Tier", "Status", "Amount", "Source"]}
                rows={data.recentSubs.map((r) => [
                  dt(r.created_at),
                  txt(r.email),
                  txt(r.tier),
                  txt(r.status),
                  money(r.amount_total, r.currency),
                  txt(r.utm_source),
                ])}
                empty="No subscriptions yet. They appear here once the Stripe webhook is connected."
              />
            </Panel>
          </section>

          <section className="mt-8">
            <Panel title="Recent pageviews">
              <Table
                head={["When", "Path", "Source", "Country", "Device"]}
                rows={data.recentEvents.map((r) => [
                  dt(r.created_at),
                  txt(r.path),
                  txt(r.utm_source),
                  txt(r.country),
                  txt(r.device),
                ])}
                empty="No pageviews captured yet."
              />
            </Panel>
          </section>
        </>
      )}
    </main>
  );
}

function acceptRate(granted: number, denied: number): string {
  const total = granted + denied;
  if (total === 0) return "no choices yet";
  return `${Math.round((granted / total) * 100)}% accept`;
}

function Stat({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  const display = typeof value === "number" ? value.toLocaleString("en-US") : value;
  return (
    <div className="rounded-2xl border border-line-strong bg-surface p-5">
      <p className="text-xs uppercase tracking-wide text-ink-4">{label}</p>
      <p className="mt-2 font-display text-3xl font-bold text-ink">{display}</p>
      {sub && <p className="mt-1 text-xs text-ink-3">{sub}</p>}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line-strong bg-surface p-5">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function BarList({ items }: { items: Tally[] }) {
  if (items.length === 0) return <p className="text-sm text-ink-4">No data yet.</p>;
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-3">
          <span className="w-40 shrink-0 truncate text-sm text-ink-2" title={it.label}>
            {it.label}
          </span>
          <span className="relative h-5 flex-1 overflow-hidden rounded bg-bg-3">
            <span
              className="absolute inset-y-0 left-0 rounded bg-gold/70"
              style={{ width: `${(it.count / max) * 100}%` }}
            />
          </span>
          <span className="w-10 shrink-0 text-right text-sm tabular-nums text-ink-3">{it.count}</span>
        </li>
      ))}
    </ul>
  );
}

function ByDay({ data }: { data: { day: string; count: number }[] }) {
  if (data.length === 0) return <p className="text-sm text-ink-4">No pageviews yet.</p>;
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="flex h-32 items-end gap-1">
      {data.map((d) => (
        <div key={d.day} className="flex flex-1 flex-col items-center gap-1" title={`${d.day}: ${d.count}`}>
          <span
            className="w-full rounded-t bg-gold/60"
            style={{ height: `${Math.max((d.count / max) * 100, 2)}%` }}
          />
          <span className="text-[9px] text-ink-4">{d.day.slice(5)}</span>
        </div>
      ))}
    </div>
  );
}

function Table({ head, rows, empty }: { head: string[]; rows: string[][]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-ink-4">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-4">
            {head.map((h) => (
              <th key={h} className="py-2 pr-4 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-line last:border-0">
              {row.map((cell, j) => (
                <td key={j} className="py-2.5 pr-4 text-ink-2">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
