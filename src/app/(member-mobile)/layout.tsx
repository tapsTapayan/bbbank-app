"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Wallet,
  Upload,
  HandCoins,
  UserRound,
} from "lucide-react";
import { clsx } from "clsx";

const navItems = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/dashboard#equity", label: "Equity", icon: Wallet },
  { href: "/dashboard#upload", label: "Pay", icon: Upload },
  { href: "/dashboard#loan", label: "Loans", icon: HandCoins },
  { href: "/dashboard#profile", label: "Profile", icon: UserRound },
];

export default function MemberMobileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-full flex-col bg-[var(--surface)]">
      {/* Desktop / tablet top header */}
      <header className="sticky top-0 z-40 hidden border-b border-[var(--border)] bg-[var(--surface-elevated)]/95 backdrop-blur md:block">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--brand)] text-sm font-bold text-white">
              BB
            </span>
            <div>
              <p className="text-sm font-semibold text-[var(--ink)]">BBBank</p>
              <p className="text-xs text-[var(--ink-muted)]">Member portal</p>
            </div>
          </div>
          <nav className="flex items-center gap-1">
            {navItems.slice(0, 4).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  pathname.startsWith("/dashboard")
                    ? "text-[var(--brand)]"
                    : "text-[var(--ink-muted)] hover:text-[var(--ink)]",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--surface-elevated)]/95 backdrop-blur md:hidden">
        <div className="flex h-12 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--brand)] text-xs font-bold text-white">
              BB
            </span>
            <span className="text-sm font-semibold text-[var(--ink)]">BBBank</span>
          </div>
          <span className="rounded-full bg-[var(--brand-soft)] px-2.5 py-0.5 text-xs font-medium text-[var(--brand)]">
            Member
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-24 pt-4 md:px-6 md:pb-8 md:pt-6">
        {children}
      </main>

      {/* Sticky bottom nav — mobile only */}
      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--border)] bg-[var(--surface-elevated)]/95 backdrop-blur md:hidden"
        aria-label="Member navigation"
      >
        <ul className="mx-auto flex h-16 max-w-lg items-stretch justify-around px-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isPay = item.label === "Pay";
            return (
              <li key={item.href} className="flex flex-1">
                <Link
                  href={item.href}
                  className={clsx(
                    "flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium",
                    isPay ? "relative -mt-3" : "text-[var(--ink-muted)]",
                  )}
                >
                  {isPay ? (
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--brand)] text-white shadow-lg shadow-[var(--brand)]/25">
                      <Icon className="h-5 w-5" strokeWidth={2.25} />
                    </span>
                  ) : (
                    <>
                      <Icon className="h-5 w-5" strokeWidth={1.75} />
                      <span>{item.label}</span>
                    </>
                  )}
                  {isPay && (
                    <span className="mt-0.5 text-[10px] font-medium text-[var(--brand)]">
                      Pay
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>
    </div>
  );
}
