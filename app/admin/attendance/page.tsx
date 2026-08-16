import { after } from "next/server"
import type { Prisma } from "@/app/generated/prisma/client"
import { requireManager } from "@/lib/auth"
import { closeAbandonedPunches } from "@/lib/auto-timeout"
import { prisma } from "@/lib/prisma"
import {
  attendanceDay,
  dayParam,
  nextDay,
  parseDayParam,
  workedMinutes,
} from "@/lib/attendance"
import {
  ATTENDANCE_DETAIL_SELECT,
  toAttendanceRow,
} from "@/lib/attendance-query"
import { AdminAttendanceView } from "@/components/attendance/admin-attendance-view"
import {
  DAY_ROW_LIMIT,
  MAX_TIMESHEET_DAYS,
  TIMESHEET_ROW_LIMIT,
  type AdminAttendanceTab,
  type AttendancePaging,
  type AttendanceRow,
  type MissingRow,
  type OvertimeQueueRow,
  type TimesheetRow,
} from "@/components/attendance/admin-attendance"

// Anyone who could plausibly punch: everyone on the payroll except deactivated
// logins. Used both for "hasn't timed in" and as the roster the timesheet is
// read against.
const ON_PAYROLL: Prisma.EmployeeWhereInput = {
  OR: [{ account: null }, { account: { isActive: true } }],
}

function tabFrom(value: string | string[] | undefined): AdminAttendanceTab {
  const raw = Array.isArray(value) ? value[0] : value
  if (raw === "timesheet" || raw === "overtime") return raw
  return "day"
}

/**
 * The timesheet window, clamped. Both ends come from the URL so a period can be
 * linked and bookmarked, but an open-ended range would read every attendance row
 * the company has ever written — hence the ceiling, applied by moving the start
 * forward rather than refusing to render.
 */
function timesheetWindow(
  fromRaw: string | string[] | undefined,
  toRaw: string | string[] | undefined,
  today: Date
) {
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const to = parseDayParam(toRaw, today)
  const from = parseDayParam(fromRaw, monthStart)

  // Backwards ranges are a slip, not an error worth a page for.
  const start = from > to ? to : from

  const span = Math.round((+to - +start) / 86_400_000) + 1
  if (span <= MAX_TIMESHEET_DAYS) return { from: start, to }

  const capped = new Date(to)
  capped.setDate(capped.getDate() - (MAX_TIMESHEET_DAYS - 1))
  return { from: attendanceDay(capped), to }
}

