"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Bell, CheckCheck } from "lucide-react";
import type { AdminNotification, NotificationSummary } from "@/lib/admin-notifications-data";
import { CATEGORY_ICON, SEVERITY_TONE, timeAgo } from "@/components/admin/notification-ui";

/**
 * The live half of the notification center: one poller shared by the bell in
 * the mobile top bar, the bell in the sidebar, and the count on the nav item.
 *
 * It polls rather than holding a socket open. The tables are service-role only
 * (no RLS policies to hang a realtime subscription on), the volume is a handful
 * of events an hour, and a poll that pauses in a hidden tab costs nothing.
 */

const POLL_MS = 45_000;
const POLL_HIDDEN_MS = 120_000;
const DESKTOP_ALERTS_KEY = "tmd_admin_desktop_alerts";

export type NotificationsState = {
  summary: NotificationSummary;
  items: AdminNotification[];
  refresh: () => Promise<void>;
  markRead: (ids: string[]) => Promise<void>;
  markAllRead: () => Promise<void>;
};

export function useAdminNotifications(initial: {
  summary: NotificationSummary;
  items: AdminNotification[];
}): NotificationsState {
  const [summary, setSummary] = useState(initial.summary);
  const [items, setItems] = useState(initial.items);
  const pathname = usePathname();
  const router = useRouter();
  // Ids already seen, so a desktop alert fires once per notification, and never
  // for the backlog that was there when the tab opened.
  const seen = useRef<Set<string>>(new Set(initial.items.map((i) => i.id)));
  // Bumped by every write. A poll that started before a write must not land
  // after it and put the old counts back.
  const writes = useRef(0);

  // The layout re-renders with fresh numbers after every server action (mark
  // read, resolve) and every navigation. Take them, or the badge stays stale.
  useEffect(() => {
    setSummary(initial.summary);
    setItems(initial.items);
    for (const n of initial.items) seen.current.add(n.id);
  }, [initial.summary, initial.items]);

  const refresh = useCallback(async () => {
    const startedAt = writes.current;
    try {
      const res = await fetch("/api/admin/notifications?limit=8", { cache: "no-store" });
      if (!res.ok || startedAt !== writes.current) return;
      const json = (await res.json()) as { ok: boolean; summary: NotificationSummary; items: AdminNotification[] };
      if (!json.ok || startedAt !== writes.current) return;
      setSummary(json.summary);
      setItems(json.items);
      for (const n of json.items) {
        if (seen.current.has(n.id)) continue;
        seen.current.add(n.id);
        desktopAlert(n);
      }
    } catch {
      /* offline, signed out, or the API is down: keep showing what we have */
    }
  }, []);

  // Poll quickly while the tab is in front, slowly while it is not. It has to
  // keep going in the background: that is the only time a desktop alert or the
  // count in the tab title is of any use.
  useEffect(() => {
    let timer: number | undefined;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(
        async () => {
          await refresh();
          schedule();
        },
        document.visibilityState === "visible" ? POLL_MS : POLL_HIDDEN_MS,
      );
    };
    const onWake = () => {
      if (document.visibilityState === "visible") void refresh();
      schedule();
    };
    schedule();
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [refresh]);

  // A navigation is often the reaction to a notification, and a layout is not
  // re-rendered by one, so its props do not change. Re-read after it.
  useEffect(() => {
    void refresh();
  }, [pathname, refresh]);

  // Put the count in the tab title, so it shows while working in another tab.
  useEffect(() => {
    const strip = (t: string) => t.replace(/^\(\d+\+?\)\s*/, "");
    const base = strip(document.title);
    document.title = summary.unread > 0 ? `(${summary.unread > 99 ? "99+" : summary.unread}) ${base}` : base;
    return () => {
      document.title = strip(document.title);
    };
  }, [summary.unread, pathname]);

  const post = useCallback(
    async (body: Record<string, unknown>) => {
      writes.current += 1;
      try {
        const res = await fetch("/api/admin/notifications", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) return;
        const json = (await res.json()) as { summary?: NotificationSummary | null };
        if (json.summary) setSummary(json.summary);
        // The notifications page is server rendered: ask for it again, so a read
        // made in the bell shows there too.
        router.refresh();
      } catch {
        /* the next poll will reconcile */
      }
    },
    [router],
  );

  const markRead = useCallback(
    async (ids: string[]) => {
      setItems((cur) => cur.map((n) => (ids.includes(n.id) ? { ...n, is_read: true } : n)));
      await post({ action: "read", ids });
    },
    [post],
  );

  const markAllRead = useCallback(async () => {
    // Only up to what was actually on screen. Something that arrived since the
    // last poll has not been seen, and must not be marked read by this click.
    const newest = items.reduce<string | null>((max, n) => (!max || n.last_occurred_at > max ? n.last_occurred_at : max), null);
    setItems((cur) => cur.map((n) => ({ ...n, is_read: true })));
    await post({ action: "read_all", seen: newest });
  }, [items, post]);

  return { summary, items, refresh, markRead, markAllRead };
}

