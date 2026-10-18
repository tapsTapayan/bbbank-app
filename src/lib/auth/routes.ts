import type { UserRole } from "@/generated/prisma/client";

/** Path prefixes that may appear in a post-login `next` redirect. */
export const MEMBER_PREFIXES = [
  "/dashboard",
  "/pay",
  "/loans",
  "/profile",
] as const;
export const TREASURER_PREFIXES = ["/verify", "/loans-admin"] as const;
export const AUDITOR_PREFIXES = ["/audit"] as const;
/** Shared ops for treasurer + auditor (penalty passes). */
export const SHARED_OPS_PREFIXES = ["/passes"] as const;
/** Shared ops for treasurer + admin (open/manage kinsenas periods). */
export const TREASURER_ADMIN_PREFIXES = ["/kinsenas"] as const;
/** Admin account-management console (not treasurer/auditor/member ops). */
export const ADMIN_PREFIXES = ["/members", "/cycle"] as const;

const SAFE_PREFIXES = [
  ...MEMBER_PREFIXES,
  ...TREASURER_PREFIXES,
  ...AUDITOR_PREFIXES,
  ...SHARED_OPS_PREFIXES,
  ...TREASURER_ADMIN_PREFIXES,
  ...ADMIN_PREFIXES,
] as const;

function matchesPrefix(
  pathname: string,
  prefixes: readonly string[],
): boolean {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Only allow same-origin relative paths under known app prefixes.
 * Rejects protocol-relative URLs, absolute URLs, and unknown paths.
 */
export function isSafeAppPath(path: string | null | undefined): path is string {
  if (!path || typeof path !== "string") return false;
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//")) return false;
  if (path.includes("://")) return false;
  const pathname = path.split("?")[0]?.split("#")[0] ?? path;
  return matchesPrefix(pathname, SAFE_PREFIXES);
}

/** Default landing path for a provisioned app role. */
export function roleHome(role: UserRole): string {
  switch (role) {
    case "ADMIN":
      return "/members";
    case "TREASURER":
      return "/verify";
    case "AUDITOR":
      return "/audit";
    case "MEMBER":
    default:
      return "/dashboard";
  }
}

/** Whether a role may open a pathname (mirrors proxy RBAC). */
export function canAccessPath(role: UserRole, pathname: string): boolean {
  // Admin: account management + cycle + kinsenas + own profile.
  if (role === "ADMIN") {
    return (
      matchesPrefix(pathname, ADMIN_PREFIXES) ||
      matchesPrefix(pathname, TREASURER_ADMIN_PREFIXES) ||
      matchesPrefix(pathname, ["/profile"])
    );
  }
  if (matchesPrefix(pathname, MEMBER_PREFIXES)) {
    return true;
  }
  if (matchesPrefix(pathname, SHARED_OPS_PREFIXES)) {
    return role === "TREASURER" || role === "AUDITOR";
  }
  if (matchesPrefix(pathname, TREASURER_ADMIN_PREFIXES)) {
    return role === "TREASURER";
  }
  if (matchesPrefix(pathname, TREASURER_PREFIXES)) {
    return role === "TREASURER";
  }
  if (matchesPrefix(pathname, AUDITOR_PREFIXES)) {
    return role === "AUDITOR";
  }
  if (matchesPrefix(pathname, ADMIN_PREFIXES)) {
    return false;
  }
  return false;
}

/**
 * Resolve post-login redirect: honor safe `next` only when the role may access it.
 */
export function resolvePostLoginRedirect(
  role: UserRole,
  next?: string | null,
): string {
  if (isSafeAppPath(next)) {
    const pathname = next.split("?")[0]?.split("#")[0] ?? next;
    if (canAccessPath(role, pathname)) {
      return next;
    }
  }
  return roleHome(role);
}
