import Link from "next/link";
import { AlertTriangle, ArrowUpRight, Bell } from "lucide-react";
import { requireAdmin } from "@/lib/admin";
import {
  EMPTY_SUMMARY,
  decodeCursor,
  encodeCursor,
  getNotificationPrefs,
  getNotificationSummary,
  isCategory,
  listNotifications,
  type AdminNotification,
  type NotificationFilter,
} from "@/lib/admin-notifications-data";
import { ADMIN_CATEGORIES, ADMIN_EVENTS, type AdminEventKey } from "@/lib/admin-notify";
import { Notice, PageHeader, Panel } from "@/components/admin/ui";
import { CATEGORY_ICON, SEVERITY_TONE } from "@/components/admin/notification-ui";
import { DesktopAlertsToggle } from "@/components/admin/DesktopAlertsToggle";
import { cn } from "@/lib/cn";
import { markAllReadAction, markReadAction, muteCategoryAction, openNotificationAction, resolveAction } from "./actions";

export const dynamic = "force-dynamic";

const PAGE = 40;
const TZ = "America/Toronto";

const FILTERS: { key: NotificationFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "action", label: "Needs action" },
];

const dayKeyOf = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });

function dayLabel(iso: string): string {
  const key = dayKeyOf(iso);
  const now = new Date();
  if (key === dayKeyOf(now.toISOString())) return "Today";
  if (key === dayKeyOf(new Date(now.getTime() - 86_400_000).toISOString())) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric", timeZone: TZ });
}

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit", timeZone: TZ });

