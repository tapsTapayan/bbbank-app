"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, KeyRound } from "lucide-react";
import type { UserRole, UserStatus } from "@/generated/prisma/client";
import {
  createAppUser,
  resetAppUserPassword,
  updateAppUser,
} from "@/actions/users";
import { displayLoginId } from "@/lib/auth/staff-identity";
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

type CreateKind = "member" | "admin";

function randomTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#";
  let out = "";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  for (const b of bytes) out += chars[b % chars.length];
  return out;
}

export function MembersWorkspace({ users }: { users: MemberRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [secretNotice, setSecretNotice] = useState<{
    title: string;
    password: string;
    recoveryLink: string | null;
    inviteSent: boolean;
  } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createKind, setCreateKind] = useState<CreateKind>("member");
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    username: "",
    role: "MEMBER" as "MEMBER" | "TREASURER" | "AUDITOR",
    headsCount: 1,
    temporaryPassword: "",
    sendInvite: false,
  });

  const editing = useMemo(
    () => users.find((u) => u.id === editingId) ?? null,
    [users, editingId],
  );

  const [editForm, setEditForm] = useState({
    name: "",
    role: "MEMBER" as UserRole,
    status: "ACTIVE" as UserStatus,
    headsCount: 1,
  });

  function openCreate(kind: CreateKind) {
    setCreateKind(kind);
    setError(null);
    setForm({
      name: "",
      email: "",
      username: "",
      role: "MEMBER",
      headsCount: 1,
      temporaryPassword: randomTempPassword(),
      sendInvite: false,
    });
    setShowCreate(true);
  }

  function openEdit(user: MemberRow) {
    setEditingId(user.id);
    setError(null);
    setEditForm({
      name: user.name,
      role: user.role,
      status: user.status,
      headsCount: user.headsCount,
    });
  }

  function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const payload =
        createKind === "admin"
          ? {
              kind: "admin" as const,
              name: form.name,
              username: form.username,
              temporaryPassword: form.temporaryPassword,
            }
          : {
              kind: "member" as const,
              name: form.name,
              email: form.email,
              role: form.role,
              headsCount: form.headsCount,
              temporaryPassword: form.temporaryPassword,
              sendInvite: form.sendInvite,
            };

      const result = await createAppUser(payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setShowCreate(false);
      setSecretNotice({
        title: "Account created — copy credentials now",
        password: result.temporaryPassword,
        recoveryLink: result.recoveryLink,
        inviteSent: result.inviteSent,
      });
      router.refresh();
    });
  }

  function onSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setError(null);
    startTransition(async () => {
      const result = await updateAppUser({
        userId: editing.id,
        name: editForm.name,
        role: editForm.role,
        status: editForm.status,
        headsCount: editForm.headsCount,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditingId(null);
      router.refresh();
    });
  }

  function onResetPassword(user: MemberRow, sendInvite: boolean) {
    const temporaryPassword = randomTempPassword();
    setError(null);
    startTransition(async () => {
      const result = await resetAppUserPassword({
        userId: user.id,
        temporaryPassword,
        sendInvite: sendInvite && Boolean(user.email),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSecretNotice({
        title: `Password reset for ${user.name}`,
        password: result.temporaryPassword,
        recoveryLink: result.recoveryLink,
        inviteSent: result.inviteSent,
      });
    });
  }

  return (
    <OpsWorkstation
      title="Accounts"
      description="Manage member, treasurer, auditor, and admin logins"
      bodyClassName="ui-stack"
      actions={
        <>
          <button
            type="button"
            onClick={() => openCreate("member")}
            className="ui-btn ui-btn-primary"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add member
          </button>
          <button
            type="button"
            onClick={() => openCreate("admin")}
            className="ui-btn ui-btn-secondary"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add admin
          </button>
        </>
      }
    >
        <p className="type-caption">
          Only <span className="font-medium text-[var(--ink)]">ACTIVE</span>{" "}
          members can request loans (Rule #5). Set status to Inactive or
          Suspended to block new borrowing; heads count drives ₱250/kinsena dues.
        </p>

        {error ? (
          <p className="ui-alert ui-alert-error" role="alert">
            {error}
          </p>
        ) : null}

        {secretNotice ? (
          <div className="ui-alert ui-alert-warn">
            <p className="font-semibold">{secretNotice.title}</p>
            <p className="mt-2 font-mono type-caption break-all">
              Temp password: {secretNotice.password}
            </p>
            {secretNotice.recoveryLink ? (
              <p className="mt-1 font-mono type-caption break-all">
                Reset link: {secretNotice.recoveryLink}
              </p>
            ) : null}
            <p className="mt-1 type-caption">
              {secretNotice.inviteSent
                ? "Recovery email was requested (requires Supabase SMTP)."
                : "Share the password securely. It will not be shown again."}
            </p>
            <button
              type="button"
              className="mt-2 type-caption font-semibold underline"
              onClick={() => setSecretNotice(null)}
            >
              Dismiss
            </button>
          </div>
        ) : null}

        <div className="ui-data-cards">
          {users.length === 0 ? (
            <p className="ui-inset py-8 text-center type-body-sm type-muted">
              No accounts yet.
            </p>
          ) : null}
          {users.map((user) => (
            <article key={user.id} className="ui-data-card ui-stack-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="type-body-sm font-semibold truncate">
                    {user.name}
                  </p>
                  <p className="type-caption mt-1 truncate">
                    {displayLoginId(user)}
                  </p>
                </div>
                <span
                  className={
                    user.status === "ACTIVE"
                      ? "ui-pill ui-pill-audited shrink-0"
                      : user.status === "SUSPENDED"
                        ? "ui-pill ui-pill-rejected shrink-0"
                        : "ui-pill ui-pill-neutral shrink-0"
                  }
                >
                  {user.status}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="ui-pill ui-pill-verified">
                  {user.role}
                </span>
                <span className="type-caption">
                  Heads: {user.username ? "—" : user.headsCount}
                </span>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => openEdit(user)}
                  className="ui-btn ui-btn-secondary !h-10 !min-h-10 flex-1 type-caption font-semibold"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => onResetPassword(user, false)}
                  disabled={pending}
                  className="ui-btn ui-btn-ghost !h-10 !min-h-10 flex-1 type-caption font-semibold"
                >
                  <KeyRound className="h-3.5 w-3.5" aria-hidden />
                  Reset PW
                </button>
              </div>
            </article>
          ))}
        </div>

        <div className="ui-data-table ui-table-wrap min-h-0 flex-1">
          <table className="ui-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Login</th>
                <th>Role</th>
                <th>Status</th>
                <th>Heads</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="font-medium text-[var(--ink)]">{user.name}</td>
                  <td className="text-[var(--ink-muted)]">
                    {displayLoginId(user)}
                  </td>
                  <td>
                    <span className="ui-pill ui-pill-verified">
                      {user.role}
                    </span>
                  </td>
                  <td>
                    <span
                      className={
                        user.status === "ACTIVE"
                          ? "ui-pill ui-pill-audited"
                          : user.status === "SUSPENDED"
                            ? "ui-pill ui-pill-rejected"
                            : "ui-pill ui-pill-neutral"
                      }
                    >
                      {user.status}
                    </span>
                  </td>
                  <td className="tabular-nums">
                    {user.username ? "—" : user.headsCount}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(user)}
                        className="ui-btn ui-btn-sm ui-btn-ghost type-caption font-semibold text-[var(--brand)]"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => onResetPassword(user, false)}
                        disabled={pending}
                        className="ui-btn ui-btn-sm ui-btn-ghost type-caption font-semibold"
                      >
                        <KeyRound className="h-3.5 w-3.5" aria-hidden />
                        Reset PW
                      </button>
                      {user.email ? (
                        <button
                          type="button"
                          onClick={() => onResetPassword(user, true)}
                          disabled={pending}
                          className="ui-btn ui-btn-sm ui-btn-ghost type-caption font-semibold"
                        >
                          Reset + email
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      {showCreate ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[rgb(0_21_41_/0.5)] p-4">
          <form
            onSubmit={onCreate}
            className="ui-panel ui-stack w-full max-w-md"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-account-title"
          >
            <h2 className="type-title" id="create-account-title">
              {createKind === "admin" ? "New admin" : "New fund member"}
            </h2>
            <label className="ui-field">
              <span className="ui-field-label">Name</span>
              <input
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="ui-input"
              />
            </label>
            {createKind === "admin" ? (
              <label className="ui-field">
                <span className="ui-field-label">Username</span>
                <input
                  required
                  value={form.username}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, username: e.target.value }))
                  }
                  className="ui-input"
                />
              </label>
            ) : (
              <>
                <label className="ui-field">
                  <span className="ui-field-label">Email</span>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, email: e.target.value }))
                    }
                    className="ui-input"
                  />
                </label>
                <label className="ui-field">
                  <span className="ui-field-label">Role</span>
                  <select
                    value={form.role}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        role: e.target.value as typeof form.role,
                      }))
                    }
                    className="ui-select"
                  >
                    <option value="MEMBER">MEMBER</option>
                    <option value="TREASURER">TREASURER</option>
                    <option value="AUDITOR">AUDITOR</option>
                  </select>
                </label>
                <label className="ui-field">
                  <span className="ui-field-label">Heads count</span>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    required
                    value={form.headsCount}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        headsCount: Number(e.target.value) || 1,
                      }))
                    }
                    className="ui-input"
                  />
                </label>
                <label className="flex min-h-11 items-center gap-3 type-body-sm">
                  <input
                    type="checkbox"
                    checked={form.sendInvite}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, sendInvite: e.target.checked }))
                    }
                    className="h-4 w-4"
                  />
                  Send invite / recovery email
                </label>
              </>
            )}
            <label className="ui-field">
              <span className="ui-field-label">Temporary password</span>
              <input
                required
                value={form.temporaryPassword}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    temporaryPassword: e.target.value,
                  }))
                }
                className="ui-input font-mono"
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="ui-btn ui-btn-ghost"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending}
                className="ui-btn ui-btn-primary"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Create
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {editing ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[rgb(0_21_41_/0.5)] p-4">
          <form
            onSubmit={onSaveEdit}
            className="ui-panel ui-stack w-full max-w-md"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-account-title"
          >
            <h2 className="type-title" id="edit-account-title">
              Edit {editing.name}
            </h2>
            <label className="ui-field">
              <span className="ui-field-label">Name</span>
              <input
                required
                value={editForm.name}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, name: e.target.value }))
                }
                className="ui-input"
              />
            </label>
            {editing.username ? (
              <p className="type-caption">
                Admin account (@{editing.username}) — role stays ADMIN.
              </p>
            ) : (
              <>
                <label className="ui-field">
                  <span className="ui-field-label">Role</span>
                  <select
                    value={editForm.role}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        role: e.target.value as UserRole,
                      }))
                    }
                    className="ui-select"
                  >
                    <option value="MEMBER">MEMBER</option>
                    <option value="TREASURER">TREASURER</option>
                    <option value="AUDITOR">AUDITOR</option>
                  </select>
                </label>
                <label className="ui-field">
                  <span className="ui-field-label">Heads count</span>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={editForm.headsCount}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        headsCount: Number(e.target.value) || 1,
                      }))
                    }
                    className="ui-input"
                  />
                </label>
              </>
            )}
            <label className="ui-field">
              <span className="ui-field-label">Status</span>
              <select
                value={editForm.status}
                onChange={(e) =>
                  setEditForm((f) => ({
                    ...f,
                    status: e.target.value as UserStatus,
                  }))
                }
                className="ui-select"
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
                <option value="SUSPENDED">SUSPENDED</option>
              </select>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="ui-btn ui-btn-ghost"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending}
                className="ui-btn ui-btn-primary"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </OpsWorkstation>
  );
}
