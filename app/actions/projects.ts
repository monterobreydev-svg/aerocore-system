"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db/prisma"
import { verifySession } from "@/lib/auth"
import {
  amount,
  nextSalesOrderNo,
  PAYMENT_TERMS_LABELS,
  PROJECT_STATUS_LABELS,
} from "@/lib/projects"
import {
  OPEX_LOOKBACK_DAYS,
  OPEX_STAFF,
  opexForMonth,
  type OpexMonth,
  type OpexPerson,
} from "@/lib/opex"
import { dateKey } from "@/lib/schedule"
import type { PaymentTerms, ProjectStatus } from "@/app/generated/prisma/client"

/**
 * Projects are the Director's book.
 *
 * Same rule as the page and the sidebar — see DIRECTOR_ONLY_ADMIN_PATHS in
 * lib/auth/roles.ts. Checked here as well because the page guard only decides
 * what renders; an action takes its arguments from whoever calls it.
 */
async function requireProjectAccess() {
  const session = await verifySession()
  return session.role === "DIRECTOR" ? session : null
}

// A figure as typed: "1,250,000", "1250000.50", or nothing at all. Blank is
// zero rather than an error — a project booked before anything has been
// collected is normal, and making somebody type 0 into four boxes to say so is
// just friction.
const money = z
  .string()
  .trim()
  .transform((value) => value.replace(/[₱,\s]/g, ""))
  .transform((value) => (value === "" ? 0 : Number(value)))
  .refine((value) => Number.isFinite(value), "Enter a number.")
  .refine((value) => value >= 0, "That can't be negative.")
  // Ten digits and change. Past this it's a typo — a stray keypress on the end
  // of an amount, which would otherwise poison every total on the page.
  .refine((value) => value < 1e12, "That figure is too large.")

const day = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.")

const ProjectSchema = z
  .object({
    status: z.enum([
      "IN_PROGRESS",
      "ACCOUNT_RECEIVABLE",
      "BILLED",
      "FOR_BILLING",
      "ON_HOLD",
      "CLOSED",
    ]),
    startDate: day,
    endDate: day.optional().or(z.literal("").transform(() => undefined)),
    siNo: z.string().trim().max(40, "That's too long for an S.I. number.").optional(),
    name: z
      .string()
      .trim()
      .min(1, "Give the project a name.")
      .max(200, "That's too long — put the detail in the name field."),
    clientId: z.string().min(1, "Choose a client."),
    terms: z.enum([
      "TWO_WEEKS",
      "UPON_COMPLETION",
      "NET_30",
      "NET_60",
      "DP30_PB60_RETENTION10",
      "DP50_COMPLETION50",
    ]),
    projectAmount: money,
    cashCollection: money,
    accrualRevenue: money,
  })
  // A job that ends before it starts is a typo in one of the two dates, and
  // it would sit in the wrong month for good.
  .refine(
    (value) => !value.endDate || value.endDate >= value.startDate,
    { path: ["endDate"], message: "The end date is before the start date." }
  )

export type ProjectState =
  | {
      errors?: Partial<Record<keyof z.infer<typeof ProjectSchema>, string[]>>
      message?: string
      success?: never
    }
  | { success: true; salesOrderNo?: string; errors?: never; message?: never }
  | undefined

