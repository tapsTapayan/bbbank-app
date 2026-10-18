"use client";

import { Plus, Trash2, ChevronRight, KeyRound } from "lucide-react";
import { AuthBrandHero } from "@/components/brand/auth-shell";
import {
  initialsFromName,
  type RememberedAccount,
} from "@/lib/auth/remembered-accounts";

export function AccountRoster({
  accounts,
  onSelect,
  onRemove,
  onAddAnother,
}: {
  accounts: RememberedAccount[];
  onSelect: (account: RememberedAccount) => void;
  onRemove: (account: RememberedAccount) => void;
  onAddAnother: () => void;
}) {
  return (
    <div className="w-full">
      <AuthBrandHero title="Welcome back" />

      <div className="rl-auth-panel rl-stack">
        <ul className="rl-stack-sm">
          {accounts.map((account) => (
            <li key={account.deviceCredentialId} className="group relative">
              <button
                type="button"
                onClick={() => onSelect(account)}
                className="rl-ops-row flex !flex-row items-center gap-3.5 pr-12"
              >
                <span className="rl-avatar h-11 w-11 text-sm">
                  {initialsFromName(account.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="type-body-sm block truncate font-semibold text-[var(--ink)]">
                    {account.name}
                  </span>
                  <span className="type-caption mt-0.5 flex items-center gap-1.5 truncate">
                    <span className="truncate">{account.loginId}</span>
                    {account.hasPin ? (
                      <span className="inline-flex items-center gap-0.5 rounded bg-[var(--brand-soft)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--brand)]">
                        <KeyRound className="h-2.5 w-2.5" aria-hidden />
                        PIN
                      </span>
                    ) : null}
                  </span>
                </span>
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-[var(--ink-faint)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--brand)]"
                  aria-hidden
                />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(account);
                }}
                aria-label={`Remove ${account.name} from this device`}
                className="rl-icon-btn rl-icon-btn-sm absolute right-2.5 top-1/2 -translate-y-1/2 opacity-75 hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>

        <div className="border-t border-[var(--border-subtle)] pt-3">
          <button
            type="button"
            onClick={onAddAnother}
            className="rl-btn rl-btn-secondary rl-btn-block"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Use another account
          </button>
        </div>
      </div>
    </div>
  );
}
