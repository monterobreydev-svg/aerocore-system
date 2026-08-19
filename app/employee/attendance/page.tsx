import { prisma } from "@/lib/db/prisma"
import { getCurrentEmployee } from "@/lib/db/dal"
import { isR2Configured } from "@/lib/storage/r2"
import {
  attendanceDay,
  canPunchWithoutSchedule,
  grantedHours,
  MAX_SHIFT_HOURS,
  nextDay,
} from "@/lib/attendance"
import {
  AttendanceView,
  type AttendanceDay as HistoryRow,
  type TodayPunch,
  type TodayShift,
} from "@/components/attendance/attendance-view"

// A fortnight is what someone checks back over — "did I forget to time out on
// Tuesday". Anything older is the office's payroll question, not theirs.
const HISTORY_DAYS = 14

export default async function EmployeeAttendancePage() {
  const employee = await getCurrentEmployee()

  const now = new Date()
  const today = attendanceDay(now)
  const from = new Date(today)
  from.setDate(from.getDate() - HISTORY_DAYS)

  // The shift someone is currently inside, wherever it began. A 22:00 start is
  // filed under yesterday, so at 02:00 this is the row that matters — and
  // asking only for today's would show a Time in button to somebody who has
  // been on site all night.
  const openRecord = await prisma.attendance.findFirst({
    where: {
      employeeId: employee.id,
      timeOut: null,
      timeIn: { gte: new Date(now.getTime() - MAX_SHIFT_HOURS * 3_600_000) },
    },
    orderBy: { timeIn: "desc" },
    select: {
      id: true,
      date: true,
      timeIn: true,
      timeOut: true,
      reportNote: true,
      _count: { select: { reports: true } },
      overtime: { select: { hours: true, approvedHours: true, status: true } },
    },
  })

  // Whichever day the live punch belongs to is the day whose schedule bounds
  // it — that's what the overtime window is measured against.
  const shiftDay = openRecord?.date ?? today
  const shiftEnd = nextDay(shiftDay)

  const [scheduleRecords, todayRecord, historyRecords] = await Promise.all([
    // The assigned work. Attendance is recorded against it, so for a field
    // employee no schedule means no punch — the office assigns the day before
    // it can be worked. Admin-side staff are the exception; see
    // canPunchWithoutSchedule.
    prisma.schedule.findMany({
      where: {
        assignments: { some: { employeeId: employee.id } },
        date: { gte: shiftDay, lt: shiftEnd },
        status: { not: "CANCELLED" },
      },
      select: {
        startTime: true,
        endTime: true,
        client: { select: { name: true } },
        branch: { select: { name: true } },
      },
      orderBy: { startTime: "asc" },
    }),
    openRecord
      ? Promise.resolve(openRecord)
      : prisma.attendance.findUnique({
          where: { employeeId_date: { employeeId: employee.id, date: today } },
          select: {
            id: true,
            date: true,
            timeIn: true,
            timeOut: true,
            reportNote: true,
            _count: { select: { reports: true } },
            overtime: { select: { hours: true, approvedHours: true, status: true } },
          },
        }),
    prisma.attendance.findMany({
      where: {
        employeeId: employee.id,
        date: { gte: from, lt: today },
        // An overnight punch is the *current* shift, not history — it would
        // otherwise appear twice, once as each.
        ...(openRecord ? { id: { not: openRecord.id } } : {}),
      },
      select: {
        id: true,
        date: true,
        timeIn: true,
        timeOut: true,
        // A count, not the rows — the history list only shows that reports
        // exist, and a fortnight of them would be the bulk of this payload.
        _count: { select: { reports: true } },
        overtime: { select: { hours: true, approvedHours: true, status: true } },
      },
      orderBy: { date: "desc" },
    }),
  ])

  const shift: TodayShift | null =
    scheduleRecords.length === 0
      ? null
      : {
          startsAt: scheduleRecords
            .reduce(
              (earliest, s) => (s.startTime < earliest ? s.startTime : earliest),
              scheduleRecords[0].startTime
            )
            .toISOString(),
          endsAt: scheduleRecords
            .reduce(
              (latest, s) => (s.endTime > latest ? s.endTime : latest),
              scheduleRecords[0].endTime
            )
            .toISOString(),
          jobs: scheduleRecords.map((s) => ({
            clientName: s.client.name,
            branchName: s.branch?.name ?? null,
            startTime: s.startTime.toISOString(),
            endTime: s.endTime.toISOString(),
          })),
        }

  const punch: TodayPunch | null = todayRecord
    ? {
        timeIn: todayRecord.timeIn.toISOString(),
        timeOut: todayRecord.timeOut?.toISOString() ?? null,
        reportCount: todayRecord._count.reports,
        hasNote: Boolean(todayRecord.reportNote),
        // Both figures: what was asked for, and what came back. The card needs
        // the pair to say "1h of the 4h you asked for" rather than quietly
        // showing one number and letting the reader assume it's the other.
        overtime: todayRecord.overtime
          ? {
              hours: Number(todayRecord.overtime.hours),
              approvedHours:
                todayRecord.overtime.approvedHours == null
                  ? null
                  : Number(todayRecord.overtime.approvedHours),
              status: todayRecord.overtime.status,
            }
          : null,
      }
    : null

  const history: HistoryRow[] = historyRecords.map((record) => ({
    id: record.id,
    date: record.date.toISOString(),
    timeIn: record.timeIn.toISOString(),
    timeOut: record.timeOut?.toISOString() ?? null,
    reportCount: record._count.reports,
    // The badge on a past day shows the hours that stand, not the hours that
    // were asked for — an approved day reduced from 4h to 1h reads "+1h".
    overtimeHours: record.overtime
      ? grantedHours({
          hours: Number(record.overtime.hours),
          approvedHours:
            record.overtime.approvedHours == null
              ? null
              : Number(record.overtime.approvedHours),
        })
      : null,
    overtimeStatus: record.overtime?.status ?? null,
  }))

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold">Attendance</h2>
        <p className="text-sm text-muted-foreground">
          Time in and out with a photo and your location, and ask for overtime
          when a job overruns.
        </p>
      </div>

      {!isR2Configured() && (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-400">
          File storage isn&apos;t configured, so photos can&apos;t be saved and
          timing in won&apos;t work. Ask IT to set the R2 keys.
        </p>
      )}

      <AttendanceView
        shift={shift}
        punch={punch}
        history={history}
        scheduleOptional={canPunchWithoutSchedule(employee.role)}
      />
    </div>
  )
}