function parse(formData: FormData) {
  return ProjectSchema.safeParse({
    status: formData.get("status"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate") ?? "",
    siNo: formData.get("siNo") ?? "",
    name: formData.get("name"),
    clientId: formData.get("clientId"),
    terms: formData.get("terms"),
    projectAmount: formData.get("projectAmount") ?? "",
    cashCollection: formData.get("cashCollection") ?? "",
    accrualRevenue: formData.get("accrualRevenue") ?? "",
  })
}

/** Local midnight, the same way every other date in this app is written. */
function localDay(value: string) {
  return new Date(`${value}T00:00:00`)
}

/**
 * The next sales order number, taken from the highest one already issued.
 *
 * Sorted as text, which is why the running part is zero-padded: "260010" has
 * to come after "260009", and it does only because both are six characters.
 */
async function issueSalesOrderNo() {
  const latest = await prisma.project.findFirst({
    orderBy: { salesOrderNo: "desc" },
    select: { salesOrderNo: true },
  })
  return nextSalesOrderNo(latest?.salesOrderNo)
}

export async function createProject(
  _state: ProjectState,
  formData: FormData
): Promise<ProjectState> {
  const session = await requireProjectAccess()
  if (!session) {
    return { message: "You don't have permission to add projects." }
  }

  const validated = parse(formData)
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors }
  }

  const data = validated.data

  // Two people adding a project in the same second both read the same "latest"
  // and both try to write the same number. The unique column is what makes
  // that a failed insert rather than two projects sharing an order number, and
  // this is the retry that turns the failure back into the next free number.
  for (let attempt = 0; attempt < 3; attempt++) {
    const salesOrderNo = await issueSalesOrderNo()

    try {
      await prisma.project.create({
        data: {
          salesOrderNo,
          status: data.status,
          startDate: localDay(data.startDate),
          endDate: data.endDate ? localDay(data.endDate) : null,
          siNo: data.siNo || null,
          name: data.name,
          clientId: data.clientId,
          terms: data.terms,
          projectAmount: data.projectAmount,
          cashCollection: data.cashCollection,
          accrualRevenue: data.accrualRevenue,
          createdById: session.accountId,
        },
        select: { id: true },
      })

      revalidatePath("/admin/projects")
      return { success: true, salesOrderNo }
    } catch (error) {
      const code = (error as { code?: string }).code
      if (code !== "P2002") throw error
    }
  }

  return { message: "Couldn't issue a sales order number. Try again." }
}

export async function updateProject(
  _state: ProjectState,
  formData: FormData
): Promise<ProjectState> {
  const session = await requireProjectAccess()
  if (!session) {
    return { message: "You don't have permission to edit projects." }
  }

  const id = String(formData.get("projectId") ?? "")
  if (!id) return { message: "That project no longer exists." }

  const validated = parse(formData)
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors }
  }

  const data = validated.data

  // What it was, in the words the history will use. Read before the write so
  // the two sides of every change come from the same request.
  const before = await prisma.project.findUnique({
    where: { id },
    select: {
      status: true,
      startDate: true,
      endDate: true,
      siNo: true,
      name: true,
      terms: true,
      projectAmount: true,
      cashCollection: true,
      accrualRevenue: true,
      client: { select: { name: true } },
    },
  })
  if (!before) return { message: "That project no longer exists." }

  // The incoming client by name, for the same reason: a log row that says
  // "changed the client from <uuid> to <uuid>" tells nobody anything.
  const after = await prisma.client.findUnique({
    where: { id: data.clientId },
    select: { name: true },
  })
  if (!after) return { errors: { clientId: ["Choose a client."] } }

  const changes = diffProject(
    {
      client: before.client.name,
      name: before.name,
      status: before.status,
      terms: before.terms,
      startDate: dateKey(before.startDate),
      endDate: before.endDate ? dateKey(before.endDate) : "",
      siNo: before.siNo ?? "",
      projectAmount: Number(before.projectAmount),
      cashCollection: Number(before.cashCollection),
      accrualRevenue: Number(before.accrualRevenue),
    },
    {
      client: after.name,
      name: data.name,
      status: data.status,
      terms: data.terms,
      startDate: data.startDate,
      endDate: data.endDate ?? "",
      siNo: data.siNo ?? "",
      projectAmount: data.projectAmount,
      cashCollection: data.cashCollection,
      accrualRevenue: data.accrualRevenue,
    }
  )

  // The change and the record of it go in together. A history that can survive
  // a failed write is a history nobody can trust.
  await prisma.$transaction(async (tx) => {
    // salesOrderNo is deliberately absent: it is issued once and never moves,
    // even when the project's dates do.
    await tx.project.update({
      where: { id },
      data: {
        status: data.status,
        startDate: localDay(data.startDate),
        endDate: data.endDate ? localDay(data.endDate) : null,
        siNo: data.siNo || null,
        name: data.name,
        clientId: data.clientId,
        terms: data.terms,
        projectAmount: data.projectAmount,
        cashCollection: data.cashCollection,
        accrualRevenue: data.accrualRevenue,
      },
      select: { id: true },
    })

    if (changes.length > 0) {
      await tx.projectEditLog.createMany({
        data: changes.map((change) => ({
          projectId: id,
          editedById: session.accountId,
          field: change.field,
          oldValue: change.oldValue,
          newValue: change.newValue,
        })),
      })
    }
  })

  revalidatePath("/admin/projects")
  return { success: true }
}

