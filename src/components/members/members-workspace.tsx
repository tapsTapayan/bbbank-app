"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Pencil,
  Search,
  ShieldPlus,
  UserPlus,
  X,
} from "lucide-react";
import {
  createAppUser,
  resetAppUserPassword,
  updateAppUser,
} from "@/actions/users";
import { formatPHP } from "@/lib/finance/loan-calculator";
import { displayLoginId } from "@/lib/auth/staff-identity";
import type { UserRole, UserStatus } from "@/generated/prisma/client";
import { OpsWorkstation } from "@/components/ui/ops-workstation";

export type MemberRow = {
  id: string;
  name: string;
  email: string | null;
  username: string | null;
  role: UserRole;
  status: UserStatus;
  headsCount: number;
  createdAt: string;
};

type CreateModalKind = "member" | "admin" | null;

const ROLE_FILTERS = [
  "ALL",
  "MEMBER",
  "TREASURER",
  "AUDITOR",
  "ADMIN",
] as const;

export function MembersWorkspace({
  users,
  contributionPerHead = 250,
}: {
  users: MemberRow[];
  contributionPerHead?: number;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] =
    useState<(typeof ROLE_FILTERS)[number]>("ALL");
  const [toast, setToast] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);
  const [createModal, setCreateModal] = useState<CreateModalKind>(null);
  const [editing, setEditing] = useState<MemberRow | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((m) => {
      if (roleFilter !== "ALL" && m.role !== roleFilter) return false;
      if (!q) return true;
      const login = displayLoginId(m).toLowerCase();
      return (
        m.name.toLowerCase().includes(q) ||
        login.includes(q) ||
        m.role.toLowerCase().includes(q)
      );
    });
  }, [users, search, roleFilter]);

  const activeHeadsTotal = useMemo(
    () =>
      users
        .filter((m) => m.role === "MEMBER" && m.status === "ACTIVE")
        .reduce((acc, m) => acc + m.headsCount, 0),
    [users],
  );

  return (
    <OpsWorkstation
      title="Member & Role Directory"
      description={`${users.length} accounts · ${activeHeadsTotal} active member heads (${formatPHP(activeHeadsTotal * contributionPerHead)} / kinsenas pool)`}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCreateModal("member")}
            className="rl-btn rl-btn-primary rl-btn-sm"
          >
            <UserPlus className="h-4 w-4" aria-hidden />
            New Member
          </button>
          <button
            type="button"
            onClick={() => setCreateModal("admin")}
            className="rl-btn rl-btn-secondary rl-btn-sm"
          >
            <ShieldPlus className="h-4 w-4" aria-hidden />
            New Admin
          </button>
        </div>
      }
    >
      <div className="rl-stack">
        {/* Filter & Search Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative min-w-[240px] flex-1 max-w-md">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-muted)]"
              aria-hidden
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, username, or email…"
              className="rl-input pl-9"
            />
          </div>

          <div className="flex flex-wrap gap-1.5" role="tablist">
            {ROLE_FILTERS.map((r) => (
              <button
                key={r}
                type="button"
                role="tab"
                aria-selected={roleFilter === r}
                onClick={() => setRoleFilter(r)}
                className={`rl-chip !min-h-8 !px-3 ${
                  roleFilter === r ? "rl-chip-selected" : ""
                }`}
              >
                {r === "ALL" ? `All (${users.length})` : r}
              </button>
            ))}
          </div>
        </div>

        {toast ? (
          <p
            className={`rl-alert ${
              toast.type === "ok" ? "rl-alert-ok" : "rl-alert-error"
            }`}
            role="status"
          >
            {toast.text}
          </p>
        ) : null}

        {/* Mobile Cards */}
        <div className="space-y-2.5 md:hidden">
          {filtered.map((m) => (
            <div key={m.id} className="rl-card rl-card-pad">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="type-body-sm truncate font-semibold">
                    {m.name}
                  </p>
                  <p className="type-caption truncate">{displayLoginId(m)}</p>
                </div>
                <span
                  className={
                    m.status === "ACTIVE"
                      ? "rl-pill rl-pill-verified"
                      : m.status === "INACTIVE"
                        ? "rl-pill rl-pill-pending"
                        : "rl-pill rl-pill-rejected"
                  }
                >
                  {m.status}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-[var(--border-subtle)] pt-3">
                <div className="flex items-center gap-2">
                  <span className="rl-pill rl-pill-neutral">{m.role}</span>
                  <span className="type-caption font-mono">
                    {m.headsCount}H ·{" "}
                    {formatPHP(m.headsCount * contributionPerHead)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setEditing(m)}
                  className="rl-btn rl-btn-secondary rl-btn-sm"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                  Edit
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop Data Table */}
        <div className="hidden overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface-elevated)] shadow-[var(--shadow-card)] md:block">
          <table className="rl-table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Role</th>
                <th>Status</th>
                <th>Heads</th>
                <th className="text-right">Kinsenas Due</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id}>
                  <td>
                    <p className="font-semibold text-[var(--ink)]">{m.name}</p>
                    <p className="type-caption">{displayLoginId(m)}</p>
                  </td>
                  <td>
                    <span className="rl-pill rl-pill-neutral">{m.role}</span>
                  </td>
                  <td>
                    <span
                      className={
                        m.status === "ACTIVE"
                          ? "rl-pill rl-pill-verified"
                          : m.status === "INACTIVE"
                            ? "rl-pill rl-pill-pending"
                            : "rl-pill rl-pill-rejected"
                      }
                    >
                      {m.status}
                    </span>
                  </td>
                  <td className="font-mono font-semibold tabular-nums">
                    {m.headsCount}
                  </td>
                  <td className="text-right font-mono font-semibold tabular-nums">
                    {formatPHP(m.headsCount * contributionPerHead)}
                  </td>
                  <td className="text-right">
                    <button
                      type="button"
                      onClick={() => setEditing(m)}
                      className="rl-btn rl-btn-secondary rl-btn-sm"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                      Manage
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {createModal ? (
        <CreateAccountModal
          kind={createModal}
          contributionPerHead={contributionPerHead}
          onClose={() => setCreateModal(null)}
          onCreated={(message) => {
            setCreateModal(null);
            setToast({ type: "ok", text: message });
            router.refresh();
          }}
        />
      ) : null}

      {editing ? (
        <EditMemberModal
          member={editing}
          contributionPerHead={contributionPerHead}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null);
            setToast({ type: "ok", text: message });
            router.refresh();
          }}
        />
      ) : null}
    </OpsWorkstation>
  );
}

