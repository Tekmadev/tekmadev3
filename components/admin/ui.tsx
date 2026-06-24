import type { LucideIcon } from "lucide-react";

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-3">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-3">{children}</div>}
    </header>
  );
}

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  sub?: string;
  icon?: LucideIcon;
}) {
  const display = typeof value === "number" ? value.toLocaleString("en-US") : value;
  return (
    <div className="rounded-2xl border border-line-strong bg-surface p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-ink-4">{label}</p>
        {Icon && <Icon className="h-4 w-4 text-gold" />}
      </div>
      <p className="mt-2 font-display text-3xl font-bold text-ink">{display}</p>
      {sub && <p className="mt-1 text-xs text-ink-3">{sub}</p>}
    </div>
  );
}

export function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-line-strong bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

export function DataTable({ head, rows, empty }: { head: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-ink-4">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-4">
            {head.map((h) => (
              <th key={h} className="py-2 pr-4 font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-line last:border-0">
              {row.map((cell, j) => (
                <td key={j} className="py-2.5 pr-4 align-top text-ink-2">
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

export function Notice({ kind, children }: { kind: "ok" | "err"; children: React.ReactNode }) {
  return (
    <div
      className={
        "rounded-xl border px-4 py-3 text-sm " +
        (kind === "ok"
          ? "border-gold/40 bg-gold/[0.08] text-ink"
          : "border-signal/40 bg-signal/[0.06] text-ink")
      }
    >
      {children}
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "gold" | "ok" | "muted" }) {
  const tones: Record<string, string> = {
    neutral: "bg-bg-3 text-ink-2",
    gold: "bg-gold/15 text-gold-deep",
    ok: "bg-gold/15 text-gold-deep",
    muted: "bg-bg-3 text-ink-4",
  };
  return (
    <span className={"inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize " + tones[tone]}>
      {children}
    </span>
  );
}

/**
 * Tekmadev's operating timezone (Hamilton, Ontario). These formatters run on the
 * server, where Vercel runs in UTC, so without this every timestamp would render
 * in UTC instead of local time. Intl handles EST/EDT (DST) automatically.
 */
const BUSINESS_TZ = "America/Toronto";

/** Shared formatters so every table renders dates / money the same way. */
export function fmtDateTime(v: unknown): string {
  if (typeof v !== "string") return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: BUSINESS_TZ });
}

export function fmtDate(v: unknown): string {
  if (typeof v !== "string") return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-CA", { dateStyle: "medium", timeZone: BUSINESS_TZ });
}

export function fmtMoney(cents: unknown, currency: unknown): string {
  if (typeof cents !== "number") return "-";
  const cur = typeof currency === "string" ? currency.toUpperCase() : "CAD";
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(
    cents / 100,
  );
}

export function txt(v: unknown): string {
  return typeof v === "string" && v.length > 0 ? v : "-";
}
