import { CalendarDays, MapPin, Phone, StickyNote, Users } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { getCurrentEmployee } from "@/lib/dal"
import {
  WORK_TYPE_CHIP,
  WORK_TYPE_LABELS,
  SCHEDULE_STATUS_CHIP,
  SCHEDULE_STATUS_LABELS,
  formatScheduleDate,
  formatTimeRange,
} from "@/lib/schedule"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export default async function EmployeeSchedulePage() {
  const employee = await getCurrentEmployee()

  const scheduleRecords = await prisma.schedule.findMany({
    where: { assignments: { some: { employeeId: employee.id } } },
    include: {
      client: { select: { name: true } },
      branch: { select: { name: true } },
      assignments: {
        include: { employee: { select: { id: true, firstName: true, lastName: true } } },
      },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  })

  const todayKey = new Date().toDateString()
  const upcoming = scheduleRecords.filter(
    (schedule) => schedule.date.toDateString() >= todayKey
  )
  const past = scheduleRecords
    .filter((schedule) => schedule.date.toDateString() < todayKey)
    .reverse()

  function renderSchedule(schedule: (typeof scheduleRecords)[number]) {
    const teammates = schedule.assignments
      .filter((a) => a.employee.id !== employee.id)
      .map((a) => `${a.employee.firstName} ${a.employee.lastName}`)

    return (
      <Card key={schedule.id} className="shadow-sm">
        <CardContent className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <CalendarDays className="size-4 text-muted-foreground" />
              {formatScheduleDate(schedule.date.toISOString())} ·{" "}
              {formatTimeRange(
                schedule.startTime.toISOString(),
                schedule.endTime.toISOString()
              )}
            </div>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                SCHEDULE_STATUS_CHIP[schedule.status]
              )}
            >
              {SCHEDULE_STATUS_LABELS[schedule.status]}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" />
            {schedule.client.name}
            {schedule.branch ? ` · ${schedule.branch.name}` : ""}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {schedule.workTypes.map((workType) => (
              <span
                key={workType}
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                  WORK_TYPE_CHIP[workType]
                )}
              >
                {WORK_TYPE_LABELS[workType]}
              </span>
            ))}
            {teammates.length > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="size-3.5" />
                with {teammates.join(", ")}
              </span>
            )}
          </div>

          {(schedule.contactPerson || schedule.contactNumber) && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Phone className="size-3.5 shrink-0" />
              {schedule.contactPerson}
              {schedule.contactPerson && schedule.contactNumber ? " · " : ""}
              {schedule.contactNumber}
            </div>
          )}

          {/* Remarks are written for whoever turns up on site, so they belong
              here rather than only on the admin side. */}
          {schedule.remarks && (
            <div className="flex items-start gap-1.5 rounded-lg bg-muted/50 px-2.5 py-2 text-xs">
              <StickyNote className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <span className="whitespace-pre-wrap">{schedule.remarks}</span>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">My Schedule</h2>
        <p className="text-sm text-muted-foreground">
          Jobs you&apos;ve been assigned to.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-muted-foreground">Upcoming</h3>
        {upcoming.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No upcoming jobs assigned yet.
          </p>
        ) : (
          <div className="flex flex-col gap-2">{upcoming.map(renderSchedule)}</div>
        )}
      </div>

      {past.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-medium text-muted-foreground">Past</h3>
          <div className="flex flex-col gap-2">{past.map(renderSchedule)}</div>
        </div>
      )}
    </div>
  )
}
