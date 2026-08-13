import { prisma } from "@/lib/prisma"
import { getCurrentEmployee } from "@/lib/dal"
import { isR2Configured } from "@/lib/r2"
import { buildFundContexts, buildReleaseBalances } from "@/lib/reimbursement"
import { addDays, startOfWeek } from "@/lib/schedule"
import {
  EmployeeExpensesView,
  type Claim,
  type FundRelease,
} from "@/components/reimbursement/employee-expenses-view"

export default async function EmployeeExpensesPage() {
  const employee = await getCurrentEmployee()

  // History on this page is the working week and nothing more. An employee is
  // here to file today's receipts and see what that did to their fund â€” the
  // permanent record lives on the admin side, and a list that grows forever is
  // a list that costs more to open every month. Mondayâ€“Sunday, matching how the
  // rest of the app cuts a week.
  const weekStart = startOfWeek(new Date())
  const weekEnd = addDays(weekStart, 7)
  const thisWeek = { gte: weekStart, lt: weekEnd }

  const [records, clientRecords, releases, ledgerClaims, releaseDetails] =
    await Promise.all([
      prisma.reimbursement.findMany({
        // Filed this week, not spent this week: a receipt from last Friday filed
        // on Monday moved the balance on Monday, and that's the day it has to
        // appear under for the running figures to read in order.
        where: { employeeId: employee.id, submittedAt: thisWeek },
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
      // Every release, but only the two columns the balance is made of.
      prisma.fundRelease.findMany({
        where: { employeeId: employee.id },
        select: { id: true, amount: true, releasedAt: true },
        orderBy: { releasedAt: "desc" },
      }),
      // Every liquidation ever filed, four columns wide. The week's cards are
      // fetched above; this is only here so the running balance replays against
      // the whole ledger â€” a fund that started in March can't be explained from
      // one week of rows.
      prisma.reimbursement.findMany({
        where: { employeeId: employee.id },
        select: { id: true, status: true, totalAmount: true, submittedAt: true },
      }),
      // The releases actually rendered â€” this week's â€” with the detail that makes
      // a top-up verifiable: how it was sent and the proof of it.
      prisma.fundRelease.findMany({
        where: { employeeId: employee.id, releasedAt: thisWeek },
        select: {
          id: true,
          method: true,
          note: true,
          proofKey: true,
          proofName: true,
          releasedBy: {
            select: { employee: { select: { firstName: true, lastName: true } } },
          },
        },
        orderBy: { releasedAt: "desc" },
      }),
    ])

  const ledger = {
    releases: releases.map((release) => ({
      id: release.id,
      employeeId: employee.id,
      amount: Number(release.amount),
      releasedAt: release.releasedAt.toISOString(),
    })),
    claims: ledgerClaims.map((claim) => ({
      id: claim.id,
      employeeId: employee.id,
      status: claim.status,
      totalAmount: Number(claim.totalAmount),
      submittedAt: claim.submittedAt.toISOString(),
    })),
  }

  // What the fund stood at either side of each event. Replayed here on the
  // server against the whole ledger; the browser only ever sees the answers.
  const fundContexts = buildFundContexts(ledger.releases, ledger.claims)
  const releaseBalances = buildReleaseBalances(ledger.releases, ledger.claims)

  // `releaseDetails` is already only this week's, so the join is also the
  // filter: a release outside the window has no detail row to pair with.
  const detailById = new Map(releaseDetails.map((row) => [row.id, row]))
  const fundReleases: FundRelease[] = ledger.releases
    .filter((release) => detailById.has(release.id))
    .map((release) => {
      const detail = detailById.get(release.id)!
      return {
        id: release.id,
        amount: release.amount,
        releasedAt: release.releasedAt,
        method: detail.method,
        note: detail.note,
        proofKey: detail.proofKey,
        proofName: detail.proofName,
        releasedByName: `${detail.releasedBy.employee.firstName} ${detail.releasedBy.employee.lastName}`,
        balanceAfter: releaseBalances[release.id] ?? 0,
      }
    })

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
    // Named field by field on purpose: the context also carries the id of the
    // release that funded it, which the employee view has no use for and
    // shouldn't pay to download.
    fund: {
      before: fundContexts[record.id]?.before ?? 0,
      after: fundContexts[record.id]?.after ?? 0,
      shortfall: fundContexts[record.id]?.shortfall ?? 0,
    },
  }))

  // Both totals come off the whole ledger, never the week on screen: the fund
  // in someone's hands is everything they've ever been given less everything
  // they've accounted for, whatever window the history happens to show.
  const released = ledger.releases.reduce((sum, r) => sum + r.amount, 0)
  // Newest first, so the head of the list is the last top-up the office made.
  const lastReleasedAt = releases[0]?.releasedAt.toISOString() ?? null
  // A rejected liquidation doesn't reduce the balance â€” that money is still
  // theirs to account for, which is exactly what a rejection means.
  const liquidated = ledger.claims
    .filter((claim) => claim.status !== "REJECTED")
    .reduce((sum, claim) => sum + claim.totalAmount, 0)

  // Whether anything at all sits behind the window, so the empty week can say
  // "nothing this week" rather than "you have never filed anything".
  const hasEarlier =
    ledger.claims.length > claims.length ||
    ledger.releases.length > fundReleases.length

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
          Receipt uploads are unavailable â€” file storage isn&apos;t configured
          yet. You can still record the amounts; ask the office to attach the
          receipts.
        </p>
      )}

      <EmployeeExpensesView
        claims={claims}
        releases={fundReleases}
        clients={clientRecords}
        released={released}
        liquidated={liquidated}
        lastReleasedAt={lastReleasedAt}
        weekStart={weekStart.toISOString()}
        weekEnd={addDays(weekEnd, -1).toISOString()}
        hasEarlier={hasEarlier}
      />
    </div>
  )
}