function CreateAccountModal({
  kind,
  contributionPerHead,
  onClose,
  onCreated,
}: {
  kind: "member" | "admin";
  contributionPerHead: number;
  onClose: () => void;
  onCreated: (message: string) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [headsCount, setHeadsCount] = useState(1);
  const [role, setRole] = useState<"MEMBER" | "TREASURER" | "AUDITOR">(
    "MEMBER",
  );
  const [sendInvite, setSendInvite] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      if (kind === "admin") {
        const result = await createAppUser({
          kind: "admin",
          name,
          username,
          temporaryPassword: password,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onCreated(`Admin @${username} created.`);
        return;
      }

      const result = await createAppUser({
        kind: "member",
        name,
        email,
        role,
        headsCount,
        temporaryPassword: password,
        sendInvite,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onCreated(`Member ${name} (${email}) created.`);
    });
  }

  return (
    <div
      className="rl-modal-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="rl-modal-dialog">
        <div className="flex items-center justify-between gap-2">
          <h2 className="type-heading">
            {kind === "admin" ? "New Admin Account" : "New Member Account"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rl-icon-btn rl-icon-btn-sm"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="mt-4 rl-stack">
          <label className="rl-field">
            <span className="rl-field-label">Full Name</span>
            <input
              required
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rl-input"
              placeholder="Juan Dela Cruz"
            />
          </label>

          {kind === "admin" ? (
            <label className="rl-field">
              <span className="rl-field-label">Username</span>
              <input
                required
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="rl-input font-mono"
                placeholder="admin2"
              />
            </label>
          ) : (
            <label className="rl-field">
              <span className="rl-field-label">Email Address</span>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rl-input"
                placeholder="member@cpe.edu.ph"
              />
            </label>
          )}

          <label className="rl-field">
            <span className="rl-field-label">Initial Password</span>
            <input
              required
              type="password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rl-input"
              placeholder="Minimum 8 characters"
            />
          </label>

          {kind === "member" ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="rl-field">
                  <span className="rl-field-label">Heads Count</span>
                  <input
                    required
                    type="number"
                    min={1}
                    max={50}
                    value={headsCount}
                    onChange={(e) =>
                      setHeadsCount(Math.max(1, Number(e.target.value) || 1))
                    }
                    className="rl-input font-mono"
                  />
                  <span className="rl-field-hint">
                    {formatPHP(headsCount * contributionPerHead)} / kinsenas
                  </span>
                </label>

                <label className="rl-field">
                  <span className="rl-field-label">Role</span>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as typeof role)}
                    className="rl-select"
                  >
                    <option value="MEMBER">MEMBER</option>
                    <option value="TREASURER">TREASURER</option>
                    <option value="AUDITOR">AUDITOR</option>
                  </select>
                </label>
              </div>

              <label className="flex items-center gap-2 text-xs text-[var(--ink-secondary)]">
                <input
                  type="checkbox"
                  checked={sendInvite}
                  onChange={(e) => setSendInvite(e.target.checked)}
                  className="h-4 w-4 rounded border-[var(--border)] accent-[var(--brand)]"
                />
                Send password setup email invite
              </label>
            </>
          ) : null}

          {error ? (
            <p className="rl-alert rl-alert-error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rl-btn rl-btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rl-btn rl-btn-primary"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Create Account
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditMemberModal({
  member,
  contributionPerHead,
  onClose,
  onSaved,
}: {
  member: MemberRow;
  contributionPerHead: number;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [name, setName] = useState(member.name);
  const [headsCount, setHeadsCount] = useState(member.headsCount);
  const [role, setRole] = useState(member.role);
  const [status, setStatus] = useState(member.status);
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isAdminAccount = member.role === "ADMIN" || Boolean(member.username);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateAppUser({
        userId: member.id,
        name,
        headsCount,
        role,
        status,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      if (newPassword.trim()) {
        const pwRes = await resetAppUserPassword({
          userId: member.id,
          temporaryPassword: newPassword.trim(),
          sendInvite: false,
        });
        if (!pwRes.ok) {
          setError(pwRes.error);
          return;
        }
      }

      onSaved("Account updated.");
    });
  }

  return (
    <div
      className="rl-modal-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="rl-modal-dialog">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="type-heading">Manage Account</h2>
            <p className="type-caption mt-0.5">{displayLoginId(member)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rl-icon-btn rl-icon-btn-sm"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={save} className="mt-4 rl-stack">
          <label className="rl-field">
            <span className="rl-field-label">Full Name</span>
            <input
              required
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rl-input"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="rl-field">
              <span className="rl-field-label">Heads Count</span>
              <input
                required
                type="number"
                min={1}
                max={50}
                disabled={isAdminAccount}
                value={headsCount}
                onChange={(e) =>
                  setHeadsCount(Math.max(1, Number(e.target.value) || 1))
                }
                className="rl-input font-mono disabled:opacity-60"
              />
              <span className="rl-field-hint">
                {formatPHP(headsCount * contributionPerHead)} / kinsenas
              </span>
            </label>

            <label className="rl-field">
              <span className="rl-field-label">Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
                className="rl-select"
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
                <option value="SUSPENDED">SUSPENDED</option>
              </select>
            </label>
          </div>

          <label className="rl-field">
            <span className="rl-field-label">Role</span>
            <select
              value={role}
              disabled={isAdminAccount}
              onChange={(e) => setRole(e.target.value as typeof role)}
              className="rl-select disabled:opacity-60"
            >
              {isAdminAccount ? (
                <option value="ADMIN">ADMIN</option>
              ) : (
                <>
                  <option value="MEMBER">MEMBER</option>
                  <option value="TREASURER">TREASURER</option>
                  <option value="AUDITOR">AUDITOR</option>
                </>
              )}
            </select>
          </label>

          <label className="rl-field">
            <span className="rl-field-label">Reset Password (Optional)</span>
            <input
              type="password"
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Leave blank to keep existing password"
              className="rl-input"
            />
          </label>

          {error ? (
            <p className="rl-alert rl-alert-error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rl-btn rl-btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rl-btn rl-btn-primary"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
