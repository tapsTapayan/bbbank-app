import { requirePageUser } from "@/lib/auth/session";
import { listAppUsers } from "@/lib/queries/users";
import { MembersWorkspace } from "@/components/members/members-workspace";

export default async function MembersPage() {
  await requirePageUser(["ADMIN"], "/members");
  const users = await listAppUsers();

  return (
    <MembersWorkspace
      users={users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        username: u.username,
        role: u.role,
        status: u.status,
        headsCount: u.headsCount,
        createdAt: u.createdAt.toISOString(),
      }))}
    />
  );
}
