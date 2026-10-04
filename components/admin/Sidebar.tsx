"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  BarChart3,
  UserRound,
  CreditCard,
  Tag,
  BadgePercent,
  Link2,
  Mail,
  FileText,
  Building2,
  Calculator,
  Shield,
  Settings,
  LogOut,
  Menu,
  X,
  FlaskConical,
  Bell,
  Megaphone,
  RefreshCcwDot,
  Orbit,
  ChartLine,
  Users,
  Send,
  Wallet,
  SlidersHorizontal,
  ChevronDown,
  Trophy,
} from "lucide-react";
import { signOutAction } from "@/app/admin/actions";
import { NotificationBell, useAdminNotifications } from "@/components/admin/NotificationBell";
import type { AdminNotification, NotificationSummary } from "@/lib/admin-notifications-data";
import { PendingSubmit } from "@/components/PendingSubmit";
import { cn } from "@/lib/cn";
import type { AdminRole, Capability } from "@/lib/admin";

const ROLE_LABEL: Record<AdminRole, string> = { owner: "Owner", manager: "Manager", staff: "Staff" };

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown only to a role holding this capability (lib/admin-api/permissions.ts). None: everyone. */
  capability?: Capability;
  /** Shows the live unread count next to the label. */
  unreadBadge?: boolean;
  /** The label for a role without this capability ("My activity" for staff, who only see their own). */
  labelWithout?: { capability: Capability; label: string };
};

type NavGroup = { id: string; label: string; icon: LucideIcon; items: NavItem[] };

/** Always visible, above the groups: the two pages opened most. */
const TOP: NavItem[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, capability: "overview.view" },
  { href: "/admin/notifications", label: "Notifications", icon: Bell, unreadBadge: true, capability: "notifications.view" },
];

/**
 * Everything else, in groups that slide open. The group holding the current
 * page opens by itself; the rest remember how you left them (this browser
 * only). A new admin page goes into the group it belongs to, never loose.
 */
