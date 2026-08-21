import "server-only"

import { prisma } from "@/lib/db/prisma"
import {
  cutoffEnd,
  cutoffLabel,
  cutoffStart,
  nextDay,
  workedMinutes,
} from "@/lib/attendance"
import { computePayslip, holidaysBetween, wholeHours } from "@/lib/payroll"
import { HOLIDAY_QUALIFYING_LOOKBACK_DAYS } from "@/lib/payroll"
import {
  SCHEDULE_STATUS_LABELS,
  WORK_TYPE_LABELS,
  dateKey,
} from "@/lib/schedule"
import { REPORT_TYPE_FOLDER } from "@/lib/documents"

// ---------------------------------------------------------------------------
// One period of the company, counted
// ---------------------------------------------------------------------------
//
// Everything the reports page shows comes from here, in one pass, so the
// figures on a chart and the sentences in the downloaded PDF can never disagree
// — they are the same object rendered twice.
//
// Deliberately a *summary*, never rows. The page and the download both need
// totals and small groupings; shipping a month of punches to the browser to add
// them up there is the payload this codebase exists to avoid.

/** A range longer than this stops being a report and starts being an export. */
const MAX_RANGE_DAYS = 366

/** Cutoffs to compute payroll across. Twelve is half a year, twice a month. */
const MAX_CUTOFFS = 12

/** How many rows a "top N" chart carries. Past this it stops being scannable. */
const TOP_N = 6

/**
 * Past a quarter, "versus the window before" stops being a comparison anybody
 * reads and starts being a second report nobody asked for. Short ranges get it;
 * long ones save the reads.
 */
const COMPARE_MAX_DAYS = 92

export type ReportRange = { from: Date; to: Date }

export type Slice = { key: string; label: string; value: number }

export type ReportData = {
  range: { from: string; to: string; label: string; days: number }

  /** The headline figures, for the tiles across the top. */
  headline: {
    staff: number
    daysWorked: number
    hoursWorked: number
    overtimeHours: number
    grossPay: number
    netPay: number
    jobs: number
    jobsCompleted: number
    reportsFiled: number
    claims: number
    claimsAmount: number
  }

  /**
   * The same measures over the window immediately before this one, so a figure
   * can be read as better or worse rather than just large.
   *
   * Payroll is deliberately absent. Pay is earned per cutoff, and an arbitrary
   * window covers a different number of cutoffs than the window before it — a
   * "down 40%" there would be an artefact of where the dates fell, not a fact
   * about the company. Null on long ranges, where nobody reads it anyway.
   */
  compare: {
    label: string
    daysWorked: number
    hoursWorked: number
    jobs: number
    reportsFiled: number
  } | null

  /** Hours on the clock per day — the trend line. */
  hoursByDay: { date: string; hours: number; punches: number }[]

  /** What made up the payroll, per cutoff. Five categorical series. */
  payrollByCutoff: {
    label: string
    basic: number
    overtime: number
    night: number
    holiday: number
    restDay: number
  }[]

  scheduleStatus: Slice[]
  workTypes: Slice[]
  topClients: Slice[]
  reportTypes: Slice[]

  /**
   * Expense claims, as money rather than as a count of rows.
   *
   * A liquidation report that only says "4 claims" answers none of the
   * questions anyone actually has about it: how much, to whom, against which
   * client, filed late or not, and how long the office took to decide.
   */
  claims: {
    total: number
    count: number
    /** Fixed order — approved, awaiting, rejected — with money against each. */
    byStatus: { key: string; label: string; count: number; amount: number }[]
    /** Who filed them, by value. */
    topClaimants: Slice[]
    /** Where the money was charged. A line can be split across jobs, so these
     *  are the stored per-client shares, not whole claims counted twice. */
    byClient: Slice[]
    lateCount: number
    /** Mean days from filing to decision, over the claims that got one. */
    turnaroundDays: number | null
    largest: number
  }

  /** Things worth someone's attention rather than their admiration. */
  flags: {
    openPunches: number
    autoClosed: number
    unapprovedOvertime: number
    pendingClaims: number
    cancelledJobs: number
  }
}

function clampRange({ from, to }: ReportRange): ReportRange {
  const start = new Date(from)
  start.setHours(0, 0, 0, 0)

  const end = new Date(to)
  end.setHours(0, 0, 0, 0)

  // A backwards range is a typed mistake, not a request for nothing.
  if (end < start) return clampRange({ from: to, to: from })

  const span = Math.round((+end - +start) / 86_400_000)
  if (span > MAX_RANGE_DAYS) {
    const capped = new Date(start)
    capped.setDate(capped.getDate() + MAX_RANGE_DAYS)
    return { from: start, to: capped }
  }

  return { from: start, to: end }
}

