import "server-only"

import type { OvertimeStatus } from "@/app/generated/prisma/client"
import type { Decimal } from "@/app/generated/prisma/internal/prismaNamespace"
import { prisma } from "@/lib/db/prisma"
import { cutoffEnd, cutoffLabel, cutoffStart, nextDay } from "@/lib/attendance"
import {
  computePayslip,
  holidaysBetween,
  HOLIDAY_QUALIFYING_LOOKBACK_DAYS,
  type Payslip,
} from "@/lib/payroll"

// One reader for one person's pay in one period.
//
// Three screens ask this question — the admin's breakdown dialog, the
// employee's own payslip list, and the PDF behind the download — and they must
// agree to the centavo. They did not have to before, because only the admin
// asked; the moment an employee can read the same figure, a second copy of this
// query is a second answer waiting to happen.

export type PayslipRecord = {
  employeeName: string
  employeeNo: string | null
  position: string
  cutoffStart: string
  cutoffEnd: string
  cutoffLabel: string
  /** When payroll for this period was published. Null while it is still open. */
  releasedAt: string | null
  payslip: Payslip
  adjustments: { label: string; amount: number }[]
}

/**
 * The days of a cutoff, plus the few before it a holiday might be qualified by.
 *
 * Split at the opening day: what falls inside is paid, what falls before it is
 * only read to answer whether the employee was at work ahead of a holiday
 * landing on the 1st or the 16th.
 */
function splitAttendance(
  rows: {
    date: Date
    timeIn: Date
    timeOut: Date | null
    // Prisma hands these back as Decimal; the arithmetic wants numbers, and
    // this is the one place that conversion happens.
    overtime: {
      hours: Decimal
      approvedHours: Decimal | null
      status: OvertimeStatus
    } | null
  }[],
  start: Date
) {
  const mapped = rows.map((row) => ({
    date: row.date,
    timeIn: row.timeIn,
    timeOut: row.timeOut,
    approvedOvertimeHours:
      row.overtime?.status === "APPROVED"
        ? Number(row.overtime.approvedHours ?? row.overtime.hours)
        : 0,
  }))

  return {
    days: mapped.filter((row) => row.date >= start),
    daysBeforeCutoff: mapped.filter((row) => row.date < start),
  }
}

export function qualifyingWindowStart(start: Date) {
  const from = new Date(start)
  from.setDate(from.getDate() - HOLIDAY_QUALIFYING_LOOKBACK_DAYS)
  return from
}

export async function buildPayslip(
  employeeId: string,
  day: Date
): Promise<PayslipRecord | null> {
  const start = cutoffStart(day)
  const end = cutoffEnd(day)

  const [employee, adjustments, release] = await Promise.all([
    prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        firstName: true,
        lastName: true,
        employeeNo: true,
        position: true,
        hourlyRate: true,
        attendance: {
          where: {
            date: { gte: qualifyingWindowStart(start), lt: nextDay(end) },
          },
          select: {
            date: true,
            timeIn: true,
            timeOut: true,
            overtime: {
              select: { hours: true, approvedHours: true, status: true },
            },
          },
          orderBy: { date: "asc" },
        },
      },
    }),
    prisma.payrollAdjustment.findMany({
      where: { employeeId, cutoffStart: start },
      select: { label: true, amount: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.payrollRelease.findUnique({
      where: { cutoffStart: start },
      select: { releasedAt: true },
    }),
  ])

  if (!employee) return null

  const entries = adjustments.map((row) => ({
    label: row.label,
    amount: Number(row.amount),
  }))
  const { days, daysBeforeCutoff } = splitAttendance(
    employee.attendance,
    start
  )

  return {
    employeeName: `${employee.firstName} ${employee.lastName}`,
    employeeNo: employee.employeeNo,
    position: employee.position,
    cutoffStart: start.toISOString(),
    cutoffEnd: end.toISOString(),
    cutoffLabel: cutoffLabel(start, end),
    releasedAt: release?.releasedAt.toISOString() ?? null,
    payslip: computePayslip({
      hourlyRate: Number(employee.hourlyRate),
      days,
      daysBeforeCutoff,
      holidaysInCutoff: holidaysBetween(start, end),
      adjustments: entries,
    }),
    adjustments: entries,
  }
}
