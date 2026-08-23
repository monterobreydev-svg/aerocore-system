import "server-only"

import type { Prisma } from "@/app/generated/prisma/client"
import { prisma } from "@/lib/db/prisma"
import { dateKey } from "@/lib/schedule"
import { labourCostBetween } from "@/lib/labour-cost/query"
import { OPEX_LOOKBACK_DAYS, OPEX_STAFF, opexForMonth } from "@/lib/opex"
import {
  deriveProjectFigures,
  summariseMonth,
  sumFigures,
  type MonthSummary,
  type ProjectRow,
  type ProjectTotals,
} from "@/lib/projects"

// ---------------------------------------------------------------------------
// One year of the project book, gathered for export
// ---------------------------------------------------------------------------
//
// Recomputed here rather than read off the page, for the same reason the
// payroll download is: a route answers on its own and cannot assume a screen
// was ever rendered. The arithmetic is the same either way — deriveProjectFigures
// for the money, labourCostBetween for the wages, opexForMonth for the
// overhead — so the export and the tracker can only agree.
//
// The expense lines are deliberately NOT capped. Every other read in this app
// is, because it feeds a page and an unbounded list is a payload nobody asked
// for. A download is the opposite: an accountant reconciling a year needs all
// of it, and a silently short answer is worse than a slow one.

/** One charge against a job, whatever it came from. */
export type ProjectExpenseLine = {
  salesOrderNo: string
  clientName: string
  projectName: string
  /** The day the money was spent, not the day it was filed. */
  spentOn: string
  source: "Liquidation" | "Office" | "Labour"
  description: string
  /** The claim's reference, "Office", or "Payroll". */
  reference: string
  /** Who spent it, who recorded it, or whose wages they were. */
  person: string
  amount: number
  /** Liquidations awaiting review are shown but excluded from COGS. */
  status: "Approved" | "Awaiting review"
}

/**
 * What the reader was looking at when they pressed Download.
 *
 * The same four the tracker filters by, so the document is always exactly the
 * screen it came from. A report that quietly widened past an applied filter
 * would be quoted as if it were the whole book.
 */
export type ProjectsReportScope = {
  year: number
  /** Narrows the year. "YYYY-MM-DD", or absent for the whole of it. */
  from?: string
  to?: string
  clientId?: string
  /** The search box. Narrows like the others, and is named in the document. */
  query?: string
}

/** One line of overhead — the other half of the accounts, by month. */
export type OpexLine = {
  month: number
  monthName: string
  source: "Admin payroll" | "Recorded" | "Unscheduled crew"
  description: string
  person: string
  spentOn: string
  amount: number
}

export type ProjectsReport = {
  year: number
  /** "2026", or "1 Feb – 31 Mar 2026" when a range was applied. */
  periodLabel: string
  /** What else narrowed it — a client, a search — or null when nothing did. */
  filterNote: string | null
  generatedAt: string
  /** Every project whose start date falls in the year, oldest first. */
  projects: ProjectRow[]
  totals: ProjectTotals
  /** 0–11 → the year's totals for that month. Empty months are absent. */
  monthTotals: Map<number, ProjectTotals>
  /** 0–11 → overhead for that month, wages plus what the office recorded. */
  opexByMonth: Map<number, number>
  expenses: ProjectExpenseLine[]
  /** The overhead behind opexByMonth, line by line. */
  opexLines: OpexLine[]
  /**
   * A month a row: projects, revenue, gross profit, overhead, net profit.
   *
   * The same shape the tracker's company sheet shows, from the same
   * summariseMonth — so the exported tab and the screen are one calculation.
   */
  monthSummaries: MonthSummary[]
  /** The year's row of the same table. */
  yearSummary: MonthSummary
  /** Charged to no job: unscheduled crew wages. Overhead, shown for contrast. */
  unallocatedWages: number
}

const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