export default async function AdminAttendancePage({
  searchParams,
}: PageProps<"/admin/attendance">) {
  await requireManager()

  // Punches nobody closed get settled after this response goes out, not before
  // it — the office should not wait on a sweep to see the day log, and the
  // stamp it writes is the scheduled shift end either way, so running a moment
  // late changes nothing about the row. The next load shows the result.
  after(closeAbandonedPunches)

  const params = await searchParams
  const today = attendanceDay(new Date())

  const tab = tabFrom(params.tab)
  const date = parseDayParam(params.date, today)
  const window = timesheetWindow(params.from, params.to, today)

  const paging: AttendancePaging = {
    tab,
    date: dayParam(date),
    from: dayParam(window.from),
    to: dayParam(window.to),
    today: dayParam(today),
  }

  // Every tab shows the pending count on its strip, so it's the one query that
  // always runs. It's a count, not the rows.
  const pendingOvertime = await prisma.overtimeRequest.count({
    where: { status: "PENDING" },
  })

  // ------------------------------------------------------------------
  // Only the open tab is fetched. A day carries selfie keys and
  // coordinates, the timesheet carries a month of spans, the queue carries
  // reasons — loading all three to show one is three times the payload for
  // nothing.
  // ------------------------------------------------------------------

  let rows: AttendanceRow[] = []
  let missing: MissingRow[] = []
  let timesheet: TimesheetRow[] = []
  let overtimeQueue: OvertimeQueueRow[] = []

  if (tab === "day") {
    const [punchRecords, missingRecords] = await Promise.all([
      prisma.attendance.findMany({
        where: { date: { gte: date, lt: nextDay(date) } },
        select: ATTENDANCE_DETAIL_SELECT,
        orderBy: { timeIn: "asc" },
        take: DAY_ROW_LIMIT,
      }),
      // Asked of the database rather than by subtracting two lists in the
      // browser — the roster never has to cross the wire.
      prisma.employee.findMany({
        where: {
          ...ON_PAYROLL,
          attendance: { none: { date: { gte: date, lt: nextDay(date) } } },
        },
        select: { id: true, firstName: true, lastName: true, employeeNo: true },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
        take: DAY_ROW_LIMIT,
      }),
    ])

    rows = punchRecords.map(toAttendanceRow)

    missing = missingRecords.map((employee) => ({
      id: employee.id,
      name: `${employee.firstName} ${employee.lastName}`,
      employeeNo: employee.employeeNo,
    }))
  }

  if (tab === "timesheet") {
    // Spans only. Names come separately so a person's name isn't repeated once
    // per day worked, and nothing but the totals reaches the browser.
    const spans = await prisma.attendance.findMany({
      where: { date: { gte: window.from, lt: nextDay(window.to) } },
      select: {
        employeeId: true,
        timeIn: true,
        timeOut: true,
        overtime: { select: { hours: true, approvedHours: true, status: true } },
      },
      take: TIMESHEET_ROW_LIMIT,
    })

    const totals = new Map<
      string,
      { days: number; openDays: number; minutes: number; overtimeHours: number }
    >()

    for (const span of spans) {
      const entry = totals.get(span.employeeId) ?? {
        days: 0,
        openDays: 0,
        minutes: 0,
        overtimeHours: 0,
      }
      entry.days += 1

      const minutes = workedMinutes(span.timeIn, span.timeOut)
      if (minutes == null) entry.openDays += 1
      else entry.minutes += minutes

      // Only approved hours, and only as many as were actually granted — an
      // administrator can approve three of the five that were asked for. A
      // pending request isn't owed to anyone yet, and totalling it is how one
      // gets paid by accident.
      if (span.overtime?.status === "APPROVED") {
        entry.overtimeHours += Number(
          span.overtime.approvedHours ?? span.overtime.hours
        )
      }

      totals.set(span.employeeId, entry)
    }

    const people = await prisma.employee.findMany({
      where: { id: { in: [...totals.keys()] } },
      select: { id: true, firstName: true, lastName: true, employeeNo: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    })

    timesheet = people.map((person) => {
      const entry = totals.get(person.id)!
      return {
        employeeId: person.id,
        employeeName: `${person.firstName} ${person.lastName}`,
        employeeNo: person.employeeNo,
        days: entry.days,
        openDays: entry.openDays,
        minutes: entry.minutes,
        overtimeHours: Math.round(entry.overtimeHours * 100) / 100,
      }
    })
  }

  if (tab === "overtime") {
    const requests = await prisma.overtimeRequest.findMany({
      where: { status: "PENDING" },
      select: {
        id: true,
        hours: true,
        reason: true,
        requestedAt: true,
        shiftEndsAt: true,
        employee: {
          select: { firstName: true, lastName: true, employeeNo: true },
        },
        attendance: { select: { date: true, timeIn: true, timeOut: true } },
      },
      orderBy: { requestedAt: "asc" },
      take: DAY_ROW_LIMIT,
    })

    overtimeQueue = requests.map((request) => ({
      id: request.id,
      employeeName: `${request.employee.firstName} ${request.employee.lastName}`,
      employeeNo: request.employee.employeeNo,
      date: request.attendance.date.toISOString(),
      hours: Number(request.hours),
      reason: request.reason,
      requestedAt: request.requestedAt.toISOString(),
      shiftEndsAt: request.shiftEndsAt.toISOString(),
      timeIn: request.attendance.timeIn.toISOString(),
      timeOut: request.attendance.timeOut?.toISOString() ?? null,
    }))
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold">Attendance</h2>
        <p className="text-sm text-muted-foreground">
          Who timed in, who timed out, and how long each of them was on the
          clock. Hours come from the punches themselves — nothing here is
          measured against the schedule.
        </p>
      </div>

      <AdminAttendanceView
        rows={rows}
        missing={missing}
        timesheet={timesheet}
        overtimeQueue={overtimeQueue}
        pendingOvertime={pendingOvertime}
        paging={paging}
      />
    </div>
  )
}
