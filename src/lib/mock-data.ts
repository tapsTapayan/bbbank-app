/** Phase 1 UI mock data — replaced by Prisma/Supabase in Phase 2. */

export type PaymentStatusPill = "PENDING" | "VERIFIED" | "AUDITED" | "REJECTED";

export type MockPaymentSubmission = {
  id: string;
  memberName: string;
  memberEmail: string;
  targetType: "CONTRIBUTION" | "LOAN_AMORTIZATION";
  targetLabel: string;
  amount: number;
  paymentChannel: "GCASH" | "MAYA" | "BANK_TRANSFER" | "CASH";
  referenceNumber: string;
  receiptUrl: string;
  status: "PENDING_VERIFICATION" | "VERIFIED" | "REJECTED" | "AUDITED" | "FLAGGED";
  submittedAt: string;
  remarks?: string;
};

export const mockMember = {
  id: "usr_member_01",
  name: "Maria Santos",
  email: "maria.santos@email.com",
  role: "MEMBER" as const,
};

export const mockMemberDashboard = {
  totalEquity: 48_500.0,
  activeLoanBalance: 12_750.0,
  nextAmortization: {
    installmentNumber: 4,
    dueDate: "2026-11-15",
    amountDue: 2_125.0,
    loanLabel: "Personal Loan #LN-2026-014",
  },
  recentPayments: [
    {
      id: "pay_01",
      label: "Oct contribution",
      amount: 2_000,
      status: "AUDITED" as PaymentStatusPill,
      date: "2026-10-05",
    },
    {
      id: "pay_02",
      label: "Loan installment #3",
      amount: 2_125,
      status: "VERIFIED" as PaymentStatusPill,
      date: "2026-10-12",
    },
    {
      id: "pay_03",
      label: "Sep contribution",
      amount: 2_000,
      status: "PENDING" as PaymentStatusPill,
      date: "2026-10-17",
    },
  ],
};

function buildReceiptSvg(opts: {
  channelLabel: string;
  amountLabel: string;
  referenceNumber: string;
  memberName: string;
  when: string;
}): string {
  return (
    "data:image/svg+xml," +
    encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="480" height="720" viewBox="0 0 480 720">
  <rect width="480" height="720" fill="#f8fafc"/>
  <rect x="24" y="24" width="432" height="672" rx="12" fill="#fff" stroke="#e2e8f0"/>
  <text x="240" y="80" text-anchor="middle" font-family="system-ui,sans-serif" font-size="22" font-weight="700" fill="#0f172a">${opts.channelLabel} Receipt</text>
  <text x="240" y="112" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" fill="#64748b">Transfer Successful</text>
  <line x1="48" y1="140" x2="432" y2="140" stroke="#e2e8f0"/>
  <text x="48" y="180" font-family="system-ui,sans-serif" font-size="12" fill="#94a3b8">Amount</text>
  <text x="48" y="210" font-family="system-ui,sans-serif" font-size="28" font-weight="700" fill="#059669">${opts.amountLabel}</text>
  <text x="48" y="260" font-family="system-ui,sans-serif" font-size="12" fill="#94a3b8">Reference No.</text>
  <text x="48" y="288" font-family="ui-monospace,monospace" font-size="16" font-weight="600" fill="#0f172a">${opts.referenceNumber}</text>
  <text x="48" y="340" font-family="system-ui,sans-serif" font-size="12" fill="#94a3b8">Date &amp; Time</text>
  <text x="48" y="368" font-family="system-ui,sans-serif" font-size="14" fill="#334155">${opts.when}</text>
  <text x="48" y="420" font-family="system-ui,sans-serif" font-size="12" fill="#94a3b8">From</text>
  <text x="48" y="448" font-family="system-ui,sans-serif" font-size="14" fill="#334155">${opts.memberName} · •••• 4821</text>
  <text x="48" y="500" font-family="system-ui,sans-serif" font-size="12" fill="#94a3b8">To</text>
  <text x="48" y="528" font-family="system-ui,sans-serif" font-size="14" fill="#334155">BBBank Sinking Fund</text>
  <rect x="48" y="580" width="384" height="64" rx="8" fill="#f1f5f9"/>
  <text x="240" y="618" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" fill="#64748b">Sample receipt for Phase 1 UI preview</text>
</svg>
`)
  );
}

export const mockPendingSubmissions: MockPaymentSubmission[] = [
  {
    id: "sub_01",
    memberName: "Maria Santos",
    memberEmail: "maria.santos@email.com",
    targetType: "CONTRIBUTION",
    targetLabel: "Oct 2026 Contribution",
    amount: 2_000,
    paymentChannel: "GCASH",
    referenceNumber: "GCASH-9823746510",
    receiptUrl: buildReceiptSvg({
      channelLabel: "GCash",
      amountLabel: "₱2,000.00",
      referenceNumber: "GCASH-9823746510",
      memberName: "Maria Santos",
      when: "Oct 17, 2026 · 9:42 AM",
    }),
    status: "PENDING_VERIFICATION",
    submittedAt: "2026-10-17T09:45:00+08:00",
  },
  {
    id: "sub_02",
    memberName: "Juan Dela Cruz",
    memberEmail: "juan.dc@email.com",
    targetType: "LOAN_AMORTIZATION",
    targetLabel: "Loan #LN-2026-008 · Installment 2",
    amount: 3_500,
    paymentChannel: "MAYA",
    referenceNumber: "MAYA-4410293876",
    receiptUrl: buildReceiptSvg({
      channelLabel: "Maya",
      amountLabel: "₱3,500.00",
      referenceNumber: "MAYA-4410293876",
      memberName: "Juan Dela Cruz",
      when: "Oct 17, 2026 · 2:18 PM",
    }),
    status: "PENDING_VERIFICATION",
    submittedAt: "2026-10-17T14:20:00+08:00",
  },
  {
    id: "sub_03",
    memberName: "Ana Reyes",
    memberEmail: "ana.reyes@email.com",
    targetType: "CONTRIBUTION",
    targetLabel: "Oct 2026 Contribution",
    amount: 2_000,
    paymentChannel: "BANK_TRANSFER",
    referenceNumber: "BPI-7728190034",
    receiptUrl: buildReceiptSvg({
      channelLabel: "Bank Transfer",
      amountLabel: "₱2,000.00",
      referenceNumber: "BPI-7728190034",
      memberName: "Ana Reyes",
      when: "Oct 18, 2026 · 8:01 AM",
    }),
    status: "PENDING_VERIFICATION",
    submittedAt: "2026-10-18T08:05:00+08:00",
  },
  {
    id: "sub_04",
    memberName: "Pedro Garcia",
    memberEmail: "pedro.g@email.com",
    targetType: "LOAN_AMORTIZATION",
    targetLabel: "Loan #LN-2026-011 · Installment 5",
    amount: 1_875.5,
    paymentChannel: "GCASH",
    referenceNumber: "GCASH-1102938475",
    receiptUrl: buildReceiptSvg({
      channelLabel: "GCash",
      amountLabel: "₱1,875.50",
      referenceNumber: "GCASH-1102938475",
      memberName: "Pedro Garcia",
      when: "Oct 18, 2026 · 11:28 AM",
    }),
    status: "PENDING_VERIFICATION",
    submittedAt: "2026-10-18T11:30:00+08:00",
  },
];

export function formatPHP(amount: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(amount);
}
