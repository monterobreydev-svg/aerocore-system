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
  type OpexExpense,
  type OpexMonth,
  type OpexPerson,
} from "@/lib/opex"
import { dateKey } from "@/lib/schedule"
import { labourCostBetween } from "@/lib/labour-cost/query"
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

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { salesOrderNo: true },
  })
  if (!project) return

  // Office-recorded costs are charged to a sales order number, not to a row
  // id, so deleting the project alone would leave them behind — charged to a
  // job that no longer exists, counted nowhere, and invisible in every
  // breakdown. They go with it, in the same transaction.
  //
  // Employees' liquidation lines are NOT touched: those belong to a claim that
  // was reviewed and paid. They simply stop counting towards a project, which
  // is what deleting the project means.
  await prisma.$transaction([
    prisma.companyExpense.deleteMany({
      where: { salesOrderNo: project.salesOrderNo },
    }),
    prisma.project.delete({ where: { id: projectId } }),
  ])

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
  /** Who spent it, or who recorded it when the office paid directly. */
  employeeName: string
  /** The liquidation's reference, or "Office" for a row typed in. */
  referenceNo: string
  /** This job's share of the receipt, which is what counts towards COGS. */
  amount: number
  /** False while the claim is still in the review queue. */
  approved: boolean
  /** Where the line came from, so the panel can say. */
  source: "liquidation" | "office" | "labour"
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

  // The span this job was actually worked, so the wage read is the size of the
  // project rather than the size of the company's history. A job nobody was
  // ever scheduled on has no wages to find.
  const worked = await prisma.schedule.aggregate({
    where: { salesOrderNo, status: { not: "CANCELLED" } },
    _min: { date: true },
    _max: { date: true },
  })

  const officeRows = await prisma.companyExpense.findMany({
    where: { kind: "COGS", salesOrderNo },
    select: {
      id: true,
      spentOn: true,
      description: true,
      amount: true,
      createdBy: {
        select: { employee: { select: { firstName: true, lastName: true } } },
      },
    },
    orderBy: { spentOn: "desc" },
    take: PROJECT_COST_LIMIT,
  })

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

  // One line per person: the wage of theirs that this job carried, summed
  // across every day they were scheduled on it. Not a line per day — a crew of
  // four on a three-week job would bury the receipts under eighty rows saying
  // almost nothing.
  const labour =
    worked._min.date && worked._max.date
      ? await labourCostBetween({
          from: worked._min.date,
          to: worked._max.date,
          salesOrderNos: [salesOrderNo],
        })
      : null

  const labourLines: ProjectCostLine[] = (labour?.people ?? [])
    .map((person) => ({
      id: `labour-${person.employeeId}`,
      spentOn: dateKey(worked._max.date!),
      description: "Wages for scheduled hours on this job",
      employeeName: person.name,
      referenceNo: "Payroll",
      amount: person.cost.bySalesOrder[salesOrderNo] ?? 0,
      // Payroll's own figure, worked out from punches that already happened.
      // There is no queue for it to be sitting in.
      approved: true,
      source: "labour" as const,
    }))
    .filter((line) => line.amount > 0)

  const lines: ProjectCostLine[] = [
    ...labourLines,
    ...rows.map((row) => {
      const claim = row.item.reimbursement
      return {
        id: row.id,
        spentOn: dateKey(claim.expenseDate),
        description: row.item.description,
        employeeName: `${claim.employee.firstName} ${claim.employee.lastName}`,
        referenceNo: claim.referenceNo,
        amount: Number(row.amount),
        approved: claim.status === "APPROVED",
        source: "liquidation" as const,
      }
    }),
    // An office row needs no approving — it was recorded by the person who
    // would have done the approving.
    ...officeRows.map((row) => ({
      id: row.id,
      spentOn: dateKey(row.spentOn),
      description: row.description,
      employeeName: `${row.createdBy.employee.firstName} ${row.createdBy.employee.lastName}`,
      referenceNo: "Office",
      amount: Number(row.amount),
      approved: true,
      source: "office" as const,
    })),
  ].sort((a, b) => b.spentOn.localeCompare(a.spentOn))

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
    truncated:
      rows.length === PROJECT_COST_LIMIT ||
      officeRows.length === PROJECT_COST_LIMIT,
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
  const empty: OpexMonth = {
    month,
    total: 0,
    wages: 0,
    unallocatedFieldWages: 0,
    people: [],
    expenses: [],
  }
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

  // Overhead the office typed in for this month — rent, a bill, a permit.
  const recorded = await prisma.companyExpense.findMany({
    where: { kind: "OPEX", spentOn: { gte: start, lte: end } },
    select: {
      id: true,
      spentOn: true,
      description: true,
      amount: true,
      createdBy: {
        select: { employee: { select: { firstName: true, lastName: true } } },
      },
    },
    orderBy: { spentOn: "desc" },
  })

  const expenses: OpexExpense[] = recorded.map((row) => ({
    id: row.id,
    spentOn: dateKey(row.spentOn),
    description: row.description,
    amount: Number(row.amount),
    recordedByName: `${row.createdBy.employee.firstName} ${row.createdBy.employee.lastName}`,
  }))

  // The crews' hours are a job's cost, not the office's — but whatever payroll
  // paid them that no job can be charged for still has to land somewhere, and
  // overhead is the only honest place left. `includeUnscheduled` is what stops
  // somebody who was never scheduled at all from falling out of both halves of
  // the accounts.
  const field = await labourCostBetween({
    from: start,
    to: end,
    includeUnscheduled: true,
  })

  const wages = people.reduce((sum, person) => sum + person.pay, 0)
  const other = expenses.reduce((sum, row) => sum + row.amount, 0)
  const unallocatedFieldWages = Math.round(field.unallocated * 100) / 100

  return {
    month,
    total: Math.round((wages + other + unallocatedFieldWages) * 100) / 100,
    wages: Math.round(wages * 100) / 100,
    unallocatedFieldWages,
    people,
    expenses,
  }
}

