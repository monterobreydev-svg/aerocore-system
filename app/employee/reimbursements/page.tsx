import { prisma } from "@/lib/prisma"
import { getCurrentEmployee } from "@/lib/dal"
import { isR2Configured } from "@/lib/r2"
import {
  EmployeeExpensesView,
  type Claim,
} from "@/components/reimbursement/employee-expenses-view"

export default async function EmployeeExpensesPage() {
  const employee = await getCurrentEmployee()

  const [records, clientRecords, releases] = await Promise.all([
    prisma.reimbursement.findMany({
      where: { employeeId: employee.id },
      include: {
        items: {
          orderBy: { createdAt: "asc" },
          include: { client: { select: { name: true } } },
        },
      },
      orderBy: { expenseDate: "desc" },
    }),
    prisma.client.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.fundRelease.findMany({
      where: { employeeId: employee.id },
      select: { amount: true },
    }),
  ])

  const claims: Claim[] = records.map((record) => ({
    id: record.id,
    referenceNo: record.referenceNo,
    status: record.status,
    totalAmount: Number(record.totalAmount),
    expenseDate: record.expenseDate.toISOString(),
    receiptKey: record.receiptKey,
    receiptName: record.receiptName,
    isLate: record.isLate,
    lateReason: record.lateReason,
    note: record.note,
    submittedAt: record.submittedAt.toISOString(),
    reviewedAt: record.reviewedAt?.toISOString() ?? null,
    reviewNote: record.reviewNote,
    items: record.items.map((item) => ({
      id: item.id,
      clientName: item.client?.name ?? null,
      soNumber: item.soNumber,
      description: item.description,
      amount: Number(item.amount),
    })),
  }))

  const released = releases.reduce((sum, r) => sum + Number(r.amount), 0)
  // A rejected liquidation doesn't reduce the balance — that money is still
  // theirs to account for, which is exactly what a rejection means.
  const liquidated = claims
    .filter((claim) => claim.status !== "REJECTED")
    .reduce((sum, claim) => sum + claim.totalAmount, 0)

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold">Expenses</h2>
        <p className="text-sm text-muted-foreground">
          Account for the fund you&apos;re holding, one day at a time.
        </p>
      </div>

      {!isR2Configured() && (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-400">
          Receipt uploads are unavailable — file storage isn&apos;t configured
          yet. You can still record the amounts; ask the office to attach the
          receipts.
        </p>
      )}

      <EmployeeExpensesView
        claims={claims}
        clients={clientRecords}
        released={released}
        liquidated={liquidated}
      />
    </div>
  )
}
