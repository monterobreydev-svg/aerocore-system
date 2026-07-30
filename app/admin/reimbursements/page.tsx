import { AlertTriangle, Clock, ReceiptText, Wallet } from "lucide-react"
import { requireManager } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isR2Configured } from "@/lib/r2"
import { buildFundContexts, peso } from "@/lib/reimbursement"
import { CLAIM_DETAIL_SELECT, loadFunders, toAdminClaim } from "@/lib/claim-query"
import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { AdminReimbursementsView } from "@/components/reimbursement/admin-reimbursements-view"
import {
  CLAIM_PAGE_SIZE,
  type AdminClaim,
  type AdminTab,
  type EmployeeBalance,
  type FundLedgerRow,
} from "@/components/reimbursement/admin-claim"

// The review queue is short by nature — a decided liquidation leaves it for the
// employee's staff record — but it still gets a ceiling so a runaway month can't
// turn the first paint into a megabyte.
const QUEUE_LIMIT = 100

function tabFrom(value: string | string[] | undefined): AdminTab {
  const raw = Array.isArray(value) ? value[0] : value
  return raw === "funds" ? "funds" : "queue"
}

function pageFrom(value: string | string[] | undefined, pages: number) {
  const raw = Array.isArray(value) ? value[0] : value
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return 1
  return Math.min(Math.max(1, Math.trunc(parsed)), Math.max(1, pages))
}

export default async function AdminReimbursementsPage({
  searchParams,
}: PageProps<"/admin/reimbursements">) {
  await requireManager()

  // Every release and every claim, but only the columns the running balance is
  // made of — the arithmetic has to see the whole ledger to be right, and none
  // of this crosses to the browser.
  const [params, ledgerReleases, ledgerClaims, employeeRecords] =
    await Promise.all([
      searchParams,
      prisma.fundRelease.findMany({
        select: { id: true, employeeId: true, amount: true, releasedAt: true },
      }),
      prisma.reimbursement.findMany({
        select: {
          id: true,
          employeeId: true,
          status: true,
          totalAmount: true,
          submittedAt: true,
          isLate: true,
        },
      }),
      prisma.employee.findMany({
        where: { OR: [{ account: null }, { account: { isActive: true } }] },
        select: { id: true, firstName: true, lastName: true, employeeNo: true },
        orderBy: { firstName: "asc" },
      }),
    ])

  const ledger = {
    releases: ledgerReleases.map((release) => ({
      id: release.id,
      employeeId: release.employeeId,
      amount: Number(release.amount),
      releasedAt: release.releasedAt.toISOString(),
    })),
    claims: ledgerClaims.map((claim) => ({
      id: claim.id,
      employeeId: claim.employeeId,
      status: claim.status,
      totalAmount: Number(claim.totalAmount),
      submittedAt: claim.submittedAt.toISOString(),
      isLate: claim.isLate,
    })),
  }

  const fundContexts = buildFundContexts(ledger.releases, ledger.claims)

  // The total is already in hand from the ledger, so paging the release log
  // costs no extra count query.
  const releaseTotal = ledger.releases.length
  const releasePages = Math.max(1, Math.ceil(releaseTotal / CLAIM_PAGE_SIZE))

  const tab = tabFrom(params.tab)
  const releasePage = pageFrom(params.rp, releasePages)

  const [queueRecords, releaseRecords] = await Promise.all([
    // Only what needs a decision. Anything already decided — approved or
    // rejected — is history, and history lives on the employee's staff record.
    prisma.reimbursement.findMany({
      where: { status: "PENDING_REVIEW" },
      select: CLAIM_DETAIL_SELECT,
      orderBy: [{ expenseDate: "desc" }],
      take: QUEUE_LIMIT,
    }),
    prisma.fundRelease.findMany({
      select: {
        id: true,
        employeeId: true,
        amount: true,
        method: true,
        reference: true,
        note: true,
        proofKey: true,
        proofName: true,
        releasedAt: true,
        employee: { select: { firstName: true, lastName: true } },
        releasedBy: {
          select: { employee: { select: { firstName: true, lastName: true } } },
        },
      },
      orderBy: { releasedAt: "desc" },
      skip: (releasePage - 1) * CLAIM_PAGE_SIZE,
      take: CLAIM_PAGE_SIZE,
    }),
  ])

  const funders = await loadFunders([
    ...new Set(
      queueRecords
        .map((record) => fundContexts[record.id]?.fundedByReleaseId)
        .filter((id): id is string => Boolean(id))
    ),
  ])

  const queue: AdminClaim[] = queueRecords.map((record) =>
    toAdminClaim(record, fundContexts, funders)
  )

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
    released: ledger.releases
      .filter((r) => r.employeeId === employee.id)
      .reduce((sum, r) => sum + r.amount, 0),
    liquidated: ledger.claims
      .filter((c) => c.employeeId === employee.id && c.status !== "REJECTED")
      .reduce((sum, c) => sum + c.totalAmount, 0),
  }))

  const forReview = ledger.claims.filter((c) => c.status === "PENDING_REVIEW")
  const lateAwaiting = forReview.filter((c) => c.isLate)
  const totalReleased = ledger.releases.reduce((sum, r) => sum + r.amount, 0)
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
        queue={queue}
        releases={releases}
        balances={balances}
        paging={{ tab, releasePage, releasePages, releaseTotal }}
      />
    </div>
  )
}
