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
import { BbbMark, BbbWordmark } from "@/components/brand/bbb-mark";
import { SignOutButton } from "@/components/auth/sign-out-button";

/**
 * Adaptive navigation (Material Adaptive + HIG):
 * - ≥768px: sidebar only
 * - <768px: brand strip + bottom dock (≤5) — never both hamburger and dock
 * Overflow destinations live in a "More" sheet, not a competing top nav.
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
    label: "Home",
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
    label: "Loan desk",
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

/** Primary dock order per role (max 4 real destinations; 5th may be More). */
const DOCK_IDS: Record<UserRole, readonly string[]> = {
  MEMBER: ["dashboard", "pay", "loans", "profile"],
  TREASURER: ["verify", "pay", "loans-admin", "passes"],
  AUDITOR: ["audit", "passes", "dashboard", "loans"],
  ADMIN: ["members", "cycle", "kinsenas", "profile"],
};

const ROLE_LABEL: Record<UserRole, string> = {
  MEMBER: "Member",
  TREASURER: "Treasurer",
  AUDITOR: "Auditor",
  ADMIN: "Admin",
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
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const active = isNavActive(item.href, pathname);
  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={clsx("ui-rail-link", collapsed && "justify-center px-0")}
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
      {!collapsed ? (
        <span className="type-body-sm font-medium">{item.label}</span>
      ) : null}
    </Link>
  );
}