/** "1 Aug – 17 Aug 2026", the way the heading and the PDF both say it. */
function rangeLabel(from: Date, to: Date) {
  const sameYear = from.getFullYear() === to.getFullYear()
  const opening = from.toLocaleDateString("en-PH", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  })
  const closing = to.toLocaleDateString("en-PH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
  return `${opening} – ${closing}`
}

function toSlices<T extends string>(
  counts: Map<T, number>,
  labels: Record<T, string>
): Slice[] {
  return [...counts.entries()]
    .map(([key, value]) => ({ key, label: labels[key] ?? key, value }))
    .sort((a, b) => b.value - a.value)
}

export async function buildReport(input: ReportRange): Promise<ReportData> {
  const { from, to } = clampRange(input)
  const until = nextDay(to)
  const days = Math.round((+to - +from) / 86_400_000) + 1

  // The window immediately before this one, of the same length, for the deltas
  // on the headline figures.
  const comparable = days <= COMPARE_MAX_DAYS
  const priorTo = new Date(from)
  priorTo.setDate(priorTo.getDate() - 1)
  const priorFrom = new Date(priorTo)
  priorFrom.setDate(priorFrom.getDate() - (days - 1))
  const priorWindow = { gte: priorFrom, lt: nextDay(priorTo) }

  // Every read is bounded by the range, and every one of them is a grouping or
  // a count rather than a page of rows.
  const [
    staff,
    attendance,
    schedules,
    reportsFiled,
    claims,
    overtime,
    priorAttendance,
    priorJobs,
    priorReports,
    claimsByClient,
  ] = await Promise.all([
    prisma.employee.count({
      where: { OR: [{ account: null }, { account: { isActive: true } }] },
    }),
    prisma.attendance.findMany({
      where: { date: { gte: from, lt: until } },
      select: {
        date: true,
        timeIn: true,
        timeOut: true,
        autoTimedOut: true,
      },
      orderBy: { date: "asc" },
    }),
    prisma.schedule.findMany({
      where: { date: { gte: from, lt: until } },
      select: {
        status: true,
        workTypes: true,
        client: { select: { name: true } },
      },
    }),
    prisma.attendanceReport.findMany({
      where: { attendance: { date: { gte: from, lt: until } } },
      select: { type: true },
    }),
    prisma.reimbursement.findMany({
      where: { submittedAt: { gte: from, lt: until } },
      select: {
        status: true,
        totalAmount: true,
        isLate: true,
        submittedAt: true,
        reviewedAt: true,
        employee: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.overtimeRequest.findMany({
      where: { attendance: { date: { gte: from, lt: until } } },
      select: { status: true, approvedHours: true, hours: true },
    }),

    // Two columns and two counts — the comparison costs a fraction of the
    // report itself, and nothing at all on a long range.
    comparable
      ? prisma.attendance.findMany({
          where: { date: priorWindow },
          select: { timeIn: true, timeOut: true },
        })
      : [],
    comparable ? prisma.schedule.count({ where: { date: priorWindow } }) : 0,
    comparable
      ? prisma.attendanceReport.count({
          where: { attendance: { date: priorWindow } },
        })
      : 0,

    // Summed in the database, one row per client, rather than by reading every
    // line of every claim into memory to add them up here.
    prisma.reimbursementItemClient.groupBy({
      by: ["clientId"],
      where: {
        item: { reimbursement: { submittedAt: { gte: from, lt: until } } },
      },
      _sum: { amount: true },
    }),
  ])

  // ---- attendance, by day -------------------------------------------------

  const perDay = new Map<string, { hours: number; punches: number }>()
  for (let cursor = new Date(from); cursor <= to; cursor.setDate(cursor.getDate() + 1)) {
    perDay.set(dateKey(cursor), { hours: 0, punches: 0 })
  }

  let openPunches = 0
  let autoClosed = 0

  for (const punch of attendance) {
    const bucket = perDay.get(dateKey(punch.date))
    if (!bucket) continue

    bucket.punches++
    // An open punch has no length — counted as something to chase rather than
    // guessed at, the same way payroll refuses to invent hours for one.
    const minutes = workedMinutes(punch.timeIn, punch.timeOut)
    if (minutes === null) openPunches++
    else bucket.hours += wholeHours(minutes)
    if (punch.autoTimedOut) autoClosed++
  }

  const hoursByDay = [...perDay.entries()].map(([date, value]) => ({
    date,
    hours: value.hours,
    punches: value.punches,
  }))

  // ---- payroll, per cutoff ------------------------------------------------
  //
  // The only genuinely expensive part, so it is bounded twice: by the cutoffs
  // the range touches, and by a hard ceiling on how many of those are computed.

  const cutoffs: { start: Date; end: Date }[] = []
  for (
    let cursor = cutoffStart(from);
    cursor <= to && cutoffs.length < MAX_CUTOFFS;
    cursor = nextDay(cutoffEnd(cursor))
  ) {
    cutoffs.push({ start: cutoffStart(cursor), end: cutoffEnd(cursor) })
  }

  const payrollByCutoff: ReportData["payrollByCutoff"] = []
  let grossPay = 0
  let netPay = 0

  if (cutoffs.length > 0) {
    const earliest = new Date(cutoffs[0].start)
    earliest.setDate(earliest.getDate() - HOLIDAY_QUALIFYING_LOOKBACK_DAYS)
    const latest = nextDay(cutoffs[cutoffs.length - 1].end)

    // One read of everybody's attendance across every cutoff, bucketed in
    // memory — rather than the three-queries-per-employee-per-cutoff the
    // payslip reader would do if called in a loop.
    const employees = await prisma.employee.findMany({
      where: { OR: [{ account: null }, { account: { isActive: true } }] },
      select: {
        id: true,
        hourlyRate: true,
        attendance: {
          where: { date: { gte: earliest, lt: latest } },
          select: {
            date: true,
            timeIn: true,
            timeOut: true,
            overtime: {
              select: { status: true, hours: true, approvedHours: true },
            },
          },
        },
      },
    })

    for (const cutoff of cutoffs) {
      const totals = { basic: 0, overtime: 0, night: 0, holiday: 0, restDay: 0 }
      const holidaysInCutoff = holidaysBetween(cutoff.start, cutoff.end)

      for (const employee of employees) {
        const rows = employee.attendance.map((row) => ({
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
          days: rows.filter(
            (row) => row.date >= cutoff.start && row.date <= cutoff.end
          ),
          daysBeforeCutoff: rows.filter((row) => row.date < cutoff.start),
          holidaysInCutoff,
        })

        totals.basic += slip.basicPay
        totals.overtime += slip.overtimePay
        totals.night += slip.nightPay
        totals.holiday += slip.holidayPay
        totals.restDay += slip.restDayPay + slip.specialHolidayPay
        grossPay += slip.gross
        netPay += slip.net
      }

      payrollByCutoff.push({
        label: cutoffLabel(cutoff.start, cutoff.end),
        basic: Math.round(totals.basic),
        overtime: Math.round(totals.overtime),
        night: Math.round(totals.night),
        holiday: Math.round(totals.holiday),
        restDay: Math.round(totals.restDay),
      })
    }
  }

  // ---- schedules ----------------------------------------------------------

  const statusCounts = new Map<keyof typeof SCHEDULE_STATUS_LABELS, number>()
  const workTypeCounts = new Map<keyof typeof WORK_TYPE_LABELS, number>()
  const clientCounts = new Map<string, number>()

  for (const schedule of schedules) {
    statusCounts.set(schedule.status, (statusCounts.get(schedule.status) ?? 0) + 1)
    for (const type of schedule.workTypes) {
      workTypeCounts.set(type, (workTypeCounts.get(type) ?? 0) + 1)
    }
    const name = schedule.client.name
    clientCounts.set(name, (clientCounts.get(name) ?? 0) + 1)
  }

  const topClients = [...clientCounts.entries()]
    .map(([label, value]) => ({ key: label, label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, TOP_N)

  // ---- filed reports and claims -------------------------------------------

  const reportCounts = new Map<keyof typeof REPORT_TYPE_FOLDER, number>()
  for (const report of reportsFiled) {
    reportCounts.set(report.type, (reportCounts.get(report.type) ?? 0) + 1)
  }

  const CLAIM_LABELS = {
    PENDING_REVIEW: "Awaiting review",
    APPROVED: "Approved",
    REJECTED: "Rejected",
  } as const
  const claimCounts = new Map<keyof typeof CLAIM_LABELS, number>()
  const claimAmounts = new Map<keyof typeof CLAIM_LABELS, number>()
  const claimantTotals = new Map<string, number>()
  let claimsAmount = 0
  let lateCount = 0
  let largestClaim = 0
  let decided = 0
  let turnaroundTotal = 0

  for (const claim of claims) {
    const amount = Number(claim.totalAmount)
    claimCounts.set(claim.status, (claimCounts.get(claim.status) ?? 0) + 1)
    claimAmounts.set(claim.status, (claimAmounts.get(claim.status) ?? 0) + amount)
    claimsAmount += amount
    if (amount > largestClaim) largestClaim = amount
    if (claim.isLate) lateCount++

    const who = `${claim.employee.firstName} ${claim.employee.lastName}`.trim()
    claimantTotals.set(who, (claimantTotals.get(who) ?? 0) + amount)

    if (claim.reviewedAt) {
      decided++
      turnaroundTotal +=
        (+claim.reviewedAt - +claim.submittedAt) / 86_400_000
    }
  }

  // Fixed order — the decision, then the queue, then the refusal — so the shape
  // of the chart means the same thing from one period to the next.
  const CLAIM_ORDER = ["APPROVED", "PENDING_REVIEW", "REJECTED"] as const
  const claimsByStatus = CLAIM_ORDER.map((key) => ({
    key,
    label: CLAIM_LABELS[key],
    count: claimCounts.get(key) ?? 0,
    amount: Math.round(claimAmounts.get(key) ?? 0),
  }))

  const topClaimants = [...claimantTotals.entries()]
    .map(([label, value]) => ({ key: label, label, value: Math.round(value) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, TOP_N)

  // Only the leaders need naming, so the name lookup is bounded to those rows
  // rather than fetching a client record for every one that was ever charged.
  const topClaimClients = claimsByClient
    .map((row) => ({ clientId: row.clientId, value: Number(row._sum.amount ?? 0) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, TOP_N)
  const claimClientNames =
    topClaimClients.length > 0
      ? await prisma.client.findMany({
          where: { id: { in: topClaimClients.map((row) => row.clientId) } },
          select: { id: true, name: true, acronym: true },
        })
      : []
  const claimsByClientNamed = topClaimClients.map((row) => {
    const client = claimClientNames.find((entry) => entry.id === row.clientId)
    return {
      key: row.clientId,
      label: client?.acronym || client?.name || "Unknown client",
      value: Math.round(row.value),
    }
  })

  // ---- the rest -----------------------------------------------------------

  const overtimeHours = overtime
    .filter((request) => request.status === "APPROVED")
    .reduce(
      (total, request) =>
        total + Number(request.approvedHours ?? request.hours),
      0
    )

  const daysWorked = attendance.filter((punch) => punch.timeOut).length
  const hoursWorked = hoursByDay.reduce((total, day) => total + day.hours, 0)

  // ---- the window before --------------------------------------------------

  let compare: ReportData["compare"] = null
  if (comparable) {
    let priorHours = 0
    let priorDaysWorked = 0
    for (const punch of priorAttendance) {
      const minutes = workedMinutes(punch.timeIn, punch.timeOut)
      if (minutes === null) continue
      priorHours += wholeHours(minutes)
      priorDaysWorked++
    }
    compare = {
      label: rangeLabel(priorFrom, priorTo),
      daysWorked: priorDaysWorked,
      hoursWorked: priorHours,
      jobs: priorJobs,
      reportsFiled: priorReports,
    }
  }

  return {
    range: {
      from: from.toISOString(),
      to: to.toISOString(),
      label: rangeLabel(from, to),
      days,
    },
    headline: {
      staff,
      daysWorked,
      hoursWorked,
      overtimeHours,
      grossPay: Math.round(grossPay),
      netPay: Math.round(netPay),
      jobs: schedules.length,
      jobsCompleted: statusCounts.get("COMPLETED") ?? 0,
      reportsFiled: reportsFiled.length,
      claims: claims.length,
      claimsAmount: Math.round(claimsAmount),
    },
    compare,
    hoursByDay,
    payrollByCutoff,
    scheduleStatus: toSlices(statusCounts, SCHEDULE_STATUS_LABELS),
    workTypes: toSlices(workTypeCounts, WORK_TYPE_LABELS),
    topClients,
    reportTypes: toSlices(reportCounts, REPORT_TYPE_FOLDER),
    claims: {
      total: Math.round(claimsAmount),
      count: claims.length,
      byStatus: claimsByStatus,
      topClaimants,
      byClient: claimsByClientNamed,
      lateCount,
      turnaroundDays:
        decided > 0 ? Math.round((turnaroundTotal / decided) * 10) / 10 : null,
      largest: Math.round(largestClaim),
    },
    flags: {
      openPunches,
      autoClosed,
      unapprovedOvertime: overtime.filter((r) => r.status === "PENDING").length,
      pendingClaims: claimCounts.get("PENDING_REVIEW") ?? 0,
      cancelledJobs: statusCounts.get("CANCELLED") ?? 0,
    },
  }
}
