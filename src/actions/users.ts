"use server";

import { z } from "zod";
import type { UserRole, UserStatus } from "@/generated/prisma/client";
import { requireAppUser } from "@/lib/auth/session";
import {
  isValidUsername,
  normalizeUsername,
  usernameToStaffEmail,
} from "@/lib/auth/staff-identity";
import { countActiveAdmins } from "@/lib/queries/users";
import { prisma } from "@/lib/db";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const MIN_PASSWORD_LENGTH = 8;

const fundRoles = ["MEMBER", "TREASURER", "AUDITOR"] as const;

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : T))
  | { ok: false; error: string };

/** Flatten Prisma / driver errors into a short UI message. */
function formatActionError(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  const message = err.message.trim();
  if (message.includes("Unknown argument `username`")) {
    return "Database client is out of date. Restart the dev server after running `npx prisma generate`.";
  }
  if (message.includes("Can't reach database server")) {
    return "Cannot reach the database. Check DATABASE_URL and try again.";
  }
  // Prefer the first meaningful Prisma line over the full invocation dump.
  const unknownArg = message.match(/Unknown argument `[^`]+`\./);
  if (unknownArg) return unknownArg[0];
  const lines = message
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const concise = lines.find(
    (l) =>
      !l.startsWith("Invalid `") &&
      !l.startsWith("{") &&
      !l.startsWith("data:") &&
      !l.startsWith("?") &&
      l.length < 180,
  );
  return concise ?? fallback;
}

function siteOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://localhost:3000"
  );
}

async function assertCanBootstrap(): Promise<string | null> {
  const count = await prisma.user.count();
  if (count > 0) {
    return "Setup is locked. An admin account already exists.";
  }
  return null;
}

export async function bootstrapAdmin(input: {
  name: string;
  username: string;
  password: string;
}): Promise<ActionResult> {
  try {
    const locked = await assertCanBootstrap();
    if (locked) return { ok: false, error: locked };

    const name = input.name.trim();
    const username = normalizeUsername(input.username);
    const password = input.password;

    if (!name) return { ok: false, error: "Name is required." };
    if (!isValidUsername(username)) {
      return {
        ok: false,
        error:
          "Username must be 3–32 chars, start with a letter, and use only a-z, 0-9, ., _, -.",
      };
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return {
        ok: false,
        error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      };
    }

    // Re-check under create to reduce races
    if ((await prisma.user.count()) > 0) {
      return { ok: false, error: "Setup is locked. An admin account already exists." };
    }

    const authEmail = usernameToStaffEmail(username);
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email: authEmail,
      password,
      email_confirm: true,
      user_metadata: { name, username },
      app_metadata: { role: "ADMIN" },
    });

    if (error || !data.user) {
      return {
        ok: false,
        error: error?.message ?? "Could not create admin auth user.",
      };
    }

    try {
      await prisma.user.create({
        data: {
          id: data.user.id,
          name,
          username,
          email: null,
          role: "ADMIN",
          status: "ACTIVE",
          headsCount: 1,
        },
      });
    } catch (err) {
      await admin.auth.admin.deleteUser(data.user.id);
      return {
        ok: false,
        error: formatActionError(err, "Could not save admin profile."),
      };
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: formatActionError(err, "Bootstrap failed."),
    };
  }
}

const createMemberSchema = z.object({
  kind: z.literal("member"),
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  role: z.enum(fundRoles),
  headsCount: z.number().int().min(1).max(50),
  temporaryPassword: z.string().min(MIN_PASSWORD_LENGTH),
  sendInvite: z.boolean(),
});

const createAdminSchema = z.object({
  kind: z.literal("admin"),
  name: z.string().trim().min(1),
  username: z.string().trim().min(3),
  temporaryPassword: z.string().min(MIN_PASSWORD_LENGTH),
});

export type CreateAppUserResult = ActionResult<{
  userId: string;
  temporaryPassword: string;
  inviteSent: boolean;
  recoveryLink: string | null;
}>;

