import "server-only"

import type {
  AttendanceReportType,
  Prisma,
  Role,
  ScheduleStatus,
  WorkType,
} from "@/app/generated/prisma/client"
import { prisma } from "@/lib/db/prisma"
import {
  attendanceDay,
  cutoffEnd,
  cutoffLabel,
  cutoffStart,
  dayParam,
  nextDay,
  workedMinutes,
} from "@/lib/attendance"
import { isRestDay } from "@/lib/employee"
import {
  computePayslip,
  holidaysBetween,
  HOLIDAY_QUALIFYING_LOOKBACK_DAYS,
} from "@/lib/payroll"

// ---------------------------------------------------------------------------
// The overview
// ---------------------------------------------------------------------------
//
// One read of the day for the admin front page. Everything here is derived on
// the server and sent as figures — the page renders a floor of twenty people,
// a diary of jobs and two weeks of payroll, and none of the rows those are
// counted from cross the wire.
//
// The rule this module is written to: nothing on this page grows with two
// things at once. The roster grows with headcount, the diary is capped, the
// queues send their top few and their count. A company that doubles in size
// doubles one list here, not the square of it.

/**
 * Who is on the payroll: everyone employed except a deactivated login.
 *
 * The same definition the payroll run and the attendance day log use. If one
 * of the three ever changes, the others have to follow — an "absent" count
 * measured against a different roster than payroll runs against is a number
 * somebody will act on and be wrong about.
 */
const ON_PAYROLL: Prisma.EmployeeWhereInput = {
  OR: [{ account: null }, { account: { isActive: true } }],
}

/** Jobs listed in the diary before it says "and N more". */
const DIARY_LIMIT = 7

/** Days of the week ahead the strip counts. */
const LOOKAHEAD_DAYS = 7

/** Rows shown from a queue. The count beside them is the whole queue. */
const QUEUE_PREVIEW = 3

/** Minutes past a job's start before arriving counts as late. */
const LATE_GRACE_MINUTES = 10

// ---------------------------------------------------------------------------

export type FloorState = "on-site" | "done" | "away"

export type FloorRow = {
  employeeId: string
  name: string
  /** Minutes from midnight. Null for somebody who never punched. */
  startedAt: number | null
  /** Null while the punch is open — that is what draws the bar as running. */
  endedAt: number | null
  minutes: number
  state: FloorState
  /** Arrived after the first job they were assigned was due to start. */
  late: boolean
  /** Closed by the sweep rather than by the person. Worth a second look. */
  autoClosed: boolean
  jobs: number
}

export type DiaryJob = {
  id: string
  startsAt: number
  endsAt: number
  clientName: string
  branchName: string | null
  workTypes: WorkType[]
  status: ScheduleStatus
  crew: string[]
  /** Crew beyond the two named, so the row stays one line on a phone. */
  crewOverflow: number
}

export type QueueClaim = {
  id: string
  referenceNo: string
  employeeName: string
  amount: number
  waitingDays: number
  late: boolean
}

export type FiledReport = {
  id: string
  type: AttendanceReportType
  clientName: string
  serialNo: string
  filedAt: string
}

export type Overview = {
  /** Local midnight, as a day parameter — every link out carries it. */
  today: string
  restDay: boolean

  floor: {
    headcount: number
    onSite: number
    done: number
    away: number
    late: number
    /** Everyone who punched today, ordered by how the strip should read. */
    rows: FloorRow[]
    /** On the payroll, no punch, and not a rest day. Names, capped. */
    awayNames: string[]
    /** Hours on the clock so far today, across everybody. */
    hoursToday: number
    /**
     * Minutes past midnight at the moment the page was built.
     *
     * Sent rather than read in the component so the strip, the "now" line and
     * the length of every open bar all agree — three calls to `new Date()`
     * while a page renders is three slightly different nows.
     */
    nowMinute: number
  }

  diary: {
    total: number
    shown: DiaryJob[]
    /** Jobs still pending at the end of the day — the ones nobody closed. */
    unclosed: number
    /** One entry per day ahead, starting tomorrow. */
    ahead: { day: string; weekday: string; date: number; jobs: number }[]
  }

  /** Null for a role that may not see pay. */
  payroll: {
    label: string
    day: string
    dayOfCutoff: number
    daysInCutoff: number
    released: boolean
    gross: number
    net: number
    deductions: number
    headcount: number
    /** What the gross is made of, for the composition bar. */
    parts: { label: string; amount: number }[]
    /** Punches inside the cutoff still open — they pay nothing until closed. */
    openDays: number
  } | null

  /** Null for a role that may not see money. */
  claims: {
    waiting: number
    amount: number
    oldestDays: number | null
    rows: QueueClaim[]
  } | null

  overtime: { waiting: number }

  documents: {
    today: number
    week: number
    rows: FiledReport[]
  }
}

