import { prisma } from "@/lib/prisma"
import { getCurrentEmployee } from "@/lib/dal"
import { dayParam } from "@/lib/attendance"
import { buildPayslip } from "@/lib/payslip-query"
import {
  EmployeePayslipsView,
  type PayslipSummary,
} from "@/components/payroll/employee-payslips-view"

// ---------------------------------------------------------------------------
// An employee's own pay
// ---------------------------------------------------------------------------
//
// Only released periods appear here. While a cutoff is open the figures move as
// punches are corrected and overtime is decided, and a number that changes
// under someone between two glances is worse than no number.
//
// The screen carries the summary and nothing more — what was earned, what came
// off, what lands in the bank. The day-by-day working is a table nobody wants
// to read on a phone and everybody wants when they disagree with a figure, so
// it lives in the PDF behind the download rather than in this payload.

/**
 * How far back the list goes.
 *
 * Six is a quarter of a year — enough to check the last few payslips against
 * the bank, and a hard stop on a page that would otherwise get slower every
 * fortnight the company operates. Each one costs a payslip's worth of
 * arithmetic, so this is the number that decides what the page costs.
 */
const RECENT_RELEASES = 6

export default async function EmployeePayslipsPage() {
  const employee = await getCurrentEmployee()

  const releases = await prisma.payrollRelease.findMany({
    orderBy: { cutoffStart: "desc" },
    take: RECENT_RELEASES,
    select: { cutoffStart: true, releasedAt: true },
  })

  // Sequential rather than in parallel: six payslips is six small reads, and
  // firing them at once on a shared pooler buys milliseconds at the cost of
  // connections everyone else is waiting for.
  const summaries: PayslipSummary[] = []
  for (const release of releases) {
    const record = await buildPayslip(employee.id, release.cutoffStart)
    if (!record) continue

    const slip = record.payslip
    summaries.push({
      cutoffDay: dayParam(release.cutoffStart),
      cutoffLabel: record.cutoffLabel,
      releasedAt: release.releasedAt.toISOString(),
      daysWorked: slip.daysWorked,
      regularHours: slip.regularHours,
      overtimeHours: slip.overtimeHours,
      nightHours: slip.nightHours,
      basicPay: slip.basicPay,
      overtimePay: slip.overtimePay,
      nightPay: slip.nightPay,
      holidayPay: slip.holidayPay,
      adjustmentAdditions: slip.adjustmentAdditions,
      gross: slip.gross,
      deductions: slip.deductions.total,
      net: slip.net,
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Payroll</h2>
        <p className="text-sm text-muted-foreground">
          Your released payslips. Download one for the full day-by-day
          computation.
        </p>
      </div>

      <EmployeePayslipsView payslips={summaries} />
    </div>
  )
}
