import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { UserRole } from "@/generated/prisma/client";
import { getSupabaseAnonKey, getSupabaseUrl } from "./env";

const PUBLIC_PATHS = ["/", "/login", "/auth"];

const MEMBER_PREFIXES = ["/dashboard"];

const TREASURER_PREFIXES = ["/verify", "/loans-admin"];

const AUDITOR_PREFIXES = ["/audit"];

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

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
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

  if (isPublicPath(pathname)) {
    return supabaseResponse;
  }

  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    if (path === "/login") {
      url.searchParams.set("next", pathname);
    }
    return copySessionCookies(supabaseResponse, NextResponse.redirect(url));
  };

  const isProtected =
    matchesPrefix(pathname, MEMBER_PREFIXES) ||
    matchesPrefix(pathname, TREASURER_PREFIXES) ||
    matchesPrefix(pathname, AUDITOR_PREFIXES);

  if (isProtected && !isAuthenticated) {
    return redirectTo("/login");
  }

  if (!isAuthenticated) {
    return supabaseResponse;
  }

  const role = claims ? roleFromClaims(claims) : null;

  if (matchesPrefix(pathname, TREASURER_PREFIXES)) {
    if (role !== "TREASURER" && role !== "ADMIN") {
      return redirectTo("/unauthorized");
    }
  }

  if (matchesPrefix(pathname, AUDITOR_PREFIXES)) {
    if (role !== "AUDITOR" && role !== "ADMIN") {
      return redirectTo("/unauthorized");
    }
  }

  // Member-mobile routes: any authenticated app user may access.
  if (matchesPrefix(pathname, MEMBER_PREFIXES) && !role) {
    // Still require a known app role in JWT once roles are provisioned.
    // Allow through so first-login / Prisma-synced users aren't locked out;
    // Server Actions re-check against the Prisma User.role source of truth.
  }

  return supabaseResponse;
}
