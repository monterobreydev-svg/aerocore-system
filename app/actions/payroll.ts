"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { requireManager } from "@/lib/auth"
import { cutoffEnd, cutoffStart, nextDay, parseDayParam } from "@/lib/attendance"
import {
  computePayslip,
  holidaysBetween,
  type Payslip,
} from "@/lib/payroll"

export type AdjustmentRow = {
  id: string
  label: string
  /** Signed: positive pays more, negative pays less. */
  amount: number
  note: string | null
  createdAt: string
  createdByName: string
}

export type PayslipDetail = {
  employeeName: string
  employeeNo: string | null
  position: string
  cutoffStart: string
  cutoffEnd: string
  payslip: Payslip
  adjustments: AdjustmentRow[]
}

/**
 * One person's payslip for one cutoff, worked out on demand.
 *
 * The payroll table itself carries totals only — a day-by-day breakdown for
 * every employee is the payload that grows with two things at once, and most
 * of it is never looked at. This is what the row opens into.
 */
export async function getPayslip(
  employeeId: string,
  cutoffDay: string
): Promise<PayslipDetail | null> {
  await requireManager()
  if (!employeeId) return null

  const day = parseDayParam(cutoffDay, new Date())
  const start = cutoffStart(day)
  const end = cutoffEnd(day)

  const [employee, adjustments] = await Promise.all([
    prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        firstName: true,
        lastName: true,
        employeeNo: true,
        position: true,
        hourlyRate: true,
        attendance: {
          where: { date: { gte: start, lt: nextDay(end) } },
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
      select: {
        id: true,
        label: true,
        amount: true,
        note: true,
        createdAt: true,
        createdBy: {
          select: { employee: { select: { firstName: true, lastName: true } } },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
  ])
  if (!employee) return null

  const rows: AdjustmentRow[] = adjustments.map((row) => ({
    id: row.id,
    label: row.label,
    amount: Number(row.amount),
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    createdByName: `${row.createdBy.employee.firstName} ${row.createdBy.employee.lastName}`,
  }))

  return {
    employeeName: `${employee.firstName} ${employee.lastName}`,
    employeeNo: employee.employeeNo,
    position: employee.position,
    cutoffStart: start.toISOString(),
    cutoffEnd: end.toISOString(),
    adjustments: rows,
    payslip: computePayslip({
      hourlyRate: Number(employee.hourlyRate),
      days: employee.attendance.map((row) => ({
        date: row.date,
        timeIn: row.timeIn,
        timeOut: row.timeOut,
        approvedOvertimeHours:
          row.overtime?.status === "APPROVED"
            ? Number(row.overtime.approvedHours ?? row.overtime.hours)
            : 0,
      })),
      holidaysInCutoff: holidaysBetween(start, end),
      adjustments: rows,
    }),
  }
}

// ---------------------------------------------------------------------------
// Adjustments
//
// Director and Administrator only, which is what requireManager already means.
// An Engineer can reach the admin shell but has no business moving anybody's
// pay, and an adjustment is the one part of payroll that isn't derived from
// evidence — so it is the part that most needs an author against it.
// ---------------------------------------------------------------------------

/** Guards a typo turning ₱500 into ₱500,000 on somebody's payslip. */
const MAX_ADJUSTMENT = 200_000

const AdjustmentSchema = z.object({
  employeeId: z.string().min(1),
  cutoffDay: z.string().min(1),
  label: z.string().trim().min(2, "Say what it is.").max(60),
  direction: z.enum(["add", "deduct"]),
  amount: z
    .number({ error: "Enter an amount." })
    .positive("The amount has to be more than zero.")
    .max(MAX_ADJUSTMENT, "That looks too large — check the figure."),
  note: z.string().trim().max(200).optional(),
})

export type AdjustmentState =
  | { message?: string; errors?: Record<string, string[]>; success?: boolean }
  | undefined

export async function addPayrollAdjustment(
  _state: AdjustmentState,
  formData: FormData
): Promise<AdjustmentState> {
  const session = await requireManager()

  const raw = formData.get("amount")
  const validated = AdjustmentSchema.safeParse({
    employeeId: formData.get("employeeId"),
    cutoffDay: formData.get("cutoffDay"),
    label: formData.get("label"),
    direction: formData.get("direction"),
    amount: typeof raw === "string" && raw.trim() !== "" ? Number(raw) : undefined,
    note: (formData.get("note") as string)?.trim() || undefined,
  })

  if (!validated.success) {
    const errors = validated.error.flatten().fieldErrors
    return {
      errors,
      message:
        errors.label?.[0] ?? errors.amount?.[0] ?? "Check the adjustment.",
    }
  }

  const { employeeId, cutoffDay, label, direction, amount, note } =
    validated.data
  const start = cutoffStart(parseDayParam(cutoffDay, new Date()))

  await prisma.payrollAdjustment.create({
    data: {
      employeeId,
      cutoffStart: start,
      label,
      // The sign carries the meaning; the form asks for a plain positive
      // figure so nobody has to think about minus signs at half four.
      amount: direction === "deduct" ? -amount : amount,
      note: note ?? null,
      createdById: session.accountId,
    },
  })

  revalidatePath("/admin/payroll")
  return { success: true }
}

export async function removePayrollAdjustment(id: string) {
  await requireManager()
  if (!id) return

  await prisma.payrollAdjustment.delete({ where: { id } }).catch(() => undefined)
  revalidatePath("/admin/payroll")
}
