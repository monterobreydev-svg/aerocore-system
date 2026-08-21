import type { Prisma } from "@/app/generated/prisma/client"
import { requireManager } from "@/lib/auth"
import { prisma } from "@/lib/db/prisma"
import {
  cutoffEnd,
  cutoffLabel,
  cutoffStart,
  dayParam,
  nextDay,
  parseDayParam,
} from "@/lib/attendance"
import {
  computePayslip,
  holidaysBetween,
  HOLIDAY_QUALIFYING_LOOKBACK_DAYS,
} from "@/lib/payroll"
import {
  PayrollView,
  type PayrollRow,
} from "@/components/payroll/payroll-view"

// ---------------------------------------------------------------------------
// Payroll
//
// Worked out from attendance every time this page is opened rather than saved
// as a run — a corrected punch or a late overtime decision shows up here on
// the next load, which is what you want while a period is still open. The
// arithmetic itself is in lib/payroll, deliberately away from the screen.
//
// Only totals cross the wire. The day-by-day breakdown belongs to one person
// at a time and is fetched when a row is opened; sending everyone's would be
// the payload that grows with staff × days.
// ---------------------------------------------------------------------------

// Who is on the payroll: everyone employed except deactivated logins. The same
// definition the attendance day log uses for "hasn't timed in" — if one of
// these two ever changes, the other has to follow, or the roster payroll runs
// against stops matching the roster attendance is measured against.
const ON_PAYROLL: Prisma.EmployeeWhereInput = {
  OR: [{ account: null }, { account: { isActive: true } }],
}

export default async function PayrollPage({
  searchParams,
}: PageProps<"/admin/payroll">) {
  await requireManager()

  const params = await searchParams
  const day = parseDayParam(params.cutoff, new Date())
  const start = cutoffStart(day)
  const end = cutoffEnd(day)

  const holidays = holidaysBetween(start, end)

  // A holiday on the 1st or the 16th is qualified by attendance in the cutoff
  // before this one, so the read reaches back far enough to see it. Those extra
  // days are handed to `computePayslip` separately and are never paid here —
  // the cutoff they belong to already paid them.
  const qualifyingFrom = new Date(start)
  qualifyingFrom.setDate(
    qualifyingFrom.getDate() - HOLIDAY_QUALIFYING_LOOKBACK_DAYS
  )

  // One read of the period for everyone on the payroll. Bounded by the cutoff:
  // sixteen days at the outside, plus the lookback, however long the company
  // has existed.
  const [employees, adjustments, release] = await Promise.all([
    prisma.employee.findMany({
    where: ON_PAYROLL,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeNo: true,
      position: true,
      hourlyRate: true,
      attendance: {
        where: { date: { gte: qualifyingFrom, lt: nextDay(end) } },
        select: {
          date: true,
          timeIn: true,
          timeOut: true,
          overtime: {
            select: { hours: true, approvedHours: true, status: true },
          },
        },
      },
    },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }),
    // Everyone's hand-made corrections for this cutoff, in one read rather
    // than one per employee.
    prisma.payrollAdjustment.findMany({
      where: { cutoffStart: start },
      select: { employeeId: true, label: true, amount: true },
    }),
    // Whether this run has been published to the people it pays.
    prisma.payrollRelease.findUnique({
      where: { cutoffStart: start },
      select: {
        releasedAt: true,
        releasedBy: {
          select: { employee: { select: { firstName: true, lastName: true } } },
        },
      },
    }),
  ])

  const adjustmentsByEmployee = new Map<
    string,
    { label: string; amount: number }[]
  >()
  for (const row of adjustments) {
    const list = adjustmentsByEmployee.get(row.employeeId) ?? []
    list.push({ label: row.label, amount: Number(row.amount) })
    adjustmentsByEmployee.set(row.employeeId, list)
  }

  const rows: PayrollRow[] = employees.map((employee) => {
    const attendance = employee.attendance.map((row) => ({
      date: row.date,
      timeIn: row.timeIn,
      timeOut: row.timeOut,
      // Only what the office granted. Hours somebody stayed for without an
      // approved request are not payable, and the punch alone can't say
      // whether they were asked for.
      approvedOvertimeHours:
        row.overtime?.status === "APPROVED"
          ? Number(row.overtime.approvedHours ?? row.overtime.hours)
          : 0,
    }))

    const payslip = computePayslip({
      hourlyRate: Number(employee.hourlyRate),
      // Split at the cutoff's opening day: what falls inside is paid, what
      // falls before it only answers whether a holiday qualifies.
      days: attendance.filter((row) => row.date >= start),
      daysBeforeCutoff: attendance.filter((row) => row.date < start),
      holidaysInCutoff: holidays,
      adjustments: adjustmentsByEmployee.get(employee.id) ?? [],
    })

    return {
      employeeId: employee.id,
      name: `${employee.firstName} ${employee.lastName}`,
      employeeNo: employee.employeeNo,
      position: employee.position,
      daysWorked: payslip.daysWorked,
      regularHours: payslip.regularHours,
      overtimeHours: payslip.overtimeHours,
      nightHours: payslip.nightHours,
      basicPay: payslip.basicPay,
      overtimePay: payslip.overtimePay,
      nightPay: payslip.nightPay,
      holidayPay: payslip.holidayPay,
      restDayPay: payslip.restDayPay,
      specialHolidayPay: payslip.specialHolidayPay,
      gross: payslip.gross,
      deductions: payslip.deductions.total,
      net: payslip.net,
      // A day still on the clock has no length and so pays nothing — worth
      // saying on the row rather than leaving as a silently short total.
      openDays: payslip.days.filter((entry) => entry.renderedMinutes === 0)
        .length,
    }
  })

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Payroll</h2>
        <p className="text-sm text-muted-foreground">
          Computed from attendance for the period. Open a row for the
          breakdown.
        </p>
      </div>

      <PayrollView
        rows={rows}
        cutoff={{
          day: dayParam(day),
          label: cutoffLabel(start, end),
          start: start.toISOString(),
          end: end.toISOString(),
          previous: dayParam(cutoffStart(new Date(+start - 86_400_000))),
          next: dayParam(nextDay(end)),
        }}
        holidays={holidays.map((entry) => ({
          date: entry.date.toISOString(),
          name: entry.holiday.name,
          kind: entry.holiday.kind,
        }))}
        released={
          release
            ? {
                at: release.releasedAt.toISOString(),
                byName: `${release.releasedBy.employee.firstName} ${release.releasedBy.employee.lastName}`,
              }
            : null
        }
      />
    </div>
  )
}
