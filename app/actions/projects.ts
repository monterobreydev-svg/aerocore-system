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
    cogs: money,
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
    cogs: formData.get("cogs") ?? "",
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
          cogs: data.cogs,
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
      cogs: true,
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
      cogs: Number(before.cogs),
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
      cogs: data.cogs,
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
        cogs: data.cogs,
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
  cogs: number
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
  put("cogs", amount(before.cogs), amount(after.cogs))
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