export async function createAppUser(
  raw: unknown,
): Promise<CreateAppUserResult> {
  try {
    await requireAppUser(["ADMIN"]);

    const memberParsed = createMemberSchema.safeParse(raw);
    const adminParsed = createAdminSchema.safeParse(raw);

    if (!memberParsed.success && !adminParsed.success) {
      return { ok: false, error: "Invalid account details." };
    }

    const admin = createAdminClient();

    if (adminParsed.success) {
      const input = adminParsed.data;
      const username = normalizeUsername(input.username);
      if (!isValidUsername(username)) {
        return {
          ok: false,
          error:
            "Username must be 3–32 chars, start with a letter, and use only a-z, 0-9, ., _, -.",
        };
      }
      const existing = await prisma.user.findUnique({ where: { username } });
      if (existing) {
        return { ok: false, error: "That username is already taken." };
      }

      const authEmail = usernameToStaffEmail(username);
      const { data, error } = await admin.auth.admin.createUser({
        email: authEmail,
        password: input.temporaryPassword,
        email_confirm: true,
        user_metadata: { name: input.name, username },
        app_metadata: { role: "ADMIN" },
      });
      if (error || !data.user) {
        return {
          ok: false,
          error: error?.message ?? "Could not create admin auth user.",
        };
      }

      try {
        await prisma.user.create({
          data: {
            id: data.user.id,
            name: input.name,
            username,
            email: null,
            role: "ADMIN",
            status: "ACTIVE",
            headsCount: 1,
          },
        });
      } catch (err) {
        await admin.auth.admin.deleteUser(data.user.id);
        return {
          ok: false,
          error: formatActionError(err, "Could not save admin profile."),
        };
      }

      return {
        ok: true,
        userId: data.user.id,
        temporaryPassword: input.temporaryPassword,
        inviteSent: false,
        recoveryLink: null,
      };
    }

    const input = memberParsed.data!;
    const email = input.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return { ok: false, error: "That email is already registered." };
    }

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: input.temporaryPassword,
      email_confirm: true,
      user_metadata: { name: input.name },
      app_metadata: { role: input.role },
    });
    if (error || !data.user) {
      return {
        ok: false,
        error: error?.message ?? "Could not create member auth user.",
      };
    }

    try {
      await prisma.user.create({
        data: {
          id: data.user.id,
          name: input.name,
          email,
          username: null,
          role: input.role,
          status: "ACTIVE",
          headsCount: input.headsCount,
        },
      });
    } catch (err) {
      await admin.auth.admin.deleteUser(data.user.id);
      return {
        ok: false,
        error: formatActionError(err, "Could not save member profile."),
      };
    }

    let inviteSent = false;
    let recoveryLink: string | null = null;

    if (input.sendInvite) {
      const { data: linkData, error: linkError } =
        await admin.auth.admin.generateLink({
          type: "recovery",
          email,
          options: { redirectTo: `${siteOrigin()}/login` },
        });
      if (!linkError && linkData?.properties?.action_link) {
        recoveryLink = linkData.properties.action_link;
      }

      const supabase = await createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email,
        { redirectTo: `${siteOrigin()}/login` },
      );
      inviteSent = !resetError;
    }

    return {
      ok: true,
      userId: data.user.id,
      temporaryPassword: input.temporaryPassword,
      inviteSent,
      recoveryLink,
    };
  } catch (err) {
    return {
      ok: false,
      error: formatActionError(err, "Could not create account."),
    };
  }
}

export type UpdateAppUserResult = ActionResult;

