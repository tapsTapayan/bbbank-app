"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  ClipboardCheck,
  HandCoins,
  BookOpenCheck,
  Settings2,
  PanelLeftClose,
  PanelLeftOpen,
  Shield,
} from "lucide-react";
import { clsx } from "clsx";

const navItems = [
  {
    href: "/verify",
    label: "Treasurer Queue",
    description: "Verify payments",
    icon: ClipboardCheck,
  },
  {
    href: "/loans-admin",
    label: "Loan Requests",
    description: "Approve & disburse",
    icon: HandCoins,
  },
  {
    href: "/audit",
    label: "Auditor Ledger",
    description: "Audit verified entries",
    icon: BookOpenCheck,
  },
  {
    href: "/verify",
    label: "Fund Settings",
    description: "Cycles & rates",
    icon: Settings2,
  },
];

export default function ManagementConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex h-dvh overflow-hidden bg-[var(--console-bg)]">
      <aside
        className={clsx(
          "flex h-full shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface-elevated)] transition-[width] duration-200",
          collapsed ? "w-[68px]" : "w-60",
        )}
      >
        <div
          className={clsx(
            "flex h-14 items-center border-b border-[var(--border)]",
            collapsed ? "justify-center px-2" : "justify-between px-4",
          )}
        >
          {!collapsed && (
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--ink)] text-xs font-bold text-white">
                BB
              </span>
              <div className="leading-tight">
                <p className="text-sm font-semibold text-[var(--ink)]">BBBank</p>
                <p className="text-[10px] uppercase tracking-wider text-[var(--ink-muted)]">
                  Console
                </p>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="rounded-lg p-1.5 text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4.5 w-4.5" />
            ) : (
              <PanelLeftClose className="h-4.5 w-4.5" />
            )}
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 p-2" aria-label="Management navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href.split("#")[0]!);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={clsx(
                  "flex items-center gap-3 rounded-lg px-2.5 py-2.5 transition-colors",
                  active
                    ? "bg-[var(--brand-soft)] text-[var(--brand)]"
                    : "text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]",
                  collapsed && "justify-center",
                )}
              >
                <Icon className="h-4.5 w-4.5 shrink-0" strokeWidth={1.75} />
                {!collapsed && (
                  <span className="min-w-0">
                    <span className="block text-sm font-medium leading-tight">
                      {item.label}
                    </span>
                    <span className="block text-[11px] text-[var(--ink-muted)]">
                      {item.description}
                    </span>
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div
          className={clsx(
            "border-t border-[var(--border)] p-3",
            collapsed && "flex justify-center",
          )}
        >
          {collapsed ? (
            <Shield className="h-4 w-4 text-[var(--ink-muted)]" />
          ) : (
            <div className="rounded-lg bg-[var(--surface)] px-3 py-2">
              <p className="text-xs font-medium text-[var(--ink)]">Console</p>
              <p className="text-[11px] text-[var(--ink-muted)]">
                Maker-checker verification
              </p>
            </div>
          )}
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
