import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Portal UI kit. Mobile-first: everything stacks on small screens and only
 * spreads out from `sm` / `md` up. Touch targets are at least 44px tall.
 */

export const inputCls =
  "w-full rounded-xl border border-line-strong bg-surface px-4 py-3 text-base text-ink outline-none transition-colors focus:border-gold sm:text-sm";

export const selectCls = inputCls + " appearance-none";

export const btnPrimary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-bg transition-colors hover:bg-ink-2 disabled:cursor-not-allowed disabled:opacity-60";

export const btnSecondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:border-gold hover:text-gold disabled:cursor-not-allowed disabled:opacity-60";

export const btnGhost =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium text-ink-3 transition-colors hover:text-ink";

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-3">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
    </header>
  );
}

export function Panel({
  id,
  title,
  description,
  action,
  children,
  className,
}: {
  id?: string;
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("scroll-mt-24 rounded-2xl border border-line-strong bg-surface p-5 sm:p-6", className)}>
      {(title || action) && (
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-1 text-sm text-ink-3">{description}</p>}
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="rounded-2xl border border-line-strong bg-surface p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-ink-4">{label}</p>
        {Icon && <Icon className="h-4 w-4 text-gold" />}
      </div>
      <p className="mt-2 font-display text-2xl font-bold text-ink sm:text-3xl">{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-3">{sub}</p>}
    </div>
  );
}

export type Tone = "neutral" | "gold" | "ok" | "warn" | "muted" | "signal";

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: Tone }) {
  const tones: Record<Tone, string> = {
    neutral: "bg-bg-3 text-ink-2",
    gold: "bg-gold/15 text-gold-deep",
    ok: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    warn: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    muted: "bg-bg-3 text-ink-4",
    signal: "bg-signal/10 text-signal",
  };
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone])}>
      {children}
    </span>
  );
}

export function Notice({ kind, children }: { kind: "ok" | "err" | "info"; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3 text-sm text-ink",
        kind === "ok" && "border-gold/40 bg-gold/[0.08]",
        kind === "err" && "border-signal/40 bg-signal/[0.06]",
        kind === "info" && "border-line-strong bg-bg-2",
      )}
    >
      {children}
    </div>
  );
}

export function Field({
  label,
  help,
  required,
  htmlFor,
  children,
}: {
  label: string;
  help?: string;
  required?: boolean;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {label}
        {required && <span className="ml-1 text-gold">*</span>}
      </label>
      {children}
      {help && <p className="text-xs text-ink-4">{help}</p>}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong px-5 py-8 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {body && <p className="mt-1 text-sm text-ink-3">{body}</p>}
      {action && (
        <Link href={action.href} className={cn(btnSecondary, "mt-4")}>
          {action.label}
        </Link>
      )}
    </div>
  );
}

export function ProgressBar({ percent, tone = "gold" }: { percent: number; tone?: "gold" | "ok" }) {
  const p = Math.max(0, Math.min(100, percent));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-bg-3" role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-[width]", tone === "ok" ? "bg-emerald-500" : "bg-gold")} style={{ width: `${p}%` }} />
    </div>
  );
}

/** Definition-list row that stacks on mobile. */
export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:gap-6">
      <dt className="text-xs uppercase tracking-wide text-ink-4 sm:w-44 sm:shrink-0 sm:pt-0.5">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-ink-2">{children}</dd>
    </div>
  );
}

const TZ = "America/Toronto";

export function fmtDate(v: string | null | undefined): string {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-CA", { dateStyle: "medium", timeZone: TZ });
}

export function fmtDateTime(v: string | null | undefined): string {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: TZ });
}

export function fmtBytes(n: number | null | undefined): string {
  if (!n) return "-";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function humanize(v: string | null | undefined): string {
  if (!v) return "-";
  return v.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
