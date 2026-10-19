import { requirePageUser } from "@/lib/auth/session";
import { getMemberPendingSubmissions } from "@/lib/queries/member-pending-submissions";
import { getMemberTransactionHistory } from "@/lib/queries/member-transaction-history";
import { HistoryClient } from "./history-client";

/** Auth-bound member timeline — request-time. */
export const instant = false;

export default async function TransactionHistoryPage() {
  const user = await requirePageUser(
    ["MEMBER", "TREASURER", "AUDITOR"],
    "/history",
  );
  const [events, pendingSubmissions] = await Promise.all([
    getMemberTransactionHistory(user.id),
    getMemberPendingSubmissions(user.id),
  ]);

  return (
    <HistoryClient
      userId={user.id}
      events={events}
      pendingSubmissions={pendingSubmissions}
    />
  );
}
