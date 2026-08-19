import type { NextRequest } from "next/server"
import type { Prisma } from "@/app/generated/prisma/client"

import { verifySession } from "@/lib/auth"
import { prisma } from "@/lib/db/prisma"
import {
  cutoffEnd,
  cutoffLabel,
  cutoffStart,
  nextDay,
  parseDayParam,
} from "@/lib/attendance"
import {
  computePayslip,
  holidaysBetween,
  withheldBreakdown,
  HOLIDAY_QUALIFYING_LOOKBACK_DAYS,
} from "@/lib/payroll"
import {
  payrollFileName,
  payrollSheet,
  type PayrollSheetRow,
} from "@/lib/payroll/payroll-xlsx"

// The office's copy of a whole payroll run, as a spreadsheet.
//
// Recomputed here rather than read from the page, for the same reason the
// payslip download is: a route answers on its own and cannot assume a screen
// was ever rendered. The arithmetic is the one in lib/payroll either way, so
// the sheet and the page can only ever agree.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Same definition of "on the payroll" as the page, and the same reason: if the
// two ever drift, the export stops matching what the office approved.
const ON_PAYROLL: Prisma.EmployeeWhereInput = {
  OR: [{ account: null }, { account: { isActive: true } }],
}

export async function GET(request: NextRequest) {
  const session = await verifySession()
  if (session.role !== "DIRECTOR" && session.role !== "ADMINISTRATOR") {
    return new Response("Not allowed.", { status: 403 })
  }

  const day = parseDayParam(
    request.nextUrl.searchParams.get("cutoff") ?? undefined,
    new Date()
  )
  const start = cutoffStart(day)
  const end = cutoffEnd(day)
  const holidays = holidaysBetween(start, end)

  const qualifyingFrom = new Date(start)
  qualifyingFrom.setDate(
    qualifyingFrom.getDate() - HOLIDAY_QUALIFYING_LOOKBACK_DAYS
  )

  const [employees, adjustments] = await Promise.all([
    prisma.employee.findMany({
      where: ON_PAYROLL,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        employeeNo: true,
        position: true,
        sssNo: true,
        philhealthNo: true,
        pagibigNo: true,
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
      // Surname first: a payroll register is read down the name column, and
      // the screen's first-name ordering is for finding a face, not a file.
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.payrollAdjustment.findMany({
      where: { cutoffStart: start },
      select: { employeeId: true, label: true, amount: true },
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

  // "Cash advance (-500.00); Rice allowance (+1,000.00)" — the remark says both
  // what it was for and which way it went, so the Adjustment column beside it
  // never has to be taken on trust.
  const peso = (value: number) =>
    (value < 0 ? "-" : "+") +
    Math.abs(value).toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })

  const rows: PayrollSheetRow[] = employees.map((employee) => {
    const attendance = employee.attendance.map((row) => ({
      date: row.date,
      timeIn: row.timeIn,
      timeOut: row.timeOut,
      approvedOvertimeHours:
        row.overtime?.status === "APPROVED"
          ? Number(row.overtime.approvedHours ?? row.overtime.hours)
          : 0,
    }))

    const slip = computePayslip({
      hourlyRate: Number(employee.hourlyRate),
      days: attendance.filter((row) => row.date >= start),
      daysBeforeCutoff: attendance.filter((row) => row.date < start),
      holidaysInCutoff: holidays,
      adjustments: adjustmentsByEmployee.get(employee.id) ?? [],
    })

    // What came off, not what was scheduled — so every row reconciles:
    // gross minus the three columns is exactly the net.
    const took = withheldBreakdown(slip)

    // Signed. The additions are already inside gross; the deductions are the
    // part that was actually withheld, so the row still balances when a cutoff
    // could not cover everything asked of it.
    const entries = adjustmentsByEmployee.get(employee.id) ?? []
    const adjustment = slip.adjustmentAdditions - took.adjustments
    const remarks = entries
      .map((entry) => `${entry.label} (${peso(entry.amount)})`)
      .join("; ")

    return {
      employeeNo: employee.employeeNo,
      lastName: employee.lastName,
      firstName: employee.firstName,
      middleName: employee.middleName,
      position: employee.position,
      sssNo: employee.sssNo,
      philhealthNo: employee.philhealthNo,
      pagibigNo: employee.pagibigNo,
      basicPay: slip.basicPay,
      overtimePay: slip.overtimePay,
      nightHours: slip.nightHours,
      nightPay: slip.nightPay,
      restDayPay: slip.restDayPay,
      holidayPay: slip.holidayPay,
      adjustment,
      // The payslip's gross already carries any addition; taking the withheld
      // deduction off as well makes this the figure the adjustment column adds
      // up to, and the one the contributions are then subtracted from.
      gross: slip.gross - took.adjustments,
      sss: took.sss,
      philhealth: took.philhealth,
      pagibig: took.pagibig,
      net: slip.net,
      remarks,
    }
  })

  const label = cutoffLabel(start, end)

  return new Response(
    payrollSheet({
      rows,
      cutoffLabel: label,
      cutoffStart: start,
      cutoffEnd: end,
      generatedAt: new Date(),
    }),
    {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${payrollFileName(label)}"`,
        // Pay figures, and recomputed every time — never let a proxy keep one.
        "Cache-Control": "no-store, private",
      },
    }
  )
}
