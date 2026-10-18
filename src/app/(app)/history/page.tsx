import { connection } from "next/server";
import { requirePageUser } from "@/lib/auth/session";
import { getMemberTransactionHistory } from "@/lib/queries/member-transaction-history";
import { HistoryClient } from "./history-client";

/** Auth-bound member timeline — request-time. */
export const instant = false;

export default async function TransactionHistoryPage() {
  await connection();
  const user = await requirePageUser(
    ["MEMBER", "TREASURER", "AUDITOR"],
    "/history",
  );
  const events = await getMemberTransactionHistory(user.id);

  return <HistoryClient events={events} />;
}