export async function updateAppUser(input: {
  userId: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  headsCount: number;
  /** Login email for fund members. Ignored for username-only admins. */
  email?: string;
  /** Login username for admin accounts. Ignored for fund members. */
  username?: string;
}): Promise<UpdateAppUserResult> {
  try {
    await requireAppUser(["ADMIN"]);

    const user = await prisma.user.findUnique({ where: { id: input.userId } });
    if (!user) return { ok: false, error: "User not found." };

    const name = input.name.trim();
    if (!name) return { ok: false, error: "Name is required." };

    const isAdminAccount = user.role === "ADMIN" || Boolean(user.username);
    const nextRole = input.role;

    if (isAdminAccount && nextRole !== "ADMIN") {
      const others = await countActiveAdmins(user.id);
      if (user.status === "ACTIVE" && others === 0) {
        return {
          ok: false,
          error: "Cannot demote the last active admin.",
        };
      }
    }

    if (
      user.role === "ADMIN" &&
      user.status === "ACTIVE" &&
      input.status !== "ACTIVE"
    ) {
      const others = await countActiveAdmins(user.id);
      if (others === 0) {
        return {
          ok: false,
          error: "Cannot deactivate the last active admin.",
        };
      }
    }

    if (isAdminAccount && nextRole !== "ADMIN") {
      return {
        ok: false,
        error: "Admin accounts cannot be changed to fund-member roles.",
      };
    }
    if (!isAdminAccount && nextRole === "ADMIN") {
      return {
        ok: false,
        error: "Promote to admin by creating a separate admin account.",
      };
    }
    if (!isAdminAccount && !(fundRoles as readonly string[]).includes(nextRole)) {
      return { ok: false, error: "Invalid role for a fund member." };
    }

    const headsCount = isAdminAccount
      ? 1
      : Math.max(1, Math.min(50, Math.floor(input.headsCount)));

    let nextEmail = user.email;
    let nextUsername = user.username;
    let authEmail: string | null = null;

    if (isAdminAccount) {
      if (input.username !== undefined) {
        const username = normalizeUsername(input.username);
        if (!isValidUsername(username)) {
          return {
            ok: false,
            error:
              "Username must be 3–32 chars, start with a letter, and use only a-z, 0-9, ., _, -.",
          };
        }
        if (username !== user.username) {
          const taken = await prisma.user.findUnique({ where: { username } });
          if (taken) {
            return { ok: false, error: "That username is already taken." };
          }
          nextUsername = username;
          authEmail = usernameToStaffEmail(username);
        }
      }
    } else if (input.email !== undefined) {
      const email = input.email.trim().toLowerCase();
      if (!email.includes("@") || email.length < 5) {
        return { ok: false, error: "Enter a valid email address." };
      }
      if (email !== user.email) {
        const taken = await prisma.user.findFirst({
          where: { email, NOT: { id: user.id } },
          select: { id: true },
        });
        if (taken) {
          return { ok: false, error: "That email is already registered." };
        }
        nextEmail = email;
        authEmail = email;
      }
    }

    const nameChanged = name !== user.name;
    const roleChanged = user.role !== nextRole;
    const loginChanged = authEmail !== null;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        name,
        role: nextRole,
        status: input.status,
        headsCount,
        ...(isAdminAccount
          ? { username: nextUsername }
          : { email: nextEmail }),
      },
    });

    if (nameChanged || roleChanged || loginChanged) {
      const admin = createAdminClient();
      const { error } = await admin.auth.admin.updateUserById(user.id, {
        ...(loginChanged
          ? { email: authEmail!, email_confirm: true }
          : {}),
        ...(roleChanged ? { app_metadata: { role: nextRole } } : {}),
        ...(nameChanged || (isAdminAccount && loginChanged)
          ? {
              user_metadata: {
                name,
                ...(isAdminAccount && nextUsername
                  ? { username: nextUsername }
                  : {}),
              },
            }
          : {}),
      });
      if (error) {
        return {
          ok: false,
          error: `Profile saved but auth sync failed: ${error.message}`,
        };
      }
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: formatActionError(err, "Could not update user."),
    };
  }
}

export type DeleteAppUserResult = ActionResult;

/**
 * Permanently deletes an account from Prisma + Supabase Auth.
 * Blocked for admin accounts, the signed-in admin, and users with fund history
 * (contributions, loans, payments, ledger).
 */