/** "1 Feb 2026" — a date the way a document writes one. */
function longDay(value: Date) {
  return value.toLocaleDateString("en-PH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export async function buildProjectsReport(
  scope: ProjectsReportScope
): Promise<ProjectsReport> {
  const { year } = scope

  // The year is the window and a range narrows it — the same rule the tracker
  // states, so "2026, January to March" means what it says rather than
  // silently becoming all of 2026 or spilling outside it.
  const yearStart = new Date(year, 0, 1)
  const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999)
  const askedFrom = scope.from ? new Date(`${scope.from}T00:00:00`) : yearStart
  const askedTo = scope.to
    ? new Date(`${scope.to}T23:59:59.999`)
    : yearEnd
  // Which projects appear.
  const selectionStart = askedFrom > yearStart ? askedFrom : yearStart
  const selectionEnd = askedTo < yearEnd ? askedTo : yearEnd

  // What those projects cost. Deliberately the whole year, not the selection:
  // a job that started in July is still charged the crew's August hours, and
  // the tracker computes it that way too. Narrowing this as well would make one
  // project's COGS depend on the date range it happened to be viewed through —
  // the same job showing two different costs on two screens.
  const costStart = yearStart
  const costEnd = yearEnd

  const query = scope.query?.trim() ?? ""
  const where: Prisma.ProjectWhereInput = {
    startDate: { gte: selectionStart, lte: selectionEnd },
    ...(scope.clientId ? { clientId: scope.clientId } : {}),
    ...(query
      ? {
          OR: [
            { salesOrderNo: { contains: query, mode: "insensitive" } },
            { name: { contains: query, mode: "insensitive" } },
            { siNo: { contains: query, mode: "insensitive" } },
            { client: { name: { contains: query, mode: "insensitive" } } },
          ],
        }
      : {}),
  }

  const records = await prisma.project.findMany({
    where,
    // Named field by field, the same as the tracker: `include` would ship every
    // client column to render one name.
    select: {
      id: true,
      salesOrderNo: true,
      status: true,
      startDate: true,
      endDate: true,
      siNo: true,
      name: true,
      terms: true,
      projectAmount: true,
      cashCollection: true,
      accrualRevenue: true,
      clientId: true,
      client: { select: { name: true } },
      branchId: true,
      branch: { select: { name: true } },
    },
    orderBy: [{ startDate: "asc" }, { salesOrderNo: "asc" }],
  })

  const salesOrderNos = records.map((record) => record.salesOrderNo)

  const [liquidated, officePaid, labour, claimLines, officeLines] =
    await Promise.all([
      prisma.reimbursementItemClient.groupBy({
        by: ["soNumber"],
        where: {
          soNumber: { in: salesOrderNos },
          item: { reimbursement: { status: "APPROVED" } },
        },
        _sum: { amount: true },
      }),
      prisma.companyExpense.groupBy({
        by: ["salesOrderNo"],
        where: { kind: "COGS", salesOrderNo: { in: salesOrderNos } },
        _sum: { amount: true },
      }),
      // One pass answers both the per-job wages and the unallocated remainder.
      labourCostBetween({
        from: costStart,
        to: costEnd,
        includeUnscheduled: true,
      }),
      // The lines behind the first total. Pending ones are listed too — money
      // the company has not yet decided on is exactly what an accountant wants
      // to see — but marked, and left out of COGS.
      prisma.reimbursementItemClient.findMany({
        where: {
          soNumber: { in: salesOrderNos },
          item: {
            reimbursement: { status: { in: ["APPROVED", "PENDING_REVIEW"] } },
          },
        },
        select: {
          soNumber: true,
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
      }),
      prisma.companyExpense.findMany({
        where: { kind: "COGS", salesOrderNo: { in: salesOrderNos } },
        select: {
          salesOrderNo: true,
          spentOn: true,
          description: true,
          amount: true,
          createdBy: {
            select: { employee: { select: { firstName: true, lastName: true } } },
          },
        },
      }),
    ])

  // ---- COGS per job -------------------------------------------------------

  const cogs = new Map<string, number>()
  const add = (key: string | null, amount: number) => {
    if (!key) return
    cogs.set(key, Math.round(((cogs.get(key) ?? 0) + amount) * 100) / 100)
  }
  for (const row of liquidated) add(row.soNumber, Number(row._sum.amount ?? 0))
  for (const row of officePaid) add(row.salesOrderNo, Number(row._sum.amount ?? 0))
  for (const [key, wages] of Object.entries(labour.bySalesOrder)) add(key, wages)

  const projects: ProjectRow[] = records.map((record) => ({
    id: record.id,
    salesOrderNo: record.salesOrderNo,
    status: record.status,
    startDate: dateKey(record.startDate),
    endDate: record.endDate ? dateKey(record.endDate) : null,
    siNo: record.siNo,
    name: record.name,
    clientId: record.clientId,
    clientName: record.client.name,
    branchId: record.branchId,
    branchName: record.branch?.name ?? null,
    terms: record.terms,
    ...deriveProjectFigures(
      {
        projectAmount: Number(record.projectAmount),
        cashCollection: Number(record.cashCollection),
        accrualRevenue: Number(record.accrualRevenue),
      },
      cogs.get(record.salesOrderNo) ?? 0
    ),
  }))

  // ---- the month bands the charts are drawn from --------------------------

  const monthTotals = new Map<number, ProjectTotals>()
  const byMonth = new Map<number, ProjectRow[]>()
  for (const [index, project] of projects.entries()) {
    void index
    const month = new Date(`${project.startDate}T00:00:00`).getMonth()
    byMonth.set(month, [...(byMonth.get(month) ?? []), project])
  }
  for (const [month, rows] of byMonth) monthTotals.set(month, sumFigures(rows))

  // ---- overhead, month by month -------------------------------------------

  // Overhead is reported for the period on the cover, not for the year: it
  // belongs to no project, so there is no per-job figure for it to disagree
  // with, and "the year's overhead" under an August heading would be read as
  // August's.
  const opexFrom = new Date(selectionStart)
  opexFrom.setDate(opexFrom.getDate() - OPEX_LOOKBACK_DAYS)

  const opexStaff = await prisma.employee.findMany({
    where: OPEX_STAFF,
    select: {
      firstName: true,
      lastName: true,
      position: true,
      hourlyRate: true,
      attendance: {
        where: { date: { gte: opexFrom, lte: selectionEnd } },
        select: {
          date: true,
          timeIn: true,
          timeOut: true,
          overtime: { select: { hours: true, approvedHours: true, status: true } },
        },
      },
      payrollAdjustments: {
        where: { cutoffStart: { gte: selectionStart, lte: selectionEnd } },
        select: { cutoffStart: true, label: true, amount: true },
      },
    },
  })

  // Line by line rather than grouped: the workbook needs the detail, and the
  // monthly totals are a sum of it either way — one read instead of two that
  // could disagree.
  const recorded = await prisma.companyExpense.findMany({
    where: {
      kind: "OPEX",
      spentOn: { gte: selectionStart, lte: selectionEnd },
    },
    select: {
      spentOn: true,
      description: true,
      amount: true,
      createdBy: {
        select: { employee: { select: { firstName: true, lastName: true } } },
      },
    },
    orderBy: { spentOn: "asc" },
  })

  const opexByMonth = new Map<number, number>()
  const addOpex = (month: number, amount: number) => {
    if (amount === 0) return
    opexByMonth.set(
      month,
      Math.round(((opexByMonth.get(month) ?? 0) + amount) * 100) / 100
    )
  }
  const opexLines: OpexLine[] = []

  for (const row of recorded) {
    const month = row.spentOn.getMonth()
    const amount = Number(row.amount)
    addOpex(month, amount)
    opexLines.push({
      month,
      monthName: MONTH_LABELS[month],
      source: "Recorded",
      description: row.description,
      person: `${row.createdBy.employee.firstName} ${row.createdBy.employee.lastName}`,
      spentOn: dateKey(row.spentOn),
      amount,
    })
  }
  for (const person of opexStaff) {
    const punches = person.attendance.map((punch) => ({
      date: punch.date,
      timeIn: punch.timeIn,
      timeOut: punch.timeOut,
      approvedOvertimeHours:
        punch.overtime?.status === "APPROVED"
          ? Number(punch.overtime.approvedHours ?? punch.overtime.hours)
          : 0,
    }))
    const adjustments = person.payrollAdjustments.map((row) => ({
      cutoffStart: row.cutoffStart,
      label: row.label,
      amount: Number(row.amount),
    }))
    for (
      let month = selectionStart.getMonth();
      month <= selectionEnd.getMonth();
      month += 1
    ) {
      const figures = opexForMonth(
        year,
        month,
        punches,
        adjustments,
        Number(person.hourlyRate)
      )
      if (figures.pay === 0) continue

      addOpex(month, figures.pay)
      opexLines.push({
        month,
        monthName: MONTH_LABELS[month],
        source: "Admin payroll",
        description: `${figures.daysWorked} ${figures.daysWorked === 1 ? "day" : "days"} worked, ${figures.hours} hours${figures.overtimeHours > 0 ? ` including ${figures.overtimeHours} overtime` : ""}`,
        person: `${person.firstName} ${person.lastName} · ${person.position}`,
        // Overhead is a month's figure, not a day's — payroll pays for things
        // no single date owns. The month end is where it is filed.
        spentOn: dateKey(new Date(year, month + 1, 0)),
        amount: figures.pay,
      })
    }
  }
  // Crew wages no job could carry are overhead too — the same figure the
  // tracker's OPEX column shows.
  for (const [key, wages] of Object.entries(labour.unallocatedByMonth)) {
    const [monthYear, monthNumber] = key.split("-").map(Number)
    const month = monthNumber - 1
    if (
      monthYear === year &&
      month >= selectionStart.getMonth() &&
      month <= selectionEnd.getMonth()
    ) {
      addOpex(month, wages)
      opexLines.push({
        month,
        monthName: MONTH_LABELS[month],
        source: "Unscheduled crew",
        description:
          "Crew wages with no schedule against a sales order, so charged to no job",
        person: "Field crews",
        spentOn: dateKey(new Date(year, month + 1, 0)),
        amount: wages,
      })
    }
  }

  // ---- the lines behind every COGS figure ---------------------------------

  const named = new Map(
    projects.map((project) => [
      project.salesOrderNo,
      { clientName: project.clientName, projectName: project.name },
    ])
  )
  const of = (salesOrderNo: string) =>
    named.get(salesOrderNo) ?? { clientName: "—", projectName: "—" }

  const expenses: ProjectExpenseLine[] = [
    ...claimLines.map((row) => {
      const claim = row.item.reimbursement
      return {
        salesOrderNo: row.soNumber!,
        ...of(row.soNumber!),
        spentOn: dateKey(claim.expenseDate),
        source: "Liquidation" as const,
        description: row.item.description,
        reference: claim.referenceNo,
        person: `${claim.employee.firstName} ${claim.employee.lastName}`,
        amount: Number(row.amount),
        status:
          claim.status === "APPROVED"
            ? ("Approved" as const)
            : ("Awaiting review" as const),
      }
    }),
    ...officeLines.map((row) => ({
      salesOrderNo: row.salesOrderNo!,
      ...of(row.salesOrderNo!),
      spentOn: dateKey(row.spentOn),
      source: "Office" as const,
      description: row.description,
      reference: "Office",
      person: `${row.createdBy.employee.firstName} ${row.createdBy.employee.lastName}`,
      amount: Number(row.amount),
      status: "Approved" as const,
    })),
    // One line per person per job rather than per day: a crew of four on a
    // three-week job would otherwise bury the receipts under eighty rows.
    ...labour.people.flatMap((person) =>
      Object.entries(person.cost.bySalesOrder)
        .filter(([salesOrderNo]) => named.has(salesOrderNo))
        .map(([salesOrderNo, amount]) => ({
          salesOrderNo,
          ...of(salesOrderNo),
          spentOn: `${year}-12-31`,
          source: "Labour" as const,
          description: "Wages for scheduled hours on this job",
          reference: "Payroll",
          person: person.name,
          amount,
          status: "Approved" as const,
        }))
    ),
  ]
    .filter((line) => line.salesOrderNo && line.amount !== 0)
    .sort(
      (a, b) =>
        a.salesOrderNo.localeCompare(b.salesOrderNo) ||
        a.spentOn.localeCompare(b.spentOn) ||
        a.source.localeCompare(b.source)
    )

  // What the cover has to say this document covers. A range that turned out
  // to be the whole year is written as the year — "1 Jan – 31 Dec 2026" is the
  // same period said less clearly.
  const narrowed =
    selectionStart.getTime() !== yearStart.getTime() ||
    selectionEnd.getTime() !== yearEnd.getTime()

  const client = scope.clientId
    ? projects.find((project) => project.clientId === scope.clientId)?.clientName
    : null

  const narrowedBy = [
    client ? `Client: ${client}` : null,
    // The search box is a filter like the others, so a document produced with
    // one applied has to say so — otherwise it reads as the whole book and is
    // quoted as one.
    query ? `Matching "${query}"` : null,
  ].filter(Boolean)

  // The company sheet: every month that had projects or a payroll to meet.
  // A month with overhead and no jobs is a real month of the business, and
  // leaving it out would hide the cost along with the empty row — the same
  // rule the tracker's own sheet states.
  const sheetMonths = [
    ...new Set([...monthTotals.keys(), ...opexByMonth.keys()]),
  ].sort((a, b) => a - b)

  const monthSummaries = sheetMonths.map((month) =>
    summariseMonth(
      month,
      monthTotals.get(month) ?? sumFigures([]),
      opexByMonth.get(month) ?? 0
    )
  )

  const yearSummary = summariseMonth(
    null,
    sumFigures(projects),
    [...opexByMonth.values()].reduce((sum, value) => sum + value, 0)
  )

  opexLines.sort(
    (a, b) =>
      a.month - b.month ||
      a.source.localeCompare(b.source) ||
      b.amount - a.amount
  )

  return {
    year,
    periodLabel: narrowed
      ? `${longDay(selectionStart)} – ${longDay(selectionEnd)}`
      : String(year),
    filterNote: narrowedBy.length > 0 ? narrowedBy.join(" · ") : null,
    generatedAt: new Date().toISOString(),
    projects,
    totals: sumFigures(projects),
    monthTotals,
    opexByMonth,
    expenses,
    opexLines,
    monthSummaries,
    yearSummary,
    unallocatedWages: labour.unallocated,
  }
}
