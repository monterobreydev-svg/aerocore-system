import { prisma } from "@/lib/prisma"
import { getCurrentEmployee } from "@/lib/dal"
import { isR2Configured } from "@/lib/r2"
import { attendanceDay } from "@/lib/attendance"
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
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const from = new Date(today)
  from.setDate(from.getDate() - HISTORY_DAYS)

  const [scheduleRecords, todayRecord, historyRecords] = await Promise.all([
    // Today's assigned work. Attendance is recorded against it, so no schedule
    // means no punch — the office assigns the day before it can be worked.
    prisma.schedule.findMany({
      where: {
        assignments: { some: { employeeId: employee.id } },
        date: { gte: today, lt: tomorrow },
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
    prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId: employee.id, date: today } },
      select: {
        timeIn: true,
        timeOut: true,
        reportKey: true,
        reportNote: true,
        overtime: { select: { hours: true, status: true } },
      },
    }),
    prisma.attendance.findMany({
      where: { employeeId: employee.id, date: { gte: from, lt: today } },
      select: {
        id: true,
        date: true,
        timeIn: true,
        timeOut: true,
        reportKey: true,
        overtime: { select: { hours: true, status: true } },
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
        hasReport: Boolean(todayRecord.reportKey || todayRecord.reportNote),
        overtime: todayRecord.overtime
          ? {
              hours: Number(todayRecord.overtime.hours),
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
    hasReport: Boolean(record.reportKey),
    overtimeHours: record.overtime ? Number(record.overtime.hours) : null,
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

      <AttendanceView shift={shift} punch={punch} history={history} />
    </div>
  )
}
