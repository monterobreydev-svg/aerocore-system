"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { requireManager } from "@/lib/auth"
import {
  attendanceDay,
  cutoffEnd,
  cutoffLabel,
  cutoffStart,
  parseDayParam,
} from "@/lib/attendance"
import { buildPayslip } from "@/lib/payslip-query"
import { notifyEmployees } from "@/lib/notify"
import type { Payslip } from "@/lib/payroll"

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

  // The figures come from the shared reader — the same one the employee's own
  // payslip and the PDF use, so the three can't drift. Only the authorship of
  // each adjustment is extra here, and it is admin-only by design: an employee
  // needs to see that ₱500 came off, not which administrator typed it.
  const [record, adjustments] = await Promise.all([
    buildPayslip(employeeId, day),
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
  if (!record) return null

  return {
    employeeName: record.employeeName,
    employeeNo: record.employeeNo,
    position: record.position,
    cutoffStart: record.cutoffStart,
    cutoffEnd: record.cutoffEnd,
    payslip: record.payslip,
    adjustments: adjustments.map((row) => ({
      id: row.id,
      label: row.label,
      amount: Number(row.amount),
      note: row.note,
      createdAt: row.createdAt.toISOString(),
      createdByName: `${row.createdBy.employee.firstName} ${row.createdBy.employee.lastName}`,
    })),
  }
}

// ---------------------------------------------------------------------------
// Releasing a run
//
// Until this happens the period is the office's working document: figures move
// as punches are corrected and overtime is decided. Releasing says the run is
// final enough to show the people it pays — and only then does it appear on
// their side at all.
//
// It does not freeze the numbers. Payroll is recomputed from attendance on
// every read, and that stays true afterwards, so a punch fixed on Monday
// reaches the payslip the employee is looking at rather than leaving two
// versions of the truth in the building. What the row records is the decision:
// who published it, and when.
// ---------------------------------------------------------------------------

export type ReleaseState = { message?: string; success?: boolean } | undefined

export async function releasePayroll(cutoffDay: string): Promise<ReleaseState> {
  const session = await requireManager()

  const day = parseDayParam(cutoffDay, new Date())
  const start = cutoffStart(day)
  const end = cutoffEnd(day)

  // A period still running would be released half-finished, and every payslip
  // in it would change under the employee for days afterwards.
  if (end >= attendanceDay(new Date())) {
    return {
      message: "This period hasn't finished yet. Release it once the cutoff has closed.",
    }
  }

  await prisma.payrollRelease.upsert({
    where: { cutoffStart: start },
    create: {
      cutoffStart: start,
      cutoffEnd: end,
      releasedById: session.accountId,
    },
    // Re-releasing is not an error and not a second row — it just restamps who
    // stands behind the run.
    update: { releasedById: session.accountId, releasedAt: new Date() },
  })

  // Everyone the run pays, told once. Outside any transaction: an inbox row
  // failing is not a reason to un-release a payroll.
  const employees = await prisma.employee.findMany({
    where: { OR: [{ account: null }, { account: { isActive: true } }] },
    select: { id: true },
  })

  await notifyEmployees(
    employees.map((employee) => employee.id),
    {
      type: "PAYSLIP_RELEASED",
      title: "Payslip available",
      body: `Your payslip for ${cutoffLabel(start, end)} is ready to view.`,
      destination: "payroll",
    }
  )

  revalidatePath("/admin/payroll")
  revalidatePath("/employee/payslips")

  return { success: true }
}

/** Undo, for a run released a cutoff early. Hides it again; nothing is lost. */
export async function unreleasePayroll(
  cutoffDay: string
): Promise<ReleaseState> {
  await requireManager()

  const start = cutoffStart(parseDayParam(cutoffDay, new Date()))
  await prisma.payrollRelease.deleteMany({ where: { cutoffStart: start } })

  revalidatePath("/admin/payroll")
  revalidatePath("/employee/payslips")

  return { success: true }
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