// ---------------------------------------------------------------------------
// Expenses the office records itself
// ---------------------------------------------------------------------------

/**
 * One typed row. `kind` decides which half of the sheet it lands on, and with
 * it whether a client and a sales order number are required or forbidden.
 */
const ExpenseLineSchema = z
  .object({
    kind: z.enum(["OPEX", "COGS"]),
    spentOn: day,
    description: z
      .string()
      .trim()
      .min(1, "Say what it was for.")
      .max(200, "That's too long for a description."),
    amount: money.refine((value) => value > 0, "Enter an amount."),
    clientId: z.string().trim().optional(),
    salesOrderNo: z.string().trim().optional(),
  })
  .refine(
    (line) => line.kind === "OPEX" || (line.clientId && line.salesOrderNo),
    "A job's cost needs a client and a sales order number."
  )

const ExpenseBatchSchema = z
  .array(ExpenseLineSchema)
  .min(1, "Add at least one expense.")
  // A batch is something somebody typed in one sitting; past this it is a
  // paste gone wrong, and every row still has to be checked against a project.
  .max(50, "That's more rows than one batch should carry.")

export type ExpenseBatchState =
  | { message?: string; rowErrors?: Record<number, string>; success?: never }
  | { success: true; recorded: number; message?: never; rowErrors?: never }
  | undefined

/**
 * Record a batch of office-paid expenses.
 *
 * Everything in one transaction: a half-written batch would leave somebody
 * re-typing the rows that did land, having to work out which those were.
 *
 * COGS rows are checked against the project they name — the sales order has to
 * exist and has to belong to the client chosen beside it. The picker only ever
 * offers matching pairs, but the picker is not what guards the database.
 */