type Search = { filter?: string; category?: string; test?: string; cursor?: string };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const ctx = await requireAdmin();
  const viewer = { userId: ctx.user.id, isOwner: ctx.role === "owner" };
  const q = await searchParams;

  const filter = FILTERS.some((f) => f.key === q.filter) ? (q.filter as NotificationFilter) : "all";
  const category = isCategory(q.category) ? q.category : null;
  // Test rows are an owner tool. The database enforces it too.
  const includeTest = q.test === "1" && viewer.isOwner;
  const cursor = decodeCursor(q.cursor);

  const [summaryOrNull, itemsOrNull, prefs] = await Promise.all([
    getNotificationSummary(viewer),
    listNotifications(viewer, { filter, category, includeTest, cursor, limit: PAGE }),
    getNotificationPrefs(viewer),
  ]);
  // "Could not load" and "nothing new" must not look the same.
  const failed = !summaryOrNull || !itemsOrNull;
  const summary = summaryOrNull ?? EMPTY_SUMMARY;
  const items = itemsOrNull ?? [];
  const anyUnreadShown = items.some((n) => !n.is_read);
  const newestShown = items.reduce<string | null>((max, n) => (!max || n.last_occurred_at > max ? n.last_occurred_at : max), null);

  // One place builds the URL, so every chip and form keeps the other filters.
  const href = (next: Partial<Search>) => {
    const p = new URLSearchParams();
    const merged = { filter, category: category ?? undefined, test: includeTest ? "1" : undefined, ...next };
    if (merged.filter && merged.filter !== "all") p.set("filter", merged.filter);
    if (merged.category) p.set("category", merged.category);
    if (merged.test) p.set("test", "1");
    if (merged.cursor) p.set("cursor", merged.cursor);
    const s = p.toString();
    return s ? `/admin/notifications?${s}` : "/admin/notifications";
  };
  const here = href({ cursor: q.cursor && cursor ? q.cursor : undefined });

  const groups: { label: string; rows: AdminNotification[] }[] = [];
  for (const n of items) {
    const label = dayLabel(n.last_occurred_at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.rows.push(n);
    else groups.push({ label, rows: [n] });
  }

  const categories = ADMIN_CATEGORIES.filter((c) => viewer.isOwner || c.key !== "team");
  const chip = (active: boolean) =>
    cn(
      "shrink-0 snap-start rounded-full border px-3.5 py-1.5 text-sm transition-colors",
      active ? "border-gold bg-gold/15 text-gold-deep" : "border-line-strong text-ink-3 hover:text-ink",
    );
  const smallBtn =
    "rounded-full border border-line-strong px-3 py-1 text-xs text-ink-2 transition-colors hover:border-gold/50 hover:text-gold";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Notifications"
        subtitle={`${summary.unread} unread · ${summary.needsAction} need${summary.needsAction === 1 ? "s" : ""} action`}
      >
        {(summary.unread > 0 || anyUnreadShown) && (
          <form action={markAllReadAction}>
            <input type="hidden" name="back" value={here} />
            <input type="hidden" name="seen" value={newestShown ?? ""} />
            <button type="submit" className={smallBtn + " px-4 py-2 text-sm"}>
              Mark all read
            </button>
          </form>
        )}
      </PageHeader>

      {failed && <Notice kind="err">Notifications could not be loaded just now. Nothing is lost: reload in a moment.</Notice>}

      <div className="-mt-3 flex flex-col gap-2">
        <nav aria-label="Show" className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
          {FILTERS.map((f) => (
            <Link key={f.key} href={href({ filter: f.key, cursor: undefined })} aria-current={filter === f.key ? "page" : undefined} className={chip(filter === f.key)}>
              {f.label}
              {f.key === "action" && summary.needsAction > 0 ? ` (${summary.needsAction})` : ""}
            </Link>
          ))}
        </nav>
        <nav aria-label="Category" className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
          <Link href={href({ category: undefined, cursor: undefined })} className={chip(category === null)}>
            Everything
          </Link>
          {categories.map((c) => (
            <Link key={c.key} href={href({ category: c.key, cursor: undefined })} className={chip(category === c.key)}>
              {c.label}
            </Link>
          ))}
          {viewer.isOwner && (
            <Link href={href({ test: includeTest ? undefined : "1", cursor: undefined })} className={chip(includeTest)}>
              {includeTest ? "Test included" : "Include test"}
            </Link>
          )}
        </nav>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-line-strong bg-surface p-10 text-center">
          <Bell className="mx-auto h-6 w-6 text-ink-4" />
          <p className="mt-3 text-sm font-medium text-ink">
            {filter === "action" ? "Nothing is waiting on you." : filter === "unread" ? "You're all caught up." : "No notifications yet."}
          </p>
          <p className="mt-1 text-sm text-ink-4">New leads, sales, client activity and anything that breaks will land here.</p>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.label + g.rows[0].id}>
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-4">{g.label}</h2>
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line-strong bg-surface">
              {g.rows.map((n) => {
                const Icon = n.severity === "critical" ? AlertTriangle : CATEGORY_ICON[n.category] ?? Bell;
                const open = n.needs_action && !n.resolved_at;
                const label = ADMIN_EVENTS[n.event_key as AdminEventKey]?.label;
                return (
                  <li key={n.id} className={cn("flex items-start gap-3 p-4 sm:gap-4", !n.is_read && "bg-gold/[0.05]")}>
                    <span className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", SEVERITY_TONE[n.severity])}>
                      <Icon className="h-[18px] w-[18px]" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        {!n.is_read && <span aria-label="Unread" className="h-2 w-2 shrink-0 rounded-full bg-gold" />}
                        <p className={cn("text-sm leading-snug text-ink", !n.is_read && "font-semibold")}>{n.title}</p>
                        {open && (
                          <span className="rounded-full bg-signal/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-signal">
                            Needs action
                          </span>
                        )}
                        {n.is_test && (
                          <span className="rounded-full bg-signal/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-signal">
                            Test
                          </span>
                        )}
                      </div>
                      {n.body && <p className="mt-1 text-sm leading-relaxed text-ink-3">{n.body}</p>}
                      <p className="mt-1.5 text-xs text-ink-4">
                        {[
                          timeOf(n.last_occurred_at),
                          n.occurrences > 1 ? `happened ${n.occurrences} times` : null,
                          label,
                          n.actor_label,
                          n.is_muted ? "quiet category" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                        {n.resolved_at ? ` · Resolved by ${n.resolved_by ?? "staff"}` : ""}
                      </p>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {n.action_url && (
                          <form action={openNotificationAction}>
                            <input type="hidden" name="id" value={n.id} />
                            <input type="hidden" name="to" value={n.action_url} />
                            <button type="submit" className={smallBtn + " inline-flex items-center gap-1"}>
                              Open <ArrowUpRight className="h-3 w-3" />
                            </button>
                          </form>
                        )}
                        {n.needs_action && (
                          <form action={resolveAction}>
                            <input type="hidden" name="id" value={n.id} />
                            <input type="hidden" name="resolved" value={String(!n.resolved_at)} />
                            <input type="hidden" name="back" value={here} />
                            <button type="submit" className={smallBtn}>
                              {n.resolved_at ? "Reopen" : "Mark as handled"}
                            </button>
                          </form>
                        )}
                        {!n.is_read && (
                          <form action={markReadAction}>
                            <input type="hidden" name="id" value={n.id} />
                            <input type="hidden" name="back" value={here} />
                            <button type="submit" className={smallBtn}>
                              Mark read
                            </button>
                          </form>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      {items.length === PAGE && (
        <Link
          href={href({ cursor: encodeCursor(items[items.length - 1]) })}
          className="self-center rounded-full border border-line-strong px-5 py-2 text-sm text-ink-2 transition-colors hover:border-gold hover:text-gold"
        >
          Load older
        </Link>
      )}

      <Panel title="Preferences">
        <div className="flex flex-col gap-5">
          <DesktopAlertsToggle />
          <div className="border-t border-line pt-5">
            <p className="text-sm font-medium text-ink">Quiet categories</p>
            <p className="mt-0.5 text-xs text-ink-3">
              A quiet category still shows in the list. It just stops adding to your unread count. This is your setting only.
            </p>
            <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {prefs.map((p) => (
                <li key={p.category} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-2.5">
                  <span className="text-sm text-ink-2">
                    {p.label}
                    {p.muted && <span className="ml-2 text-xs text-ink-4">quiet</span>}
                  </span>
                  <form action={muteCategoryAction}>
                    <input type="hidden" name="category" value={p.category} />
                    <input type="hidden" name="muted" value={String(!p.muted)} />
                    <input type="hidden" name="back" value={here} />
                    <button type="submit" className={smallBtn}>
                      {p.muted ? "Count it again" : "Make quiet"}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Panel>
    </div>
  );
}
