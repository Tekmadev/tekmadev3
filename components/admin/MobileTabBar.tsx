"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Bell, CalendarClock, LayoutDashboard, Menu, UserPlus, UserRound } from "lucide-react";
import type { Capability } from "@/lib/admin";
import { LAST_LIST_KEY } from "@/lib/leads-ui";
import { useTyping } from "@/components/admin/use-typing";
import { cn } from "@/lib/cn";

/**
 * The phone's bottom tab bar (below lg): Leads, Follow-ups, Add lead, Inbox
 * and More (opens the menu). It sits above the home indicator, hides on a
 * lead's page (the lead's own contact dock takes this place) and hides while
 * typing, so the iOS keyboard never covers or floats it.
 *
 * Nothing fixed may ever render inside it: backdrop-blur makes it the
 * containing block for fixed children.
 */

const LEADS = "/admin/leads";

/** A lead's own page (not Add lead), where the contact dock replaces this bar. */
export function isLeadDetailPath(pathname: string): boolean {
  return /^\/admin\/leads\/[^/]+$/.test(pathname) && pathname !== "/admin/leads/new";
}

/**
 * Where the Leads tab goes: the last list the person used (the list writes it
 * to sessionStorage), so its search and filters come back. Only a list URL
 * counts, never a lead, Add lead, another page, or the Follow-ups view (that
 * is its own tab).
 */
export function leadsTabHref(stored: string | null): string {
  if (typeof stored !== "string" || stored.length === 0 || stored.length > 2000) return LEADS;
  let url: URL;
  try {
    url = new URL(stored, "https://admin.invalid");
  } catch {
    return LEADS;
  }
  if (url.origin !== "https://admin.invalid") return LEADS;
  if (url.pathname !== LEADS) return LEADS;
  if (url.searchParams.get("view") === "due") return LEADS;
  return url.search ? `${LEADS}${url.search}` : LEADS;
}

type Tab = {
  key: string;
  label: string;
  icon: LucideIcon;
  href?: string;
  active: boolean;
  /** The centre "Add lead" puts its icon in a dark circle. */
  primary?: boolean;
  badge?: { text: string; critical: boolean };
  ariaLabel?: string;
};

const CELL = "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium";

export function MobileTabBar({
  capabilities,
  unread,
  critical,
  menuOpen,
  onMore,
}: {
  capabilities: readonly Capability[];
  unread: number;
  critical: boolean;
  /** The menu drawer (Sidebar's aside, id admin-menu) is open: More says so. */
  menuOpen: boolean;
  onMore: () => void;
}) {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const typing = useTyping();
  const view = searchParams?.get("view") ?? null;
  const search = searchParams?.toString() ?? "";

  // Server render and first client render agree on the plain list; the
  // remembered list is read after mount and after every navigation.
  const [leadsHref, setLeadsHref] = useState(LEADS);
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.sessionStorage.getItem(LAST_LIST_KEY);
    } catch {
      /* private mode or blocked storage: the plain list */
    }
    setLeadsHref(leadsTabHref(stored));
  }, [pathname, search]);

  if (typing || isLeadDetailPath(pathname)) return null;

  const can = (c: Capability) => capabilities.includes(c);
  const onList = pathname === LEADS;
  const tabs: Tab[] = [];

  if (can("leads.view")) {
    tabs.push({
      key: "leads",
      label: "Leads",
      icon: UserRound,
      href: leadsHref,
      // Never on a lead's page: the bar is not shown there.
      active: onList && view !== "due",
    });
    tabs.push({
      key: "followups",
      label: "Follow-ups",
      icon: CalendarClock,
      href: `${LEADS}?view=due`,
      active: onList && view === "due",
    });
  } else if (can("overview.view")) {
    tabs.push({ key: "overview", label: "Overview", icon: LayoutDashboard, href: "/admin", active: pathname === "/admin" });
  }
  if (can("leads.create")) {
    tabs.push({
      key: "add",
      label: "Add lead",
      icon: UserPlus,
      href: `${LEADS}/new`,
      active: pathname === `${LEADS}/new`,
      primary: true,
    });
  }
  if (can("notifications.view")) {
    tabs.push({
      key: "inbox",
      label: "Inbox",
      icon: Bell,
      href: "/admin/notifications",
      active: pathname === "/admin/notifications" || pathname.startsWith("/admin/notifications/"),
      badge: unread > 0 ? { text: unread > 99 ? "99+" : String(unread), critical } : undefined,
      ariaLabel: unread > 0 ? `Inbox, ${unread} unread` : undefined,
    });
  }

  return (
    <nav
      aria-label="Shortcuts"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] backdrop-blur lg:hidden"
    >
      <div className="mx-auto flex min-h-16 max-w-lg items-stretch">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <Link
              key={t.key}
              href={t.href ?? LEADS}
              aria-current={t.active ? "page" : undefined}
              aria-label={t.ariaLabel}
              className={cn(CELL, t.active ? "text-gold-deep" : "text-ink-3")}
            >
              {t.primary ? (
                // -mt-5 makes the 44px circle take the 24px of the other icons,
                // so every label lines up; the circle rises a little above the bar.
                <span
                  aria-hidden
                  className={cn(
                    "-mt-5 flex h-11 w-11 items-center justify-center rounded-full bg-ink text-bg shadow-sm",
                    t.active && "ring-2 ring-gold ring-offset-2 ring-offset-bg",
                  )}
                >
                  <Icon className="h-[22px] w-[22px]" />
                </span>
              ) : (
                <span aria-hidden className="relative flex h-6 items-center justify-center">
                  <Icon className="h-[22px] w-[22px]" />
                  {t.badge && (
                    <span
                      className={cn(
                        "absolute -right-3 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none",
                        t.badge.critical ? "bg-signal text-white" : "bg-gold text-bg",
                      )}
                    >
                      {t.badge.text}
                    </span>
                  )}
                </span>
              )}
              <span>{t.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onMore}
          aria-expanded={menuOpen}
          aria-controls="admin-menu"
          className={cn(CELL, "text-ink-3")}
        >
          <span aria-hidden className="flex h-6 items-center justify-center">
            <Menu className="h-[22px] w-[22px]" />
          </span>
          <span>More</span>
        </button>
      </div>
    </nav>
  );
}
