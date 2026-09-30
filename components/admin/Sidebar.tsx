"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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
} from "lucide-react";
import { signOutAction } from "@/app/admin/actions";
import { NotificationBell, useAdminNotifications } from "@/components/admin/NotificationBell";
import type { AdminNotification, NotificationSummary } from "@/lib/admin-notifications-data";
import { PendingSubmit } from "@/components/PendingSubmit";

type Role = "owner" | "manager";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  ownerOnly?: boolean;
  /** Shows the live unread count next to the label. */
  unreadBadge?: boolean;
};

const NAV: NavItem[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/notifications", label: "Notifications", icon: Bell, unreadBadge: true },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/ads", label: "Ads", icon: Megaphone, ownerOnly: true },
  { href: "/admin/leads", label: "Leads", icon: UserRound },
  { href: "/admin/tools", label: "Free tools", icon: Calculator },
  { href: "/admin/clients", label: "Clients", icon: Building2 },
  { href: "/admin/subscriptions", label: "Subscriptions", icon: CreditCard },
  { href: "/admin/email", label: "Email", icon: Mail, ownerOnly: true },
  { href: "/admin/crm", label: "CRM sync", icon: RefreshCcwDot, ownerOnly: true },
  { href: "/admin/blog", label: "Blog", icon: FileText, ownerOnly: true },
  { href: "/admin/pricing", label: "Pricing", icon: Tag, ownerOnly: true },
  { href: "/admin/coupons", label: "Coupons", icon: BadgePercent, ownerOnly: true },
  { href: "/admin/links", label: "Links", icon: Link2, ownerOnly: true },
  { href: "/admin/loader", label: "Loader", icon: Orbit, ownerOnly: true },
  { href: "/admin/test-mode", label: "Test mode", icon: FlaskConical, ownerOnly: true },
  { href: "/admin/team", label: "Team", icon: Shield, ownerOnly: true },
  { href: "/admin/profile", label: "Profile", icon: Settings },
];

export function Sidebar({
  email,
  name,
  role,
  notifications,
}: {
  email: string;
  name: string | null;
  role: Role;
  /** Server-rendered starting point; the hook keeps it live from there. */
  notifications: { summary: NotificationSummary; items: AdminNotification[] };
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const inbox = useAdminNotifications(notifications);
  const items = NAV.filter((i) => !i.ownerOnly || role === "owner");

  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));

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
        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-3 py-2">
          {items.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors " +
                  (active
                    ? "bg-surface font-medium text-ink shadow-sm"
                    : "text-ink-3 hover:bg-surface/60 hover:text-ink")
                }
              >
                <Icon className={"h-[18px] w-[18px] " + (active ? "text-gold" : "text-ink-4")} />
                <span className="flex-1">{item.label}</span>
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
          })}
        </nav>

        <div className="shrink-0 border-t border-line p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-3 rounded-xl px-3 py-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold/15 font-display text-sm font-bold text-gold-deep">
              {(name || email).slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{name || email}</p>
              <p className="truncate text-xs capitalize text-ink-4">{role}</p>
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
