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
      select: {
        id: true,
        referenceNo: true,
        status: true,
        totalAmount: true,
        expenseDate: true,
        receiptKey: true,
        receiptName: true,
        isLate: true,
        lateReason: true,
        note: true,
        submittedAt: true,
        reviewedAt: true,
        reviewNote: true,
        items: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            description: true,
            amount: true,
            clients: {
              select: {
                soNumber: true,
                amount: true,
                client: { select: { name: true } },
              },
              orderBy: { client: { name: "asc" } },
            },
          },
        },
      },
      // Newest filing first, not newest expense date: filing a late receipt is
      // exactly when someone goes looking for it, and sorting by the day of the
      // spend buried it under liquidations submitted weeks earlier. Matches the
      // order the same history appears in on the staff record.
      orderBy: [{ submittedAt: "desc" }, { expenseDate: "desc" }],
    }),
    prisma.client.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.fundRelease.findMany({
      where: { employeeId: employee.id },
      select: { amount: true, releasedAt: true },
      orderBy: { releasedAt: "desc" },
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
      description: item.description,
      amount: Number(item.amount),
      clients: item.clients.map((link) => ({
        name: link.client.name,
        soNumber: link.soNumber,
        amount: Number(link.amount),
      })),
    })),
  }))

  const released = releases.reduce((sum, r) => sum + Number(r.amount), 0)
  // Newest first, so the head of the list is the last top-up the office made.
  const lastReleasedAt = releases[0]?.releasedAt.toISOString() ?? null
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
        lastReleasedAt={lastReleasedAt}
      />
    </div>
  )
}