// ---------------------------------------------------------------------------
// Edit history
// ---------------------------------------------------------------------------

type ProjectSnapshot = {
  client: string
  name: string
  status: ProjectStatus
  terms: PaymentTerms
  startDate: string
  endDate: string
  siNo: string
  projectAmount: number
  cashCollection: number
  accrualRevenue: number
}

/** One row per field that actually moved, both sides already in words. */
function diffProject(before: ProjectSnapshot, after: ProjectSnapshot) {
  const changes: { field: string; oldValue: string; newValue: string }[] = []

  function put(field: string, oldValue: string, newValue: string) {
    if (oldValue !== newValue) changes.push({ field, oldValue, newValue })
  }

  put("name", before.name, after.name)
  put("client", before.client, after.client)
  put(
    "status",
    PROJECT_STATUS_LABELS[before.status],
    PROJECT_STATUS_LABELS[after.status]
  )
  put("startDate", before.startDate, after.startDate)
  // An open-ended job has no end date, which is a state worth naming rather
  // than logging as a change from nothing to something.
  put("endDate", before.endDate || "open-ended", after.endDate || "open-ended")
  put("siNo", before.siNo || "none", after.siNo || "none")
  put(
    "terms",
    PAYMENT_TERMS_LABELS[before.terms],
    PAYMENT_TERMS_LABELS[after.terms]
  )
  put("projectAmount", amount(before.projectAmount), amount(after.projectAmount))
  put(
    "cashCollection",
    amount(before.cashCollection),
    amount(after.cashCollection)
  )
  put(
    "accrualRevenue",
    amount(before.accrualRevenue),
    amount(after.accrualRevenue)
  )

  return changes
}

// A project is edited a handful of times in its life, but "a handful" is not a
// number the database enforces — so the read that renders the panel has one.
//
// Not exported: a "use server" module may only export async functions, and a
// stray `export const` here takes down every route that imports the file.
const PROJECT_HISTORY_LIMIT = 40

export type ProjectHistoryEntry = {
  id: string
  field: string
  oldValue: string | null
  newValue: string | null
  createdAt: string
  editedByName: string
}

/**
 * This project's history, fetched when the panel is opened.
 *
 * Not shipped with the ledger: history is per-project and grows forever, so
 * sending it with every row on screen is the payload that scales with two
 * things at once — which is exactly what the tracker is built to avoid.
 */
