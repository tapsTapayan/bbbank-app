import { displayLoginId } from "@/lib/auth/staff-identity";
import { requirePageUser } from "@/lib/auth/session";
import { ProfileSettings } from "./profile-settings";

/** Auth-bound profile — request-time. */
export const instant = false;

export default async function ProfilePage() {
  const user = await requirePageUser(undefined, "/profile");

  return (
    <ProfileSettings
      userId={user.id}
      name={user.name}
      loginId={displayLoginId(user)}
      role={user.role}
      email={user.email}
      username={user.username}
      hasPin={Boolean(user.pinHash)}
      variant="member"
    />
  );
}
