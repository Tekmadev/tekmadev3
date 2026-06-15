"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  BarChart3,
  UserRound,
  CreditCard,
  Tag,
  BadgePercent,
  Shield,
  Settings,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { signOutAction } from "@/app/admin/actions";

type Role = "owner" | "manager";

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; ownerOnly?: boolean };

const NAV: NavItem[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/leads", label: "Leads", icon: UserRound },
  { href: "/admin/subscriptions", label: "Subscriptions", icon: CreditCard },
  { href: "/admin/pricing", label: "Pricing", icon: Tag, ownerOnly: true },
  { href: "/admin/coupons", label: "Coupons", icon: BadgePercent, ownerOnly: true },
  { href: "/admin/team", label: "Team", icon: Shield, ownerOnly: true },
  { href: "/admin/profile", label: "Profile", icon: Settings },
];

export function Sidebar({ email, name, role }: { email: string; name: string | null; role: Role }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items = NAV.filter((i) => !i.ownerOnly || role === "owner");

  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));

  return (
    <>
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-bg/90 px-4 py-3 backdrop-blur lg:hidden">
        <Link href="/admin" className="font-display text-base font-bold text-ink">
          Tekmadev
        </Link>
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="rounded-lg border border-line-strong p-2 text-ink-2"
        >
          <Menu className="h-5 w-5" />
        </button>
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
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-line bg-bg-2 transition-transform duration-200 lg:translate-x-0 " +
          (open ? "translate-x-0" : "-translate-x-full")
        }
      >
        <div className="flex items-center justify-between px-5 py-5">
          <Link href="/admin" onClick={() => setOpen(false)} className="flex items-center gap-2">
            <span className="font-display text-lg font-bold text-ink">Tekmadev</span>
            <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gold-deep">
              Admin
            </span>
          </Link>
          <button onClick={() => setOpen(false)} aria-label="Close menu" className="text-ink-3 lg:hidden">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
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
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-line p-3">
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
            <button
              type="submit"
              className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink-3 transition-colors hover:bg-surface/60 hover:text-ink"
            >
              <LogOut className="h-[18px] w-[18px] text-ink-4" />
              Sign out
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