const GROUPS: NavGroup[] = [
  {
    id: "insights",
    label: "Insights",
    icon: ChartLine,
    items: [
      { href: "/admin/analytics", label: "Analytics", icon: BarChart3, capability: "analytics.view" },
      { href: "/admin/ads", label: "Ads", icon: Megaphone, capability: "ads.view" },
      {
        href: "/admin/activity",
        label: "Team activity",
        icon: Trophy,
        capability: "activity.own",
        labelWithout: { capability: "team.activity", label: "My activity" },
      },
    ],
  },
  {
    id: "customers",
    label: "Customers",
    icon: Users,
    items: [
      { href: "/admin/leads", label: "Leads", icon: UserRound, capability: "leads.view" },
      { href: "/admin/tools", label: "Free tools", icon: Calculator, capability: "tools.view" },
      { href: "/admin/clients", label: "Clients", icon: Building2, capability: "clients.view" },
      { href: "/admin/subscriptions", label: "Subscriptions", icon: CreditCard, capability: "billing.view" },
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    icon: Send,
    items: [
      { href: "/admin/email", label: "Email", icon: Mail, capability: "email.view" },
      { href: "/admin/crm", label: "CRM sync", icon: RefreshCcwDot, capability: "crm.view" },
      { href: "/admin/blog", label: "Blog", icon: FileText, capability: "blog.view" },
      { href: "/admin/links", label: "Links", icon: Link2, capability: "links.view" },
    ],
  },
  {
    id: "sales",
    label: "Sales",
    icon: Wallet,
    items: [
      { href: "/admin/pricing", label: "Pricing", icon: Tag, capability: "pricing.view" },
      { href: "/admin/coupons", label: "Coupons", icon: BadgePercent, capability: "coupons.view" },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    icon: SlidersHorizontal,
    items: [
      { href: "/admin/loader", label: "Loader", icon: Orbit, capability: "loader.view" },
      { href: "/admin/test-mode", label: "Test mode", icon: FlaskConical, capability: "testmode.view" },
      { href: "/admin/team", label: "Team", icon: Shield, capability: "team.view" },
      { href: "/admin/profile", label: "Profile", icon: Settings },
    ],
  },
];

const OPEN_KEY = "admin-nav-open";

const isActivePath = (pathname: string, href: string) =>
  href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);

function activeGroupId(pathname: string): string | null {
  return GROUPS.find((g) => g.items.some((i) => isActivePath(pathname, i.href)))?.id ?? null;
}

export function Sidebar({
  email,
  name,
  role,
  capabilities,
  notifications,
}: {
  email: string;
  name: string | null;
  role: AdminRole;
  /** What this role may use (lib/admin.ts adminCapabilities): a page it cannot open is not listed. */
  capabilities: readonly Capability[];
  /** Server-rendered starting point; the hook keeps it live from there. */
  notifications: { summary: NotificationSummary; items: AdminNotification[] };
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const inbox = useAdminNotifications(notifications);
  const allowed = (i: NavItem) => !i.capability || capabilities.includes(i.capability);
  const groups = GROUPS.map((g) => ({ ...g, items: g.items.filter(allowed) })).filter((g) => g.items.length > 0);

  const isActive = (href: string) => isActivePath(pathname, href);

  // Server and first client render agree: only the current page's group is
  // open. What you left open last time is added after mount.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const id = activeGroupId(pathname);
    return id ? { [id]: true } : {};
  });
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(OPEN_KEY) || "{}") as Record<string, boolean>;
      if (saved && typeof saved === "object") setOpenGroups((prev) => ({ ...saved, ...prev }));
    } catch {
      /* private mode or blocked storage: groups just start closed */
    }
  }, []);
  // Landing on a page opens its group, however you got there.
  useEffect(() => {
    const id = activeGroupId(pathname);
    if (id) setOpenGroups((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
  }, [pathname]);
  const toggleGroup = (id: string) =>
    setOpenGroups((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(OPEN_KEY, JSON.stringify(next));
      } catch {
        /* not remembered, still works */
      }
      return next;
    });

  const renderItem = (item: NavItem, nested = false) => {
    const active = isActive(item.href);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setOpen(false)}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-3 rounded-xl px-3 text-sm transition-colors",
          nested ? "py-2" : "py-2.5",
          active ? "bg-surface font-medium text-ink shadow-sm" : "text-ink-3 hover:bg-surface/60 hover:text-ink",
        )}
      >
        <Icon className={cn(nested ? "h-4 w-4" : "h-[18px] w-[18px]", active ? "text-gold" : "text-ink-4")} />
        <span className="flex-1">
          {item.labelWithout && !capabilities.includes(item.labelWithout.capability) ? item.labelWithout.label : item.label}
        </span>
        {item.unreadBadge && inbox.summary.unread > 0 && (
          <span
            className={
              "rounded-full px-2 py-0.5 text-[11px] font-semibold " +
              (inbox.summary.criticalUnread > 0 ? "bg-signal/10 text-signal" : "bg-gold/15 text-gold-deep")
            }
          >
            {inbox.summary.unread > 99 ? "99+" : inbox.summary.unread}
          </span>
        )}
      </Link>
    );
  };

  // The drawer is a phone thing. Close it when the page changes (back and
  // forward included) and when the screen grows into the desktop layout, where
  // nothing visible could close it and its scroll lock would freeze the page.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 64rem)");
    const onChange = () => desktop.matches && setOpen(false);
    desktop.addEventListener("change", onChange);
    return () => desktop.removeEventListener("change", onChange);
  }, []);

  // While the drawer is open on a phone, the page behind it must not scroll.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-bg/90 px-4 py-3 backdrop-blur lg:hidden">
        <Link href="/admin" className="font-display text-base font-bold text-ink">
          Tekmadev
        </Link>
        <div className="flex items-center gap-1">
          <NotificationBell state={inbox} align="right" />
          <button
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="rounded-lg border border-line-strong p-2 text-ink-2"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Overlay (mobile) */}
      {open && (
        <button
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* Sidebar */}
      <aside
        className={
          // h-dvh, not inset-y-0: on a phone the visible height shrinks under the
          // browser's toolbars, and the bottom of the menu (Sign out) sat behind them.
          "fixed left-0 top-0 z-50 flex h-dvh w-64 flex-col border-r border-line bg-bg-2 transition-transform duration-200 lg:translate-x-0 " +
          (open ? "translate-x-0" : "-translate-x-full")
        }
      >
        <div className="flex shrink-0 items-center justify-between px-5 py-5">
          <Link href="/admin" onClick={() => setOpen(false)} className="flex items-center gap-2">
            <span className="font-display text-lg font-bold text-ink">Tekmadev</span>
            <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gold-deep">
              Admin
            </span>
          </Link>
          <button onClick={() => setOpen(false)} aria-label="Close menu" className="text-ink-3 lg:hidden">
            <X className="h-5 w-5" />
          </button>
          {/* Desktop bell. On a phone it lives in the top bar instead. */}
          <div className="hidden lg:block">
            <NotificationBell state={inbox} align="left" />
          </div>
        </div>

        {/* The list scrolls on its own; the header and the account block stay put. */}
        <nav aria-label="Admin" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-3 py-2">
          {TOP.filter(allowed).map((item) => renderItem(item))}

          <div className="mx-3 my-2 h-px bg-line" />

          {groups.map((g) => {
            const isOpen = !!openGroups[g.id];
            const holdsActive = g.items.some((i) => isActive(i.href));
            const GroupIcon = g.icon;
            const panelId = `admin-nav-${g.id}`;
            return (
              <div key={g.id}>
                <button
                  type="button"
                  onClick={() => toggleGroup(g.id)}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors hover:bg-surface/60 hover:text-ink",
                    holdsActive ? "text-ink" : "text-ink-2",
                  )}
                >
                  <GroupIcon className={cn("h-[18px] w-[18px]", holdsActive ? "text-gold" : "text-ink-4")} />
                  <span className="flex-1 text-left font-medium">{g.label}</span>
                  {/* Closed on the page you are on: a dot says you are in here. */}
                  {holdsActive && !isOpen && <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-hidden />}
                  <ChevronDown
                    className={cn("h-4 w-4 text-ink-4 transition-transform duration-200", isOpen && "rotate-180")}
                    aria-hidden
                  />
                </button>
                {/* Slides open: the row animates from 0 to its content height. */}
                <div
                  id={panelId}
                  inert={!isOpen}
                  className={cn(
                    "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
                    isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                  )}
                >
                  <div className="overflow-hidden">
                    <div className="mb-1 ml-[21px] mt-0.5 flex flex-col gap-0.5 border-l border-line pl-2">
                      {g.items.map((item) => renderItem(item, true))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-line p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-3 rounded-xl px-3 py-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold/15 font-display text-sm font-bold text-gold-deep">
              {(name || email).slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{name || email}</p>
              <p className="truncate text-xs text-ink-4">{ROLE_LABEL[role]}</p>
            </div>
          </div>
          <form action={signOutAction}>
            <PendingSubmit
              className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink-3 transition-colors hover:bg-surface/60 hover:text-ink"
            >
              <LogOut className="h-[18px] w-[18px] text-ink-4" />
              Sign out
            </PendingSubmit>
          </form>
        </div>
      </aside>
    </>
  );
}
