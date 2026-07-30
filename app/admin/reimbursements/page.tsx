import { AlertTriangle, Clock, ReceiptText, Wallet } from "lucide-react"
import { requireManager } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isR2Configured } from "@/lib/r2"
import { peso } from "@/lib/reimbursement"
import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import {
  AdminReimbursementsView,
  type AdminClaim,
  type FundLedgerRow,
} from "@/components/reimbursement/admin-reimbursements-view"
import type { EmployeeBalance } from "@/components/reimbursement/release-fund-dialog"

export default async function AdminReimbursementsPage() {
  await requireManager()

  const [records, releaseRecords, employeeRecords] = await Promise.all([
    prisma.reimbursement.findMany({
      include: {
        employee: {
          select: { firstName: true, lastName: true, employeeNo: true },
        },
        reviewedBy: {
          include: { employee: { select: { firstName: true, lastName: true } } },
        },
        items: {
          orderBy: { createdAt: "asc" },
          include: { client: { select: { name: true } } },
        },
      },
      orderBy: [{ status: "asc" }, { expenseDate: "desc" }],
    }),
    prisma.fundRelease.findMany({
      include: {
        employee: { select: { firstName: true, lastName: true } },
        releasedBy: {
          include: { employee: { select: { firstName: true, lastName: true } } },
        },
      },
      orderBy: { releasedAt: "desc" },
    }),
    prisma.employee.findMany({
      where: { OR: [{ account: null }, { account: { isActive: true } }] },
      select: { id: true, firstName: true, lastName: true, employeeNo: true },
      orderBy: { firstName: "asc" },
    }),
  ])

  const claims: AdminClaim[] = records.map((record) => ({
    id: record.id,
    referenceNo: record.referenceNo,
    employeeId: record.employeeId,
    employeeName: `${record.employee.firstName} ${record.employee.lastName}`,
    employeeNo: record.employee.employeeNo,
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
    reviewedByName: record.reviewedBy
      ? `${record.reviewedBy.employee.firstName} ${record.reviewedBy.employee.lastName}`
      : null,
    items: record.items.map((item) => ({
      id: item.id,
      clientName: item.client?.name ?? null,
      soNumber: item.soNumber,
      description: item.description,
      amount: Number(item.amount),
    })),
  }))

  const releases: FundLedgerRow[] = releaseRecords.map((release) => ({
    id: release.id,
    employeeId: release.employeeId,
    employeeName: `${release.employee.firstName} ${release.employee.lastName}`,
    amount: Number(release.amount),
    method: release.method,
    reference: release.reference,
    note: release.note,
    proofKey: release.proofKey,
    proofName: release.proofName,
    releasedAt: release.releasedAt.toISOString(),
    releasedByName: `${release.releasedBy.employee.firstName} ${release.releasedBy.employee.lastName}`,
  }))

  // Balance per person: everything released, less everything they've accounted
  // for. Rejected liquidations don't count as accounted — that money is still
  // in their hands and still needs explaining.
  const balances: EmployeeBalance[] = employeeRecords.map((employee) => ({
    id: employee.id,
    name: `${employee.firstName} ${employee.lastName}`,
    employeeNo: employee.employeeNo,
    released: releases
      .filter((r) => r.employeeId === employee.id)
      .reduce((sum, r) => sum + r.amount, 0),
    liquidated: claims
      .filter((c) => c.employeeId === employee.id && c.status !== "REJECTED")
      .reduce((sum, c) => sum + c.totalAmount, 0),
  }))

  const forReview = claims.filter((c) => c.status === "PENDING_REVIEW")
  const lateAwaiting = forReview.filter((c) => c.isLate)
  const totalReleased = releases.reduce((sum, r) => sum + r.amount, 0)
  const outstanding = balances.reduce(
    (sum, b) => sum + Math.max(0, b.released - b.liquidated),
    0
  )

  const summary = [
    {
      label: "For review",
      value: String(forReview.length),
      icon: Clock,
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-600/10",
    },
    {
      label: "Late, needs a call",
      value: String(lateAwaiting.length),
      icon: AlertTriangle,
      color: "text-rose-600 dark:text-rose-400",
      bg: "bg-rose-600/10",
    },
    {
      label: "Unliquidated in the field",
      value: peso(outstanding),
      icon: ReceiptText,
      color: "text-sky-600 dark:text-sky-400",
      bg: "bg-sky-600/10",
    },
    {
      label: "Released to date",
      value: peso(totalReleased),
      icon: Wallet,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-600/10",
    },
  ]

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold">Reimbursements</h2>
        <p className="text-sm text-muted-foreground">
          Release working funds, review liquidations, and decide on late
          receipts.
        </p>
      </div>

      {!isR2Configured() && (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-400">
          File storage isn&apos;t configured — receipts can&apos;t be viewed and
          proof of transfer can&apos;t be attached. Set the R2 keys in{" "}
          <span className="font-mono">.env</span> to enable it.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summary.map((stat) => (
          <Card key={stat.label} className="shadow-sm" size="sm">
            <CardContent className="flex items-center gap-3">
              <div
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-lg",
                  stat.bg
                )}
              >
                <stat.icon className={cn("size-5", stat.color)} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xl leading-none font-semibold tabular-nums">
                  {stat.value}
                </p>
                <p className="mt-1.5 truncate text-xs text-muted-foreground">
                  {stat.label}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <AdminReimbursementsView
        claims={claims}
        releases={releases}
        balances={balances}
      />
    </div>
  )
}
