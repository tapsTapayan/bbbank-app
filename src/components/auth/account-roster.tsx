"use client";

import { Plus, Trash2 } from "lucide-react";
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
      <AuthBrandHero title="Welcome back" subtitle="Select an account" />

      <ul className="ui-stack-sm">
        {accounts.map((account) => (
          <li key={account.deviceCredentialId} className="group relative">
            <button
              type="button"
              onClick={() => onSelect(account)}
              className="ui-ops-row flex min-h-14 w-full items-center gap-3 p-3"
            >
              <span className="ui-avatar h-10 w-10 type-body-sm">
                {initialsFromName(account.name)}
              </span>
              <span className="min-w-0 flex-1 pr-10">
                <span className="type-body-sm block truncate font-medium">
                  {account.name}
                </span>
                <span className="type-caption mt-1 block truncate">
                  {account.loginId}
                  {account.hasPin ? " · PIN" : ""}
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(account);
              }}
              aria-label={`Remove ${account.name} from this device`}
              className="ui-icon-btn absolute right-1 top-1 !h-9 !w-9 !min-h-9 !min-w-9 opacity-80 hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onAddAnother}
        className="ui-btn ui-btn-secondary ui-btn-block mt-4"
      >
        <Plus className="h-4 w-4" />
        Another account
      </button>
    </div>
  );
}
