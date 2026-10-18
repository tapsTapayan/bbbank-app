"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  BookOpenCheck,
  Briefcase,
  CalendarRange,
  ClipboardCheck,
  Ellipsis,
  HandCoins,
  History,
  Home,
  PanelLeftClose,
  PanelLeftOpen,
  Settings2,
  TicketCheck,
  Upload,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { clsx } from "clsx";
import type { UserRole } from "@/generated/prisma/client";
import { BbbMark } from "@/components/brand/bbb-mark";
import { SignOutButton } from "@/components/auth/sign-out-button";

/**
 * Adaptive Chrome — Royal Ledger Sovereign Architecture
 * - <768px: Top contextual glass header + 5-slot bottom dock + More sheet
 * - 768–1023px: Sovereign Midnight compact icon rail
 * - ≥1024px: Collapsible Sovereign Midnight sidebar with grouped navigation & identity card
 */

type NavItem = {
  id: string;
  href: string;
  label: string;
  icon: typeof Home;
  roles: readonly UserRole[];
  section: "fund" | "ops" | "account";
};

const ALL_NAV: readonly NavItem[] = [
  {
    id: "dashboard",
    href: "/dashboard",
    label: "Overview",
    icon: Home,
    roles: ["MEMBER", "TREASURER", "AUDITOR"],
    section: "fund",
  },
  {
    id: "pay",
    href: "/pay",
    label: "Pay",
    icon: Upload,
    roles: ["MEMBER", "TREASURER", "AUDITOR"],
    section: "fund",
  },
  {
    id: "loans",
    href: "/loans",
    label: "Loans",
    icon: HandCoins,
    roles: ["MEMBER", "TREASURER", "AUDITOR"],
    section: "fund",
  },
  {
    id: "history",
    href: "/history",
    label: "History",
    icon: History,
    roles: ["MEMBER", "TREASURER", "AUDITOR"],
    section: "fund",
  },
  {
    id: "verify",
    href: "/verify",
    label: "Verify",
    icon: ClipboardCheck,
    roles: ["TREASURER"],
    section: "ops",
  },
  {
    id: "loans-admin",
    href: "/loans-admin",
    label: "Loan Desk",
    icon: Briefcase,
    roles: ["TREASURER"],
    section: "ops",
  },
  {
    id: "kinsenas",
    href: "/kinsenas",
    label: "Kinsenas",
    icon: CalendarRange,
    roles: ["TREASURER", "ADMIN"],
    section: "ops",
  },
  {
    id: "passes",
    href: "/passes",
    label: "Passes",
    icon: TicketCheck,
    roles: ["TREASURER", "AUDITOR"],
    section: "ops",
  },
  {
    id: "audit",
    href: "/audit",
    label: "Audit",
    icon: BookOpenCheck,
    roles: ["AUDITOR"],
    section: "ops",
  },
  {
    id: "members",
    href: "/members",
    label: "Accounts",
    icon: Users,
    roles: ["ADMIN"],
    section: "ops",
  },
  {
    id: "cycle",
    href: "/cycle",
    label: "Cycle",
    icon: Settings2,
    roles: ["ADMIN"],
    section: "ops",
  },
  {
    id: "profile",
    href: "/profile",
    label: "Profile",
    icon: UserRound,
    roles: ["MEMBER", "TREASURER", "AUDITOR", "ADMIN"],
    section: "account",
  },
];

const DOCK_IDS: Record<UserRole, readonly string[]> = {
  MEMBER: ["dashboard", "pay", "loans", "history"],
  TREASURER: ["verify", "pay", "loans-admin", "passes"],
  AUDITOR: ["audit", "passes", "dashboard", "loans"],
  ADMIN: ["members", "cycle", "kinsenas", "profile"],
};

const ROLE_LABEL: Record<UserRole, string> = {
  MEMBER: "Member",
  TREASURER: "Treasurer",
  AUDITOR: "Auditor",
  ADMIN: "Administrator",
};