function SidebarNav({
  items,
  pathname,
  collapsed,
  onNavigate,
}: {
  items: readonly NavItem[];
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const sections = (
    [
      { key: "fund", label: "Fund" },
      { key: "ops", label: "Operations" },
      { key: "account", label: "Account" },
    ] as const
  )
    .map((section) => ({
      ...section,
      rows: items.filter((i) => i.section === section.key),
    }))
    .filter((s) => s.rows.length > 0);

  return (
    <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="App">
      {sections.map((section) => (
        <div key={section.key} className="ui-nav-section">
          {!collapsed && sections.length > 1 ? (
            <p className="type-label px-2.5 pb-1.5">{section.label}</p>
          ) : null}
          {section.rows.map((item) => (
            <NavLinkRow
              key={item.id}
              item={item}
              pathname={pathname}
              collapsed={collapsed}
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
        className="absolute inset-0 bg-[rgb(0_21_41_/0.45)]"
        aria-label="Dismiss menu"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="more-sheet-title"
        className="ui-sheet-enter absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface-elevated)] shadow-[var(--shadow-elevated)]"
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div>
            <p className="type-title" id="more-sheet-title">
              More
            </p>
            <p className="type-caption mt-0.5">
              {loginId} · {roleLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ui-icon-btn"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="space-y-1 p-3" aria-label="More destinations">
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
                  "flex h-12 cursor-pointer items-center gap-3 rounded-[var(--radius)] px-3 transition-[background-color,color] duration-[var(--duration-fast)] ease-[var(--ease-out)]",
                  active
                    ? "bg-[var(--brand-soft)] text-[var(--brand)]"
                    : "text-[var(--ink)] hover:bg-[var(--surface)]",
                )}
              >
                <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden />
                <span className="type-body-sm font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-[var(--border)] p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <SignOutButton className="ui-btn ui-btn-ghost ui-btn-block !justify-start" />
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

  const byId = useMemo(() => {
    const map = new Map(navItems.map((item) => [item.id, item]));
    return map;
  }, [navItems]);

  const dockItems = useMemo(() => {
    return DOCK_IDS[role]
      .map((id) => byId.get(id))
      .filter((item): item is NavItem => Boolean(item));
  }, [byId, role]);

  /** Destinations not on the dock — opened from More (staff overflow). */
  const moreItems = useMemo(() => {
    const dockIds = new Set(dockItems.map((i) => i.id));
    return navItems.filter((item) => !dockIds.has(item.id));
  }, [dockItems, navItems]);

  const needsMoreSlot = moreItems.length > 0;

  const ops = isOpsPath(pathname);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  /* Lock document scroll — only #app-main (fund) or ops panes scroll. */
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

  return (
    <div className="flex h-dvh max-h-dvh overflow-hidden bg-[var(--app-chrome)]">
      <a href="#app-main" className="ui-skip-link">
        Skip to content
      </a>

      {/* Desktop / tablet: sidebar only */}
      <aside
        className={clsx(
          "ui-ops-sidebar h-full shrink-0 flex-col transition-[width] duration-[var(--duration-base)] ease-[var(--ease-out)]",
          collapsed
            ? "w-[var(--sidebar-w-collapsed)]"
            : "w-[var(--sidebar-w)]",
        )}
      >
        <div
          className={clsx(
            "ui-header shrink-0",
            collapsed ? "justify-center px-2" : "justify-between px-3",
          )}
        >
          {!collapsed ? (
            <div className="flex min-w-0 items-center gap-2.5">
              <BbbMark size="md" alt="BBB" />
              <div className="min-w-0">
                <p className="type-body-sm font-semibold text-[var(--ink)]">
                  BBB
                </p>
                <p className="type-caption mt-0.5">{ROLE_LABEL[role]}</p>
              </div>
            </div>
          ) : (
            <BbbMark size="sm" alt="BBB" />
          )}
          {!collapsed ? (
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              className="ui-icon-btn ui-icon-btn-sm"
              aria-label="Collapse sidebar"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        {collapsed ? (
          <div className="flex justify-center border-b border-[var(--border)] py-2">
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              className="ui-icon-btn ui-icon-btn-sm"
              aria-label="Expand sidebar"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        <SidebarNav items={navItems} pathname={pathname} collapsed={collapsed} />

        <div
          className={clsx(
            "mt-auto space-y-1.5 border-t border-[var(--border)] p-3",
            collapsed && "flex flex-col items-center",
          )}
        >
          {!collapsed ? (
            <div className="ui-inset">
              <p className="type-body-sm truncate font-medium">{loginId}</p>
              <p className="type-caption mt-1">{ROLE_LABEL[role]}</p>
            </div>
          ) : null}
          <SignOutButton
            className={clsx(
              "ui-btn ui-btn-ghost justify-start px-2.5 disabled:opacity-50",
              collapsed && "justify-center px-0",
            )}
            label={collapsed ? "" : "Sign out"}
          />
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile brand strip — identity only, not a second nav */}
        <header className="ui-header sticky top-0 z-40 shrink-0 md:hidden">
          <div className="flex h-full w-full items-center justify-between gap-3 px-[var(--page-pad-x)]">
            <BbbWordmark size="md" showTagline={false} />
            <span className="type-caption shrink-0">{ROLE_LABEL[role]}</span>
          </div>
        </header>

        <div
          id="app-main"
          className={clsx(
            "flex min-h-0 flex-1 flex-col",
            ops
              ? "overflow-hidden bg-[var(--surface)] pb-[calc(var(--nav-h)+env(safe-area-inset-bottom))] md:pb-0"
              : "ui-canvas overflow-y-auto",
          )}
        >
          {ops ? children : <div className="ui-fund-main">{children}</div>}
        </div>

        {/* Mobile bottom dock */}
        <nav
          className="ui-nav-dock fixed inset-x-0 bottom-0 z-50 md:hidden"
          aria-label="Primary"
        >
          <ul className="ui-nav-bottom mx-auto flex max-w-lg items-stretch justify-around gap-0.5 px-1.5">
            {dockItems.map((item) => {
              const Icon = item.icon;
              const active = isNavActive(item.href, pathname);
              const isPay = item.id === "pay";
              return (
                <li key={item.id} className="flex min-w-0 flex-1">
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    aria-label={item.label}
                    className={clsx(
                      "ui-nav-link type-caption cursor-pointer",
                      isPay && "relative -mt-2.5",
                      !isPay &&
                        (active
                          ? "ui-nav-link-active"
                          : "text-[var(--ink-muted)]"),
                    )}
                  >
                    {isPay ? (
                      <>
                        <span
                          className={clsx(
                            "ui-nav-pay",
                            active
                              ? "bg-[var(--brand-accent)]"
                              : "bg-[var(--brand)]",
                          )}
                        >
                          <Icon
                            className="h-5 w-5"
                            strokeWidth={2}
                            aria-hidden
                          />
                        </span>
                        <span
                          className={clsx(
                            active
                              ? "font-semibold text-[var(--brand)]"
                              : "text-[var(--ink-muted)]",
                          )}
                        >
                          Pay
                        </span>
                      </>
                    ) : (
                      <>
                        <Icon
                          className="h-5 w-5"
                          strokeWidth={active ? 2.25 : 1.75}
                          aria-hidden
                        />
                        <span className="truncate">{item.label}</span>
                      </>
                    )}
                  </Link>
                </li>
              );
            })}
            {needsMoreSlot || role === "ADMIN" ? (
              <li className="flex min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => setMoreOpen(true)}
                  aria-expanded={moreOpen}
                  aria-haspopup="dialog"
                  className={clsx(
                    "ui-nav-link type-caption w-full cursor-pointer",
                    moreActive
                      ? "ui-nav-link-active"
                      : "text-[var(--ink-muted)]",
                  )}
                >
                  <Ellipsis
                    className="h-5 w-5"
                    strokeWidth={moreActive ? 2.25 : 1.75}
                    aria-hidden
                  />
                  <span>More</span>
                </button>
              </li>
            ) : null}
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