/** Opt-in desktop alert for a notification that arrived while the tab was open. */
function desktopAlert(n: AdminNotification) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (localStorage.getItem(DESKTOP_ALERTS_KEY) !== "1") return;
    if (document.visibilityState === "visible" && document.hasFocus()) return;
    new Notification(n.title, { body: n.body ?? undefined, tag: n.id, icon: "/favicon-32x32.png" });
  } catch {
    /* alerts are a nicety, never an error */
  }
}

export function desktopAlertsEnabled(): boolean {
  try {
    return (
      typeof Notification !== "undefined" &&
      Notification.permission === "granted" &&
      localStorage.getItem(DESKTOP_ALERTS_KEY) === "1"
    );
  } catch {
    return false;
  }
}

export async function setDesktopAlerts(on: boolean): Promise<boolean> {
  try {
    if (!on) {
      localStorage.setItem(DESKTOP_ALERTS_KEY, "0");
      return false;
    }
    if (typeof Notification === "undefined") return false;
    const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (permission !== "granted") return false;
    localStorage.setItem(DESKTOP_ALERTS_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

export function NotificationBell({
  state,
  align = "left",
}: {
  state: NotificationsState;
  /** Which edge of the button the panel lines up with. */
  align?: "left" | "right";
}) {
  const { summary, items, markRead, markAllRead, refresh } = state;
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  const panel = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => setOpen(false), [pathname]);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) button.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    void refresh();
    panel.current?.focus();
    // pointerdown, not mousedown: a tap on a blank area in iOS Safari sends no mouse event.
    const onDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) close(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, refresh, close]);

  const count = summary.unread;
  const urgent = summary.criticalUnread > 0;

  function openItem(n: AdminNotification) {
    if (!n.is_read) void markRead([n.id]);
    setOpen(false);
    router.push(n.action_url || "/admin/notifications");
  }

  return (
    <div ref={wrap} className="relative">
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="relative rounded-lg p-2 text-ink-2 transition-colors hover:bg-surface/70 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span
            className={
              "absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none " +
              (urgent ? "bg-signal text-bg" : "bg-gold text-bg")
            }
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panel}
          tabIndex={-1}
          role="dialog"
          aria-label="Notifications"
          // On a phone the panel is pinned to the screen, not to the bell: anchored
          // to a button 58px from the edge, a 22rem panel ran off the side.
          className={
            "z-[60] overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-[0_24px_60px_-24px_rgba(13,12,10,0.45)] outline-none " +
            "fixed inset-x-3 top-[64px] lg:absolute lg:inset-x-auto lg:top-full lg:mt-2 lg:w-[22rem] " +
            (align === "right" ? "lg:right-0" : "lg:left-0")
          }
        >
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <p className="text-sm font-semibold text-ink">Notifications</p>
            {count > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="inline-flex items-center gap-1.5 text-xs text-ink-3 transition-colors hover:text-gold"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-4">Nothing yet. New leads, sales and problems land here.</p>
          ) : (
            <ul className="max-h-[min(26rem,60vh)] divide-y divide-line overflow-y-auto">
              {items.map((n) => {
                const Icon = n.severity === "critical" ? AlertTriangle : CATEGORY_ICON[n.category] ?? Bell;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => openItem(n)}
                      className={
                        "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-bg-2 " +
                        (n.is_read ? "" : "bg-gold/[0.05]")
                      }
                    >
                      <span
                        className={
                          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg " + SEVERITY_TONE[n.severity]
                        }
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={"block text-sm leading-snug text-ink " + (n.is_read ? "" : "font-semibold")}>
                          {n.title}
                        </span>
                        {n.body && <span className="mt-0.5 block truncate text-xs text-ink-3">{n.body}</span>}
                        <span className="mt-1 flex items-center gap-2 text-[11px] text-ink-4">
                          {timeAgo(n.last_occurred_at)}
                          {n.occurrences > 1 && <span className="font-semibold text-ink-3">{n.occurrences} times</span>}
                          {n.needs_action && !n.resolved_at && (
                            <span className="rounded-full bg-signal/10 px-1.5 py-0.5 font-semibold uppercase tracking-wide text-signal">
                              Needs action
                            </span>
                          )}
                        </span>
                      </span>
                      {!n.is_read && <span aria-hidden className="mt-2 h-2 w-2 shrink-0 rounded-full bg-gold" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-xs">
            <Link href="/admin/notifications" onClick={() => close(false)} className="font-medium text-ink-2 transition-colors hover:text-gold">
              See all
            </Link>
            {summary.needsAction > 0 && (
              <Link href="/admin/notifications?filter=action" onClick={() => close(false)} className="text-signal transition-colors hover:underline">
                {summary.needsAction} need{summary.needsAction === 1 ? "s" : ""} action
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