const OPS_PREFIXES = [
  "/verify",
  "/loans-admin",
  "/audit",
  "/members",
  "/passes",
  "/kinsenas",
  "/cycle",
] as const;

function isNavActive(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isOpsPath(pathname: string): boolean {
  return OPS_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function NavLinkRow({
  item,
  pathname,
  mode,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  mode: "full" | "rail";
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const active = isNavActive(item.href, pathname);
  return (
    <Link
      href={item.href}
      title={mode === "rail" ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={clsx("rl-rail-link", mode === "rail" && "justify-center px-0")}
    >
      <Icon
        className="h-[18px] w-[18px] shrink-0"
        strokeWidth={active ? 2.25 : 1.75}
        aria-hidden
      />
      {mode === "full" ? (
        <span className="truncate">{item.label}</span>
      ) : (
        <span className="sr-only">{item.label}</span>
      )}
    </Link>
  );
}

function SidebarNav({
  items,
  pathname,
  mode,
  onNavigate,
}: {
  items: readonly NavItem[];
  pathname: string;
  mode: "full" | "rail";
  onNavigate?: () => void;
}) {
  const sections = (
    [
      { key: "fund", label: "Fund" },
      { key: "ops", label: "Ops" },
      { key: "account", label: "Account" },
    ] as const
  )
    .map((section) => ({
      ...section,
      rows: items.filter((i) => i.section === section.key),
    }))
    .filter((s) => s.rows.length > 0);

  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Primary navigation">
      {sections.map((section) => (
        <div key={section.key} className="rl-nav-section">
          {mode === "full" && sections.length > 1 ? (
            <p className="rl-nav-section-label">{section.label}</p>
          ) : null}
          {section.rows.map((item) => (
            <NavLinkRow
              key={item.id}
              item={item}
              pathname={pathname}
              mode={mode}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ))}
    </nav>
  );
}

function MoreSheet({
  open,
  onClose,
  items,
  pathname,
  loginId,
  roleLabel,
}: {
  open: boolean;
  onClose: () => void;
  items: readonly NavItem[];
  pathname: string;
  loginId: string;
  roleLabel: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] md:hidden" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-[rgb(0_21_41_/0.55)] backdrop-blur-[2px]"
        aria-label="Dismiss menu"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="more-sheet-title"
        className="rl-sheet-enter absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-[var(--radius-lg)] border-t border-[var(--border)] bg-[var(--surface-elevated)] shadow-[var(--shadow-elevated)]"
      >
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-[var(--border-strong)]" />
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-3.5">
          <div className="min-w-0">
            <p className="type-title" id="more-sheet-title">
              Workspace & Account
            </p>
            <p className="type-caption mt-0.5 truncate">
              {loginId} · {roleLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rl-icon-btn rl-icon-btn-sm"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {items.length > 0 ? (
          <nav className="space-y-1 p-3" aria-label="Additional destinations">
            {items.map((item) => {
              const Icon = item.icon;
              const active = isNavActive(item.href, pathname);
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={onClose}
                  aria-current={active ? "page" : undefined}
                  className={clsx(
                    "flex h-12 cursor-pointer items-center gap-3.5 rounded-[var(--radius-md)] px-3.5 transition-colors duration-[var(--duration-fast)]",
                    active
                      ? "bg-[var(--brand-soft)] font-semibold text-[var(--brand)]"
                      : "text-[var(--ink)] hover:bg-[var(--surface-subtle)]",
                  )}
                >
                  <Icon
                    className="h-5 w-5 shrink-0"
                    strokeWidth={active ? 2.25 : 1.75}
                    aria-hidden
                  />
                  <span className="type-body-sm font-medium">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        ) : null}

        <div className="border-t border-[var(--border-subtle)] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <SignOutButton className="rl-btn rl-btn-danger-outline rl-btn-block" />
        </div>
      </div>
    </div>
  );
}

export function AppShell({
  children,
  role,
  loginId,
}: {
  children: React.ReactNode;
  role: UserRole;
  loginId: string;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const navItems = useMemo(
    () => ALL_NAV.filter((item) => item.roles.includes(role)),
    [role],
  );

  const byId = useMemo(
    () => new Map(navItems.map((item) => [item.id, item])),
    [navItems],
  );

  const dockItems = useMemo(() => {
    return DOCK_IDS[role]
      .map((id) => byId.get(id))
      .filter((item): item is NavItem => Boolean(item));
  }, [byId, role]);

  const moreItems = useMemo(() => {
    const dockIds = new Set(dockItems.map((i) => i.id));
    return navItems.filter((item) => !dockIds.has(item.id));
  }, [dockItems, navItems]);

  const ops = isOpsPath(pathname);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    const html = document.documentElement;
    const { overflow: prevHtmlOverflow, height: prevHtmlHeight } = html.style;
    const { overflow: prevBodyOverflow, height: prevBodyHeight } =
      document.body.style;
    html.style.overflow = "hidden";
    html.style.height = "100%";
    document.body.style.overflow = "hidden";
    document.body.style.height = "100%";
    return () => {
      html.style.overflow = prevHtmlOverflow;
      html.style.height = prevHtmlHeight;
      document.body.style.overflow = prevBodyOverflow;
      document.body.style.height = prevBodyHeight;
    };
  }, []);

  const moreActive =
    moreOpen || moreItems.some((item) => isNavActive(item.href, pathname));

  const desktopMode = collapsed ? "rail" : "full";

  return (
    <div className="flex h-dvh max-h-dvh overflow-hidden bg-[var(--app-chrome)]">
      <a href="#app-main" className="rl-skip-link">
        Skip to content
      </a>

      {/* Tablet Rail (768–1023px) — Sovereign Midnight icon rail */}
      <aside
        className="rl-sidebar hidden h-full w-[var(--rail-w)] shrink-0 flex-col md:flex lg:hidden"
        aria-label="Navigation rail"
      >
        <div className="rl-sidebar-header justify-center px-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-white/95 shadow-sm">
            <BbbMark size="sm" alt="BBB" />
          </div>
        </div>
        <SidebarNav items={navItems} pathname={pathname} mode="rail" />
        <div className="mt-auto flex flex-col items-center gap-2 border-t border-white/10 p-3">
          <SignOutButton
            className="rl-rail-link w-full justify-center !mb-0 px-0"
            label=""
          />
        </div>
      </aside>

      {/* Desktop Sidebar (≥1024px) — Sovereign Midnight collapsible navigation */}
      <aside
        className={clsx(
          "rl-sidebar hidden h-full shrink-0 flex-col transition-[width] duration-[var(--duration-base)] ease-[var(--ease-out)] lg:flex",
          collapsed
            ? "w-[var(--sidebar-w-collapsed)]"
            : "w-[var(--sidebar-w)]",
        )}
        aria-label="Primary Sidebar"
      >
        <div
          className={clsx(
            "rl-sidebar-header shrink-0",
            collapsed ? "justify-center px-2" : "justify-between px-4",
          )}
        >
          {!collapsed ? (
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius)] bg-white/95 shadow-sm">
                <BbbMark size="sm" alt="BBB" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold tracking-tight text-white">
                  BBB Ledger
                </p>
                <p className="truncate text-[11px] font-medium text-white/60">
                  CPE Sinking Fund
                </p>
              </div>
            </div>
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius)] bg-white/95 shadow-sm">
              <BbbMark size="sm" alt="BBB" />
            </div>
          )}
          {!collapsed ? (
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius)] text-white/60 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Collapse sidebar"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        {collapsed ? (
          <div className="flex justify-center border-b border-white/10 py-2">
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius)] text-white/60 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Expand sidebar"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        <SidebarNav
          items={navItems}
          pathname={pathname}
          mode={desktopMode}
        />

        <div
          className={clsx(
            "mt-auto space-y-2 border-t border-white/10 p-3",
            collapsed && "flex flex-col items-center",
          )}
        >
          {!collapsed ? (
            <div className="rounded-[var(--radius-md)] border border-white/10 bg-white/[0.05] px-3 py-2.5">
              <p className="truncate text-xs font-semibold text-white">
                {loginId}
              </p>
              <p className="mt-0.5 text-[11px] font-medium text-white/60">
                {ROLE_LABEL[role]}
              </p>
            </div>
          ) : null}
          <SignOutButton
            className={clsx(
              "rl-rail-link w-full !mb-0",
              collapsed ? "justify-center px-0" : "justify-start",
            )}
            label={collapsed ? "" : "Sign out"}
          />
        </div>
      </aside>

      {/* Main Content Viewport */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile Top Bar (<768px) */}
        <header className="rl-header sticky top-0 z-40 shrink-0 md:hidden">
          <div className="flex h-full w-full items-center justify-between gap-3 px-[var(--page-pad-x)]">
            <div className="flex min-w-0 items-center gap-2.5">
              <BbbMark size="sm" alt="BBB" />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold tracking-tight text-[var(--ink)]">
                  BBB Ledger
                </p>
              </div>
            </div>
            <span className="rl-pill rl-pill-audited">
              {ROLE_LABEL[role]}
            </span>
          </div>
        </header>

        <div
          id="app-main"
          className={clsx(
            "flex min-h-0 min-w-0 flex-1 flex-col",
            ops
              ? "overflow-hidden bg-[var(--surface)] pb-[calc(var(--nav-h)+env(safe-area-inset-bottom))] md:pb-0"
              : "rl-canvas min-w-0 overflow-x-clip overflow-y-auto",
          )}
        >
          {ops ? (
            children
          ) : (
            <div className="rl-fund-main w-full min-w-0 max-w-full">{children}</div>
          )}
        </div>

        {/* Mobile Bottom Dock (<768px) */}
        <nav
          className="rl-nav-dock fixed inset-x-0 bottom-0 z-50 md:hidden"
          aria-label="Primary"
        >
          <ul className="rl-nav-bottom mx-auto flex max-w-lg items-stretch justify-around gap-0.5 px-1.5">
            {dockItems.map((item) => {
              const Icon = item.icon;
              const active = isNavActive(item.href, pathname);
              const isPay = item.id === "pay";
              return (
                <li
                  key={item.id}
                  className={clsx(
                    "flex min-w-0 flex-1",
                    isPay && "overflow-visible",
                  )}
                >
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={clsx(
                      "rl-nav-link cursor-pointer",
                      isPay && "rl-nav-link--pay",
                      active && "rl-nav-link-active",
                    )}
                  >
                    <span className="rl-nav-link-pill">
                      <Icon
                        className={isPay ? "h-5 w-5" : "h-[19px] w-[19px]"}
                        strokeWidth={isPay || active ? 2.25 : 1.75}
                        aria-hidden
                      />
                    </span>
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
            <li className="flex min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                aria-expanded={moreOpen}
                aria-haspopup="dialog"
                className={clsx(
                  "rl-nav-link cursor-pointer",
                  moreActive && "rl-nav-link-active",
                )}
              >
                <span className="rl-nav-link-pill">
                  <Ellipsis
                    className="h-[19px] w-[19px]"
                    strokeWidth={moreActive ? 2.25 : 1.75}
                    aria-hidden
                  />
                </span>
                <span>More</span>
              </button>
            </li>
          </ul>
          <div className="h-[env(safe-area-inset-bottom)]" />
        </nav>
      </div>

      <MoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        items={moreItems}
        pathname={pathname}
        loginId={loginId}
        roleLabel={ROLE_LABEL[role]}
      />
    </div>
  );
}
