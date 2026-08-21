import type { Prisma } from "@/app/generated/prisma/client"
import { requireDirector } from "@/lib/auth"
import { prisma } from "@/lib/db/prisma"
import {
  deriveProjectFigures,
  nextSalesOrderNo,
  sumFigures,
  type ProjectMonth,
  type ProjectRow,
} from "@/lib/projects"
import { OPEX_LOOKBACK_DAYS, OPEX_STAFF, opexForMonth } from "@/lib/opex"
import { dateKey } from "@/lib/schedule"
import { ProjectsView } from "@/components/projects/projects-view"

// ---------------------------------------------------------------------------
// The project tracker
//
// One year at a time, grouped by the month each project starts in. The year is
// what keeps this page a fixed size: without it the list grows forever, and the
// company's whole order book would be shipped to a phone to render twelve
// sections of it.
//
// Everything derived — the VAT columns, gross profit, every monthly total and
// the yearly summary — is worked out here and sent as numbers. The browser
// receives a ledger it can render, not rows it has to do arithmetic on.
// ---------------------------------------------------------------------------

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function dayParam(value: string | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined
}

export default async function AdminProjectsPage({
  searchParams,
}: PageProps<"/admin/projects">) {
  await requireDirector()

  const params = await searchParams

  // Which years have anything in them, for the year picker. A distinct read of
  // one column — the alternative, loading every project to find out, is the
  // query this page exists to avoid.
  const yearRows = await prisma.$queryRaw<{ year: number }[]>`
    SELECT DISTINCT EXTRACT(YEAR FROM "startDate")::int AS year
      FROM "Project"
     ORDER BY year DESC
  `

  const thisYear = new Date().getFullYear()
  const years = yearRows.map((row) => row.year)
  if (!years.includes(thisYear)) years.push(thisYear)

  // Any plausible year is allowed, not just the ones with projects in them —
  // the period control steps a year at a time, and a step that silently landed
  // back on the year you came from would look like a broken button. A year
  // nobody has booked anything in shows its empty state, which is the honest
  // answer. The bounds only keep a hand-edited ?y=999999 out of the query.
  const requested = Number(one(params.y))
  const year =
    Number.isInteger(requested) && requested >= 2000 && requested <= 2100
      ? requested
      : thisYear

  // The picker lists the years worth jumping to, including wherever you are.
  if (!years.includes(year)) years.push(year)
  years.sort((a, b) => b - a)

  const clientId = one(params.c) || ""
  const from = dayParam(one(params.from))
  const to = dayParam(one(params.to))
  const query = (one(params.q) ?? "").trim()

  // The year is the window; a date range narrows it further rather than
  // replacing it, so "2026, this client, January to March" means what it says.
  const windowStart = new Date(`${year}-01-01T00:00:00`)
  const windowEnd = new Date(`${year}-12-31T23:59:59.999`)
  const start = from ? new Date(`${from}T00:00:00`) : windowStart
  const end = to ? new Date(`${to}T23:59:59.999`) : windowEnd

  const where: Prisma.ProjectWhereInput = {
    startDate: {
      gte: start > windowStart ? start : windowStart,
      lte: end < windowEnd ? end : windowEnd,
    },
    ...(clientId ? { clientId } : {}),
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

  const [records, clients, latest] = await Promise.all([
    prisma.project.findMany({
      where,
      // Named field by field: `include: { client: true }` would ship every
      // client's TIN, address and contact columns to render one name.
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
      },
      orderBy: [{ startDate: "asc" }, { salesOrderNo: "asc" }],
    }),
    prisma.client.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    // The number the next project will get, so the form can show it rather
    // than promising one. A preview, not a reservation: if somebody else saves
    // first they take this number and createProject issues the one after it —
    // which is why nothing is written here.
    prisma.project.findFirst({
      orderBy: { salesOrderNo: "desc" },
      select: { salesOrderNo: true },
    }),
  ])

  // ---------------------------------------------------------------------
  // What each job cost
  //
  // Not a column on the project — the sum of the expense shares employees
  // liquidated against its sales order number. One grouped read for every job
  // on screen rather than a query per project, and scoped to the numbers in
  // view so it stays the size of the page.
  //
  // APPROVED only. A claim still in the queue is a request, not a cost, and a
  // rejected one never was; letting either into the figure would move a gross
  // profit that has to survive being shown to the client's accountant. The
  // detail panel breaks the number down and names what is still pending.
  // ---------------------------------------------------------------------
  const salesOrderNos = records.map((record) => record.salesOrderNo)

  const [liquidated, officePaid] = await Promise.all([
    prisma.reimbursementItemClient.groupBy({
      by: ["soNumber"],
      where: {
        soNumber: { in: salesOrderNos },
        item: { reimbursement: { status: "APPROVED" } },
      },
      _sum: { amount: true },
    }),
    // The office's own rows against the same jobs — a supplier invoice paid
    // directly has no liquidation behind it but is just as much the job's cost.
    prisma.companyExpense.groupBy({
      by: ["salesOrderNo"],
      where: { kind: "COGS", salesOrderNo: { in: salesOrderNos } },
      _sum: { amount: true },
    }),
  ])

  const cogsBySalesOrder = new Map<string, number>()
  for (const row of liquidated) {
    if (!row.soNumber) continue
    cogsBySalesOrder.set(row.soNumber, Number(row._sum.amount ?? 0))
  }
  for (const row of officePaid) {
    if (!row.salesOrderNo) continue
    cogsBySalesOrder.set(
      row.salesOrderNo,
      Math.round(
        ((cogsBySalesOrder.get(row.salesOrderNo) ?? 0) +
          Number(row._sum.amount ?? 0)) *
          100
      ) / 100
    )
  }

  // ---------------------------------------------------------------------
  // What the office cost
  //
  // The admin side's own wages, worked out from their punches by the same
  // rules payroll uses — see lib/opex. One read of the year for the handful of
  // people it covers, then totalled per month here so the browser is sent a
  // figure per month rather than a year of somebody's attendance.
  //
  // Not filtered by client or S.O.: overhead belongs to the month, not to a
  // job. It is the one column on the company sheet the project filters leave
  // alone, and the sheet says so.
  // ---------------------------------------------------------------------
  // Reaches back before the year opens: a holiday on 1 January is qualified by
  // the last workday of December, and a read starting on the 1st cannot say
  // whether it pays.
  const opexFrom = new Date(windowStart)
  opexFrom.setDate(opexFrom.getDate() - OPEX_LOOKBACK_DAYS)

  const opexStaff = await prisma.employee.findMany({
    where: OPEX_STAFF,
    select: {
      id: true,
      hourlyRate: true,
      attendance: {
        where: { date: { gte: opexFrom, lte: windowEnd } },
        select: {
          date: true,
          timeIn: true,
          timeOut: true,
          overtime: { select: { hours: true, approvedHours: true, status: true } },
        },
      },
      // Allowances the office added by hand. Money the company pays, so it is
      // overhead as much as an hour worked is.
      payrollAdjustments: {
        where: { cutoffStart: { gte: windowStart, lte: windowEnd } },
        select: { cutoffStart: true, label: true, amount: true },
      },
    },
  })

  // Overhead the office typed in, on top of what payroll costs.
  const officeOverhead = await prisma.companyExpense.findMany({
    where: { kind: "OPEX", spentOn: { gte: windowStart, lte: windowEnd } },
    select: { spentOn: true, amount: true },
  })

  const opexByMonthTotal = new Map<number, number>()
  for (const row of officeOverhead) {
    const month = row.spentOn.getMonth()
    opexByMonthTotal.set(
      month,
      Math.round(((opexByMonthTotal.get(month) ?? 0) + Number(row.amount)) * 100) / 100
    )
  }
  for (const person of opexStaff) {
    const punches = person.attendance.map((punch) => ({
      date: punch.date,
      timeIn: punch.timeIn,
      timeOut: punch.timeOut,
      // Only what the office granted — the same rule the payslip applies.
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

    for (let month = 0; month < 12; month++) {
      const figures = opexForMonth(
        year,
        month,
        punches,
        adjustments,
        Number(person.hourlyRate)
      )
      if (figures.pay === 0) continue

      opexByMonthTotal.set(
        month,
        Math.round(((opexByMonthTotal.get(month) ?? 0) + figures.pay) * 100) / 100
      )
    }
  }

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
    terms: record.terms,
    // Decimal doesn't survive the trip to a client component, and the derived
    // figures are computed from the same numbers the browser will display.
    ...deriveProjectFigures(
      {
        projectAmount: Number(record.projectAmount),
        cashCollection: Number(record.cashCollection),
        accrualRevenue: Number(record.accrualRevenue),
      },
      cogsBySalesOrder.get(record.salesOrderNo) ?? 0
    ),
  }))

  // Grouped by the month the project *starts* in, so moving a start date from
  // January to February moves the project and re-totals both months with no
  // stored position to keep in step.
  const byMonth = new Map<number, ProjectRow[]>()
  for (const project of projects) {
    const month = Number(project.startDate.slice(5, 7)) - 1
    const bucket = byMonth.get(month)
    if (bucket) bucket.push(project)
    else byMonth.set(month, [project])
  }

  // Only months that have something in them: twelve headings, nine of them
  // empty, is a page you have to scroll past rather than read.
  const months: ProjectMonth[] = [...byMonth.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([month, rows]) => ({
      month,
      projects: rows,
      totals: sumFigures(rows),
    }))

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Projects</h2>
        <p className="text-sm text-muted-foreground">
          Every job sold, by the month it starts — what it&apos;s worth, what it
          cost, and what has come in.
        </p>
      </div>

      <ProjectsView
        year={year}
        years={years}
        months={months}
        yearTotals={sumFigures(projects)}
        clients={clients}
        opexByMonth={Object.fromEntries(opexByMonthTotal)}
        nextNumber={nextSalesOrderNo(latest?.salesOrderNo)}
        filters={{ clientId, from: from ?? "", to: to ?? "", query }}
      />
    </div>
  )
}