/** Minutes from local midnight of the day being read. */
function minuteOfDay(at: Date, day: Date) {
  return Math.round((+at - +day) / 60_000)
}

export async function getOverview(role: Role): Promise<Overview> {
  // Pay is Director and Administrator business. An Engineer reaches the admin
  // shell for the operational half of it and no further, so the figures are
  // not fetched rather than fetched and hidden.
  const seesMoney = role === "DIRECTOR" || role === "ADMINISTRATOR"

  // One `now` for the whole read. Called twice, the "still on the clock"
  // figure and the line marking this minute would disagree by however long
  // Postgres took in between.
  const now = new Date()
  const today = attendanceDay(now)
  const tomorrow = nextDay(today)
  const start = cutoffStart(today)
  const end = cutoffEnd(today)

  const aheadUntil = new Date(tomorrow)
  aheadUntil.setDate(aheadUntil.getDate() + LOOKAHEAD_DAYS)

  const weekAgo = new Date(today)
  weekAgo.setDate(weekAgo.getDate() - 7)

  // A holiday on the opening day of a cutoff is qualified by attendance in the
  // one before it, so the payroll read reaches back that far. An engineer's
  // read is one day wide: they are not being shown pay, so there is no reason
  // to pull a fortnight of punches to render a strip of today.
  const qualifyingFrom = new Date(start)
  qualifyingFrom.setDate(
    qualifyingFrom.getDate() - HOLIDAY_QUALIFYING_LOOKBACK_DAYS
  )
  const attendanceFrom = seesMoney ? qualifyingFrom : today

  const [employees, adjustments, release, todaysJobs, ahead, claims, overtime, filed] =
    await Promise.all([
      prisma.employee.findMany({
        where: ON_PAYROLL,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          hourlyRate: true,
          attendance: {
            where: { date: { gte: attendanceFrom, lt: tomorrow } },
            select: {
              date: true,
              timeIn: true,
              timeOut: true,
              autoTimedOut: true,
              overtime: {
                select: { hours: true, approvedHours: true, status: true },
              },
            },
          },
        },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      }),

      seesMoney
        ? prisma.payrollAdjustment.findMany({
            where: { cutoffStart: start },
            select: { employeeId: true, label: true, amount: true },
          })
        : [],

      seesMoney
        ? prisma.payrollRelease.findUnique({
            where: { cutoffStart: start },
            select: { releasedAt: true },
          })
        : null,

      // The day's diary. Read whole rather than capped: the counts under it —
      // how many are still open, who is late — are of the whole day, and a
      // company's day is tens of jobs, not thousands.
      prisma.schedule.findMany({
        where: { date: { gte: today, lt: tomorrow } },
        select: {
          id: true,
          startTime: true,
          endTime: true,
          status: true,
          workTypes: true,
          client: { select: { name: true } },
          branch: { select: { name: true } },
          assignments: {
            select: {
              employeeId: true,
              employee: { select: { firstName: true, lastName: true } },
            },
          },
        },
        orderBy: { startTime: "asc" },
      }),

      // The week ahead as counts, not as jobs. Seven numbers instead of a
      // fortnight of rows nobody opens from here.
      prisma.schedule.groupBy({
        by: ["date"],
        where: { date: { gte: tomorrow, lt: aheadUntil } },
        _count: { _all: true },
      }),

      seesMoney
        ? prisma.reimbursement.findMany({
            where: { status: "PENDING_REVIEW" },
            select: {
              id: true,
              referenceNo: true,
              totalAmount: true,
              submittedAt: true,
              isLate: true,
              employee: { select: { firstName: true, lastName: true } },
            },
            orderBy: { submittedAt: "asc" },
          })
        : [],

      prisma.overtimeRequest.count({ where: { status: "PENDING" } }),

      prisma.attendanceReport.findMany({
        where: { createdAt: { gte: weekAgo } },
        select: {
          id: true,
          type: true,
          serialNo: true,
          createdAt: true,
          client: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ])

  // ---- the floor ---------------------------------------------------------

  // When each person was first due somewhere today, and how many jobs they
  // carry. Built from the diary that was already read rather than asked for
  // again.
  const dueAt = new Map<string, number>()
  const jobCount = new Map<string, number>()
  for (const job of todaysJobs) {
    for (const assignment of job.assignments) {
      const at = minuteOfDay(job.startTime, today)
      const known = dueAt.get(assignment.employeeId)
      if (known === undefined || at < known) dueAt.set(assignment.employeeId, at)
      jobCount.set(
        assignment.employeeId,
        (jobCount.get(assignment.employeeId) ?? 0) + 1
      )
    }
  }

  const rows: FloorRow[] = []
  const awayNames: string[] = []
  let hoursToday = 0

  for (const employee of employees) {
    const name = `${employee.firstName} ${employee.lastName}`
    const punch = employee.attendance.find((row) => +row.date === +today)

    if (!punch) {
      awayNames.push(name)
      continue
    }

    // A punch still open has no length yet — `workedMinutes` says null, which
    // is right for payroll and useless for a strip. Here it is measured to
    // this minute, because "four hours in" is the whole point of the row.
    const minutes =
      workedMinutes(punch.timeIn, punch.timeOut) ??
      Math.max(0, Math.round((+now - +punch.timeIn) / 60_000))
    hoursToday += minutes / 60

    const due = dueAt.get(employee.id)
    const startedAt = minuteOfDay(punch.timeIn, today)

    rows.push({
      employeeId: employee.id,
      name,
      startedAt,
      // A punch that runs past midnight is still today's punch; the bar is
      // clamped at the end of the strip rather than wrapping to the left.
      endedAt: punch.timeOut ? minuteOfDay(punch.timeOut, today) : null,
      minutes,
      state: punch.timeOut ? "done" : "on-site",
      late: due !== undefined && startedAt > due + LATE_GRACE_MINUTES,
      autoClosed: punch.autoTimedOut,
      jobs: jobCount.get(employee.id) ?? 0,
    })
  }

  // Still working first, then finished, each by when they started. The strip
  // reads as a day filling up and emptying out.
  const ORDER: Record<FloorState, number> = { "on-site": 0, done: 1, away: 2 }
  rows.sort(
    (a, b) =>
      ORDER[a.state] - ORDER[b.state] || (a.startedAt ?? 0) - (b.startedAt ?? 0)
  )

  const onSite = rows.filter((row) => row.state === "on-site").length

  // ---- payroll -----------------------------------------------------------

  let payroll: Overview["payroll"] = null

  if (seesMoney) {
    const holidays = holidaysBetween(start, end)
    const byEmployee = new Map<string, { label: string; amount: number }[]>()
    for (const row of adjustments) {
      const list = byEmployee.get(row.employeeId) ?? []
      list.push({ label: row.label, amount: Number(row.amount) })
      byEmployee.set(row.employeeId, list)
    }

    const total = {
      gross: 0,
      net: 0,
      deductions: 0,
      basic: 0,
      overtime: 0,
      night: 0,
      restDay: 0,
      holiday: 0,
      openDays: 0,
      paid: 0,
    }

    for (const employee of employees) {
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
        adjustments: byEmployee.get(employee.id) ?? [],
      })

      total.gross += slip.gross
      total.net += slip.net
      total.deductions += slip.deductions.total
      total.basic += slip.basicPay
      total.overtime += slip.overtimePay
      total.night += slip.nightPay
      total.restDay += slip.restDayPay
      total.holiday += slip.holidayPay
      total.openDays += slip.days.filter(
        (day) => day.renderedMinutes === 0
      ).length
      if (slip.gross > 0) total.paid++
    }

    const daysInCutoff =
      Math.round((+end - +start) / 86_400_000) + 1

    payroll = {
      label: cutoffLabel(start, end),
      day: dayParam(today),
      dayOfCutoff: Math.round((+today - +start) / 86_400_000) + 1,
      daysInCutoff,
      released: release !== null,
      gross: Math.round(total.gross),
      net: Math.round(total.net),
      deductions: Math.round(total.deductions),
      headcount: total.paid,
      // Ordered biggest first by construction, not by sorting: basic pay is
      // always the bulk of a payroll, and a bar whose segments reorder from
      // one cutoff to the next cannot be compared with the last one.
      parts: [
        { label: "Basic", amount: Math.round(total.basic) },
        { label: "Overtime", amount: Math.round(total.overtime) },
        { label: "Night", amount: Math.round(total.night) },
        { label: "Rest day", amount: Math.round(total.restDay) },
        { label: "Holiday", amount: Math.round(total.holiday) },
      ].filter((part) => part.amount > 0),
      openDays: total.openDays,
    }
  }

  // ---- the queues --------------------------------------------------------

  const daysWaiting = (since: Date) =>
    Math.floor((+today - +attendanceDay(since)) / 86_400_000)

  const queue: Overview["claims"] = seesMoney
    ? {
        waiting: claims.length,
        amount: claims.reduce((sum, row) => sum + Number(row.totalAmount), 0),
        oldestDays: claims.length > 0 ? daysWaiting(claims[0].submittedAt) : null,
        rows: claims.slice(0, QUEUE_PREVIEW).map((row) => ({
          id: row.id,
          referenceNo: row.referenceNo,
          employeeName: `${row.employee.firstName} ${row.employee.lastName}`,
          amount: Number(row.totalAmount),
          waitingDays: daysWaiting(row.submittedAt),
          late: row.isLate,
        })),
      }
    : null

  // ---- the diary ---------------------------------------------------------

  const aheadCounts = new Map(
    ahead.map((row) => [+attendanceDay(row.date), row._count._all])
  )

  return {
    today: dayParam(today),
    restDay: isRestDay(today),

    floor: {
      headcount: employees.length,
      onSite,
      done: rows.length - onSite,
      away: awayNames.length,
      late: rows.filter((row) => row.late).length,
      rows,
      awayNames,
      hoursToday: Math.round(hoursToday),
      nowMinute: minuteOfDay(now, today),
    },

    diary: {
      total: todaysJobs.length,
      shown: todaysJobs.slice(0, DIARY_LIMIT).map((job) => ({
        id: job.id,
        startsAt: minuteOfDay(job.startTime, today),
        endsAt: minuteOfDay(job.endTime, today),
        clientName: job.client.name,
        branchName: job.branch?.name ?? null,
        workTypes: job.workTypes,
        status: job.status,
        crew: job.assignments
          .slice(0, 2)
          .map(
            (row) => `${row.employee.firstName} ${row.employee.lastName[0]}.`
          ),
        crewOverflow: Math.max(0, job.assignments.length - 2),
      })),
      unclosed: todaysJobs.filter((job) => job.status === "PENDING").length,
      ahead: Array.from({ length: LOOKAHEAD_DAYS }, (_, offset) => {
        const day = new Date(tomorrow)
        day.setDate(day.getDate() + offset)
        return {
          day: dayParam(day),
          weekday: day.toLocaleDateString(undefined, { weekday: "narrow" }),
          date: day.getDate(),
          jobs: aheadCounts.get(+day) ?? 0,
        }
      }),
    },

    payroll,
    claims: queue,
    overtime: { waiting: overtime },

    documents: {
      today: filed.filter((row) => row.createdAt >= today).length,
      week: filed.length,
      rows: filed.slice(0, QUEUE_PREVIEW).map((row) => ({
        id: row.id,
        type: row.type,
        clientName: row.client.name,
        serialNo: row.serialNo,
        filedAt: row.createdAt.toISOString(),
      })),
    },
  }
}