export async function deleteAppUser(input: {
  userId: string;
}): Promise<DeleteAppUserResult> {
  try {
    const actor = await requireAppUser(["ADMIN"]);

    if (actor.id === input.userId) {
      return { ok: false, error: "You cannot delete your own account." };
    }

    const user = await prisma.user.findUnique({ where: { id: input.userId } });
    if (!user) return { ok: false, error: "User not found." };

    if (user.role === "ADMIN" || Boolean(user.username)) {
      return {
        ok: false,
        error: "Admin accounts cannot be deleted. Set status to INACTIVE instead.",
      };
    }

    const [
      contributions,
      loans,
      payments,
      ledgerEntries,
      waiversIssued,
    ] = await Promise.all([
      prisma.contribution.count({ where: { userId: user.id } }),
      prisma.loan.count({ where: { borrowerId: user.id } }),
      prisma.paymentSubmission.count({ where: { userId: user.id } }),
      prisma.ledgerEntry.count({
        where: {
          OR: [{ userId: user.id }, { createdById: user.id }],
        },
      }),
      prisma.penaltyWaiver.count({ where: { issuedById: user.id } }),
    ]);

    const blockers: string[] = [];
    if (contributions > 0) {
      blockers.push(
        `${contributions} contribution${contributions === 1 ? "" : "s"}`,
      );
    }
    if (loans > 0) {
      blockers.push(`${loans} loan${loans === 1 ? "" : "s"}`);
    }
    if (payments > 0) {
      blockers.push(
        `${payments} payment submission${payments === 1 ? "" : "s"}`,
      );
    }
    if (ledgerEntries > 0) {
      blockers.push(
        `${ledgerEntries} ledger entr${ledgerEntries === 1 ? "y" : "ies"}`,
      );
    }
    if (waiversIssued > 0) {
      blockers.push(
        `${waiversIssued} penalty waiver${waiversIssued === 1 ? "" : "s"}`,
      );
    }

    if (blockers.length > 0) {
      return {
        ok: false,
        error: `Cannot delete — account has fund history (${blockers.join(", ")}). Set status to INACTIVE instead.`,
      };
    }

    await prisma.user.delete({ where: { id: user.id } });

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) {
      return {
        ok: false,
        error: `Account removed from the app, but auth cleanup failed: ${error.message}`,
      };
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: formatActionError(err, "Could not delete account."),
    };
  }
}

export type ResetPasswordResult = ActionResult<{
  temporaryPassword: string;
  inviteSent: boolean;
  recoveryLink: string | null;
}>;

export async function resetAppUserPassword(input: {
  userId: string;
  temporaryPassword: string;
  sendInvite: boolean;
}): Promise<ResetPasswordResult> {
  try {
    await requireAppUser(["ADMIN"]);

    if (input.temporaryPassword.length < MIN_PASSWORD_LENGTH) {
      return {
        ok: false,
        error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      };
    }

    const user = await prisma.user.findUnique({ where: { id: input.userId } });
    if (!user) return { ok: false, error: "User not found." };

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      password: input.temporaryPassword,
    });
    if (error) {
      return { ok: false, error: error.message };
    }

    let inviteSent = false;
    let recoveryLink: string | null = null;

    if (input.sendInvite && user.email) {
      const { data: linkData } = await admin.auth.admin.generateLink({
        type: "recovery",
        email: user.email,
        options: { redirectTo: `${siteOrigin()}/login` },
      });
      recoveryLink = linkData?.properties?.action_link ?? null;

      const supabase = await createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        user.email,
        { redirectTo: `${siteOrigin()}/login` },
      );
      inviteSent = !resetError;
    }

    return {
      ok: true,
      temporaryPassword: input.temporaryPassword,
      inviteSent,
      recoveryLink,
    };
  } catch (err) {
    return {
      ok: false,
      error: formatActionError(err, "Could not reset password."),
    };
  }
}

/** Resolve username → synthetic auth email for client sign-in. Public-safe. */
export async function resolveLoginIdentifier(
  identifier: string,
): Promise<ActionResult<{ authEmail: string }>> {
  try {
    const trimmed = identifier.trim();
    if (!trimmed) return { ok: false, error: "Enter your email or username." };

    if (trimmed.includes("@")) {
      return { ok: true, authEmail: trimmed.toLowerCase() };
    }

    const username = normalizeUsername(trimmed);
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || user.role !== "ADMIN") {
      // Still map to synthetic email so we don't leak existence; Auth will fail.
      return { ok: true, authEmail: usernameToStaffEmail(username) };
    }
    return { ok: true, authEmail: usernameToStaffEmail(username) };
  } catch (err) {
    return {
      ok: false,
      error: formatActionError(err, "Could not resolve login."),
    };
  }
}
