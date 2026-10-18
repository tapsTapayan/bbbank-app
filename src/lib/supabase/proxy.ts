import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { UserRole } from "@/generated/prisma/client";
import {
  ADMIN_PREFIXES,
  AUDITOR_PREFIXES,
  MEMBER_PREFIXES,
  SHARED_OPS_PREFIXES,
  TREASURER_ADMIN_PREFIXES,
  TREASURER_PREFIXES,
  roleHome,
} from "@/lib/auth/routes";
import { getSupabaseAnonKey, getSupabaseUrl } from "./env";

/** Paths reachable without (or regardless of) role provisioning. */
const PUBLIC_PATHS = [
  "/",
  "/login",
  "/setup",
  "/auth",
  "/unauthorized",
  "/account-status",
];

const APP_ROLES: readonly UserRole[] = [
  "MEMBER",
  "TREASURER",
  "AUDITOR",
  "ADMIN",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Reads app role from verified JWT claims.
 * Prefer `app_metadata.role` (Admin-controlled). Never trust `user_metadata`.
 */
export function roleFromClaims(claims: Record<string, unknown>): UserRole | null {
  const appMetadata = claims.app_metadata as
    | { role?: unknown }
    | null
    | undefined;
  const fromAppMeta =
    typeof appMetadata?.role === "string" ? appMetadata.role : null;
  const fromCustom =
    typeof claims.user_role === "string" ? claims.user_role : null;

  const role = fromAppMeta ?? fromCustom;
  if (role && (APP_ROLES as readonly string[]).includes(role)) {
    return role as UserRole;
  }
  return null;
}

function copySessionCookies(
  from: NextResponse,
  to: NextResponse,
): NextResponse {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie.name, cookie.value);
  });
  for (const header of ["cache-control", "expires", "pragma"] as const) {
    const value = from.headers.get(header);
    if (value) to.headers.set(header, value);
  }
  return to;
}

/**
 * Refresh the Supabase Auth session and enforce route RBAC.
 * Next.js 16 uses `proxy.ts` (formerly `middleware.ts`).
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([key, value]) =>
          supabaseResponse.headers.set(key, value),
        );
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims as Record<string, unknown> | undefined;
  const isAuthenticated = Boolean(claims?.sub);
  const pathname = request.nextUrl.pathname;
  const role = claims ? roleFromClaims(claims) : null;

  const redirectTo = (path: string, withNext = false) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    if (withNext && path === "/login") {
      url.searchParams.set("next", pathname);
    }
    return copySessionCookies(supabaseResponse, NextResponse.redirect(url));
  };

  // Signed-in users on `/` → role home (or /login to finish JWT role sync).
  // `/login` stays reachable so the client can show remember-device / PIN setup.
  if (isAuthenticated && pathname === "/") {
    if (role) {
      return redirectTo(roleHome(role));
    }
    return redirectTo("/login");
  }

  if (isPublicPath(pathname)) {
    return supabaseResponse;
  }

  const isProtected =
    matchesPrefix(pathname, MEMBER_PREFIXES) ||
    matchesPrefix(pathname, TREASURER_PREFIXES) ||
    matchesPrefix(pathname, AUDITOR_PREFIXES) ||
    matchesPrefix(pathname, SHARED_OPS_PREFIXES) ||
    matchesPrefix(pathname, TREASURER_ADMIN_PREFIXES) ||
    matchesPrefix(pathname, ADMIN_PREFIXES);

  if (isProtected && !isAuthenticated) {
    return redirectTo("/login", true);
  }

  if (!isAuthenticated) {
    return supabaseResponse;
  }

  // Admin: account management + kinsenas (+ own profile) — no other ops/member portal.
  if (role === "ADMIN") {
    const adminAllowed =
      matchesPrefix(pathname, ADMIN_PREFIXES) ||
      matchesPrefix(pathname, TREASURER_ADMIN_PREFIXES) ||
      matchesPrefix(pathname, ["/profile"]);
    if (!adminAllowed) {
      return redirectTo("/unauthorized");
    }
    return supabaseResponse;
  }

  if (matchesPrefix(pathname, SHARED_OPS_PREFIXES)) {
    if (role !== "TREASURER" && role !== "AUDITOR") {
      return redirectTo("/unauthorized");
    }
  }

  if (matchesPrefix(pathname, TREASURER_ADMIN_PREFIXES)) {
    if (role !== "TREASURER") {
      return redirectTo("/unauthorized");
    }
  }

  if (matchesPrefix(pathname, TREASURER_PREFIXES)) {
    if (role !== "TREASURER") {
      return redirectTo("/unauthorized");
    }
  }

  if (matchesPrefix(pathname, AUDITOR_PREFIXES)) {
    if (role !== "AUDITOR") {
      return redirectTo("/unauthorized");
    }
  }

  if (matchesPrefix(pathname, ADMIN_PREFIXES)) {
    return redirectTo("/unauthorized");
  }

  // Fund routes: MEMBER / TREASURER / AUDITOR may access.
  // Server Actions re-check against the Prisma User.role source of truth.

  return supabaseResponse;
}