export async function recordCompanyExpenses(
  _state: ExpenseBatchState,
  formData: FormData
): Promise<ExpenseBatchState> {
  const session = await requireProjectAccess()
  if (!session) {
    return { message: "You don't have permission to record expenses." }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(String(formData.get("lines") ?? "[]"))
  } catch {
    return { message: "Something went wrong reading the rows." }
  }

  const validated = ExpenseBatchSchema.safeParse(parsed)
  if (!validated.success) {
    const rowErrors: Record<number, string> = {}
    for (const issue of validated.error.issues) {
      const row = issue.path[0]
      if (typeof row === "number") rowErrors[row] = issue.message
    }
    return {
      message:
        Object.keys(rowErrors).length > 0
          ? "Some rows need fixing."
          : (validated.error.issues[0]?.message ?? "Check the rows."),
      rowErrors,
    }
  }

  const lines = validated.data

  // Every sales order named, checked in one read rather than one per row.
  const wanted = [
    ...new Set(
      lines.flatMap((line) => (line.salesOrderNo ? [line.salesOrderNo] : []))
    ),
  ]
  const projects = wanted.length
    ? await prisma.project.findMany({
        where: { salesOrderNo: { in: wanted } },
        select: { id: true, salesOrderNo: true, clientId: true },
      })
    : []
  const clientBySalesOrder = new Map(
    projects.map((project) => [project.salesOrderNo, project.clientId])
  )
  const projectIdBySalesOrder = new Map(
    projects.map((project) => [project.salesOrderNo, project.id])
  )

  const rowErrors: Record<number, string> = {}
  lines.forEach((line, index) => {
    if (line.kind !== "COGS") return
    const owner = clientBySalesOrder.get(line.salesOrderNo!)
    if (!owner) {
      rowErrors[index] = "That sales order no longer exists."
    } else if (owner !== line.clientId) {
      rowErrors[index] = "That sales order belongs to a different client."
    }
  })
  if (Object.keys(rowErrors).length > 0) {
    return { message: "Some rows need fixing.", rowErrors }
  }

  // A COGS row moves a project's cost, so it belongs in that project's
  // history beside every other change to it. Overhead moves no project and
  // gets no entry — the month's breakdown already names who recorded it.
  const history = lines.flatMap((line) => {
    if (line.kind !== "COGS") return []
    const projectId = projectIdBySalesOrder.get(line.salesOrderNo!)
    if (!projectId) return []
    return [
      {
        projectId,
        editedById: session.accountId,
        field: "expenseAdded",
        oldValue: null,
        newValue: `${line.description} · ${amount(line.amount)}`,
      },
    ]
  })

  // The rows and the record of them go in together, for the same reason the
  // batch itself is one transaction.
  await prisma.$transaction([
    prisma.companyExpense.createMany({
      data: lines.map((line) => ({
        kind: line.kind,
        spentOn: localDay(line.spentOn),
        description: line.description,
        amount: line.amount,
        // Overhead belongs to no job, and saying so explicitly keeps a stray
        // client id from making one look like a job's cost later.
        clientId: line.kind === "COGS" ? (line.clientId ?? null) : null,
        salesOrderNo: line.kind === "COGS" ? (line.salesOrderNo ?? null) : null,
        createdById: session.accountId,
      })),
    }),
    ...(history.length > 0
      ? [prisma.projectEditLog.createMany({ data: history })]
      : []),
  ])

  revalidatePath("/admin/projects")
  return { success: true, recorded: lines.length }
}

/**
 * Remove one office-recorded expense.
 *
 * The way a mistyped row is corrected: take it out and record it again. There
 * is no edit — these rows are two numbers and a sentence, and re-entering one
 * is quicker than a form that has to guard which of its fields may move
 * between an overhead row and a job's cost.
 *
 * Only rows the office typed. A liquidation line is an employee's claim, with
 * a review and a receipt behind it; it is not deletable from a project sheet
 * and never should be.
 */
export async function deleteCompanyExpense(expenseId: string) {
  const session = await requireProjectAccess()
  if (!session) {
    throw new Error("You don't have permission to remove expenses.")
  }

  // Read before the delete: the history entry has to say what went, and after
  // the row is gone there is nothing left to say it with.
  const expense = await prisma.companyExpense.findUnique({
    where: { id: expenseId },
    select: {
      kind: true,
      description: true,
      amount: true,
      salesOrderNo: true,
    },
  })
  if (!expense) return

  const project =
    expense.kind === "COGS" && expense.salesOrderNo
      ? await prisma.project.findUnique({
          where: { salesOrderNo: expense.salesOrderNo },
          select: { id: true },
        })
      : null

  await prisma.$transaction([
    prisma.companyExpense.delete({ where: { id: expenseId } }),
    ...(project
      ? [
          prisma.projectEditLog.create({
            data: {
              projectId: project.id,
              editedById: session.accountId,
              field: "expenseRemoved",
              oldValue: `${expense.description} · ${amount(Number(expense.amount))}`,
              newValue: null,
            },
          }),
        ]
      : []),
  ])

  revalidatePath("/admin/projects")
}