export async function listProjectHistory(
  projectId: string
): Promise<ProjectHistoryEntry[]> {
  const session = await requireProjectAccess()
  if (!session || !projectId) return []

  const rows = await prisma.projectEditLog.findMany({
    where: { projectId },
    select: {
      id: true,
      field: true,
      oldValue: true,
      newValue: true,
      createdAt: true,
      editedBy: {
        select: { employee: { select: { firstName: true, lastName: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: PROJECT_HISTORY_LIMIT,
  })

  return rows.map((row) => ({
    id: row.id,
    field: row.field,
    oldValue: row.oldValue,
    newValue: row.newValue,
    createdAt: row.createdAt.toISOString(),
    editedByName: `${row.editedBy.employee.firstName} ${row.editedBy.employee.lastName}`,
  }))
}

export async function deleteProject(projectId: string) {
  const session = await requireProjectAccess()
  if (!session) {
    throw new Error("You don't have permission to delete projects.")
  }

  await prisma.project.delete({ where: { id: projectId } })
  revalidatePath("/admin/projects")
}

// ---------------------------------------------------------------------------
// The S.O. picker on the employee's liquidation form
// ---------------------------------------------------------------------------

// A client's jobs, for the dropdown. Capped: the picker is a short list to
// choose from, not a browsable history, and a client with years of work behind
// them shouldn't push a phone's payload up to fill a select nobody scrolls.
//
// Not exported: a "use server" module may only export async functions, and a
// stray `export const` here takes down every route that imports the file.
const CLIENT_PROJECT_LIMIT = 60

export type ClientProjectOption = {
  salesOrderNo: string
  name: string
}

/**
 * The sales order numbers an employee may charge an expense to.
 *
 * Deliberately readable by anyone signed in, unlike the rest of this file.
 * Filing a liquidation means naming the job it was for, and the field this
 * feeds already accepted whatever the employee typed — a list of the client's
 * real numbers is strictly less licence than a free-text box, not more.
 *
 * Two columns only. The number identifies the job and the name lets somebody
 * recognise it; none of the money on a project has any business on a phone
 * whose owner is claiming forty pesos of fare against it.
 */
export async function listClientProjects(
  clientId: string
): Promise<ClientProjectOption[]> {
  await verifySession()
  if (!clientId) return []

  return prisma.project.findMany({
    where: { clientId },
    select: { salesOrderNo: true, name: true },
    // Newest first: an expense being filed today is nearly always against the
    // job booked most recently, so the useful options are at the top.
    orderBy: { salesOrderNo: "desc" },
    take: CLIENT_PROJECT_LIMIT,
  })
}

// ---------------------------------------------------------------------------
// What a project cost, line by line
// ---------------------------------------------------------------------------

// The number on the ledger is a total; this is what it is made of. Capped for
// the same reason every other per-record read here is — a long job's expenses
// grow without limit and the panel is read, not audited line by line.
//
// Not exported: a "use server" module may only export async functions, and a
// stray `export const` here takes down every route that imports the file.
const PROJECT_COST_LIMIT = 100

export type ProjectCostLine = {
  id: string
  /** The day the money was spent, not the day it was filed. */
  spentOn: string
  description: string
  employeeName: string
  referenceNo: string
  /** This job's share of the receipt, which is what counts towards COGS. */
  amount: number
  /** False while the claim is still in the review queue. */
  approved: boolean
}

export type ProjectCosts = {
  /** Approved shares — the figure the ledger's COGS column shows. */
  total: number
  /** Filed but not yet decided. Not in COGS, and worth knowing about. */
  pending: number
  lines: ProjectCostLine[]
  /**
   * True when the job has more expenses than this read returns. The totals
   * above are then the totals of what is listed, not of the job — so the panel
   * says as much rather than quietly showing a short answer.
   */
  truncated: boolean
}

/**
 * The expenses charged to one sales order number.
 *
 * Read when the detail panel is opened rather than with the ledger: this is
 * per-project and grows forever, which is the payload the tracker is built to
 * avoid. Rejected claims are left out entirely — they are not a cost and never
 * were.
 */
export async function listProjectCosts(
  salesOrderNo: string
): Promise<ProjectCosts> {
  const empty: ProjectCosts = { total: 0, pending: 0, lines: [], truncated: false }
  if (!(await requireProjectAccess()) || !salesOrderNo) return empty

  const rows = await prisma.reimbursementItemClient.findMany({
    where: {
      soNumber: salesOrderNo,
      item: { reimbursement: { status: { in: ["APPROVED", "PENDING_REVIEW"] } } },
    },
    select: {
      id: true,
      amount: true,
      item: {
        select: {
          description: true,
          reimbursement: {
            select: {
              referenceNo: true,
              expenseDate: true,
              status: true,
              employee: { select: { firstName: true, lastName: true } },
            },
          },
        },
      },
    },
    orderBy: { item: { reimbursement: { expenseDate: "desc" } } },
    take: PROJECT_COST_LIMIT,
  })

  const lines: ProjectCostLine[] = rows.map((row) => {
    const claim = row.item.reimbursement
    return {
      id: row.id,
      spentOn: dateKey(claim.expenseDate),
      description: row.item.description,
      employeeName: `${claim.employee.firstName} ${claim.employee.lastName}`,
      referenceNo: claim.referenceNo,
      amount: Number(row.amount),
      approved: claim.status === "APPROVED",
    }
  })

  const sum = (approved: boolean) =>
    Math.round(
      lines
        .filter((line) => line.approved === approved)
        .reduce((total, line) => total + line.amount, 0) * 100
    ) / 100

  return {
    total: sum(true),
    pending: sum(false),
    lines,
    truncated: rows.length === PROJECT_COST_LIMIT,
  }
}

// ---------------------------------------------------------------------------
// What the office cost in one month
// ---------------------------------------------------------------------------

/**
 * The admin side's wages for a month, person by person.
 *
 * The company sheet shows the total; this is who it was paid to. Read when a
 * month is opened rather than with the sheet — twelve months of somebody's
 * attendance is exactly the payload the tracker exists to avoid.
 *
 * Read-only, and deliberately so. Every figure here is payroll's, worked out
 * from punches by payroll's own rules; the place to change any of it is the
 * attendance record or the payroll page, not a project sheet.
 */
export async function listMonthlyOpex(
  year: number,
  month: number
): Promise<OpexMonth> {
  const empty: OpexMonth = { month, total: 0, people: [] }
  if (!(await requireProjectAccess())) return empty
  if (!Number.isInteger(month) || month < 0 || month > 11) return empty
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return empty

  // The month, not the cutoff: overhead is reported by calendar month, and the
  // two cutoffs inside one both fall in it. The read reaches back a few days
  // further so a holiday on the 1st knows whether it was qualified.
  const start = new Date(year, month, 1)
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999)
  const from = new Date(start)
  from.setDate(from.getDate() - OPEX_LOOKBACK_DAYS)

  const staff = await prisma.employee.findMany({
    where: OPEX_STAFF,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      position: true,
      hourlyRate: true,
      account: { select: { role: true } },
      attendance: {
        where: { date: { gte: from, lte: end } },
        select: {
          date: true,
          timeIn: true,
          timeOut: true,
          overtime: { select: { hours: true, approvedHours: true, status: true } },
        },
      },
      payrollAdjustments: {
        where: { cutoffStart: { gte: start, lte: end } },
        select: { cutoffStart: true, label: true, amount: true },
      },
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  })

  const people: OpexPerson[] = []

  for (const person of staff) {
    const figures = opexForMonth(
      year,
      month,
      person.attendance.map((punch) => ({
        date: punch.date,
        timeIn: punch.timeIn,
        timeOut: punch.timeOut,
        approvedOvertimeHours:
          punch.overtime?.status === "APPROVED"
            ? Number(punch.overtime.approvedHours ?? punch.overtime.hours)
            : 0,
      })),
      person.payrollAdjustments.map((row) => ({
        cutoffStart: row.cutoffStart,
        label: row.label,
        amount: Number(row.amount),
      })),
      Number(person.hourlyRate)
    )

    // Somebody who cost nothing this month isn't listed — a row of zeroes for
    // every admin on staff would bury the ones that count.
    if (figures.pay === 0) continue

    people.push({
      employeeId: person.id,
      name: `${person.firstName} ${person.lastName}`,
      role: person.account?.role ?? "EMPLOYEE",
      position: person.position,
      ...figures,
    })
  }

  people.sort((a, b) => b.pay - a.pay)

  return {
    month,
    total: Math.round(people.reduce((sum, p) => sum + p.pay, 0) * 100) / 100,
    people,
  }
}
