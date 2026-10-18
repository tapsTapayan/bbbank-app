export const REMEMBERED_ACCOUNTS_KEY = "bbbank.rememberedAccounts";

export type RememberedAccount = {
  userId: string;
  name: string;
  /** Display login id: email for members, @username for admins. */
  loginId: string;
  role: "MEMBER" | "TREASURER" | "AUDITOR" | "ADMIN";
  deviceCredentialId: string;
  deviceToken: string;
  hasPin: boolean;
  lastUsedAt: string;
};

function isRememberedAccount(value: unknown): value is RememberedAccount {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  // Accept legacy `email` field and map callers should migrate on write.
  const loginId =
    typeof v.loginId === "string"
      ? v.loginId
      : typeof v.email === "string"
        ? v.email
        : null;
  return (
    typeof v.userId === "string" &&
    typeof v.name === "string" &&
    typeof loginId === "string" &&
    typeof v.role === "string" &&
    typeof v.deviceCredentialId === "string" &&
    typeof v.deviceToken === "string" &&
    typeof v.hasPin === "boolean" &&
    typeof v.lastUsedAt === "string"
  );
}

function normalizeAccount(raw: unknown): RememberedAccount | null {
  if (!isRememberedAccount(raw)) return null;
  const v = raw as RememberedAccount & { email?: string };
  return {
    userId: v.userId,
    name: v.name,
    loginId: v.loginId ?? v.email ?? "",
    role: v.role,
    deviceCredentialId: v.deviceCredentialId,
    deviceToken: v.deviceToken,
    hasPin: v.hasPin,
    lastUsedAt: v.lastUsedAt,
  };
}

export function readRememberedAccounts(): RememberedAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(REMEMBERED_ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeAccount)
      .filter((a): a is RememberedAccount => a !== null && a.loginId.length > 0)
      .sort(
        (a, b) =>
          new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime(),
      );
  } catch {
    return [];
  }
}

function writeRememberedAccounts(accounts: RememberedAccount[]): void {
  window.localStorage.setItem(
    REMEMBERED_ACCOUNTS_KEY,
    JSON.stringify(accounts),
  );
}

/** Upsert by userId (one remembered slot per user per device). */
export function upsertRememberedAccount(
  account: RememberedAccount,
): RememberedAccount[] {
  const existing = readRememberedAccounts().filter(
    (a) => a.userId !== account.userId,
  );
  const next = [account, ...existing];
  writeRememberedAccounts(next);
  return next;
}

export function removeRememberedAccount(userId: string): RememberedAccount[] {
  const next = readRememberedAccounts().filter((a) => a.userId !== userId);
  writeRememberedAccounts(next);
  return next;
}

export function touchRememberedAccount(userId: string): RememberedAccount[] {
  const now = new Date().toISOString();
  const next = readRememberedAccounts().map((a) =>
    a.userId === userId ? { ...a, lastUsedAt: now } : a,
  );
  writeRememberedAccounts(next);
  return next;
}

/** Sync PIN availability on this device after profile PIN create/clear. */
export function setRememberedAccountHasPin(
  userId: string,
  hasPin: boolean,
): RememberedAccount[] {
  const next = readRememberedAccounts().map((a) =>
    a.userId === userId ? { ...a, hasPin } : a,
  );
  writeRememberedAccounts(next);
  return next;
}

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}
