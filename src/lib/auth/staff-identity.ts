/** Private Supabase login email for username-only ADMIN accounts. Never shown as contact email. */
export const STAFF_EMAIL_DOMAIN = "staff.bbbank.local";

const USERNAME_RE = /^[a-z][a-z0-9._-]{2,31}$/;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidUsername(raw: string): boolean {
  return USERNAME_RE.test(normalizeUsername(raw));
}

export function usernameToStaffEmail(username: string): string {
  return `${normalizeUsername(username)}@${STAFF_EMAIL_DOMAIN}`;
}

export function isStaffSyntheticEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.toLowerCase().endsWith(`@${STAFF_EMAIL_DOMAIN}`);
}

/** True when the login identifier looks like an email address. */
export function looksLikeEmail(identifier: string): boolean {
  return identifier.includes("@");
}

/**
 * Resolve a login identifier to the Supabase Auth email used for password sign-in.
 * Usernames map to the synthetic staff email; emails pass through (lowercased).
 */
export function resolveAuthEmail(identifier: string): string {
  const trimmed = identifier.trim();
  if (looksLikeEmail(trimmed)) {
    return trimmed.toLowerCase();
  }
  return usernameToStaffEmail(trimmed);
}

/** Display login id for UI (never shows synthetic staff domain). */
export function displayLoginId(user: {
  email: string | null;
  username: string | null;
}): string {
  if (user.username) return `@${user.username}`;
  if (user.email && !isStaffSyntheticEmail(user.email)) return user.email;
  return user.email ?? "—";
}
