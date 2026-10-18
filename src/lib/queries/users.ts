import { prisma } from "@/lib/db";

export async function countAppUsers(): Promise<number> {
  return prisma.user.count();
}

export async function listAppUsers() {
  return prisma.user.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      username: true,
      role: true,
      status: true,
      headsCount: true,
      createdAt: true,
    },
  });
}

export async function countActiveAdmins(excludeUserId?: string): Promise<number> {
  return prisma.user.count({
    where: {
      role: "ADMIN",
      status: "ACTIVE",
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
  });
}
