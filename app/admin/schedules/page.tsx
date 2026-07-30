import { CalendarClock, CheckCircle2, Clock, Undo2, UserX } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { isSameDay, type EmployeeBusyBlock } from "@/lib/schedule"
import { SchedulesView } from "@/components/admin/schedules-view"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type {
  ClientOption,
  EmployeeOption,
  ScheduleRecord,
} from "@/components/admin/schedule-types"

export default async function SchedulesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string | string[] }>
}) {
  // ?date=YYYY-MM-DD is how a notification points at the day it's about.
  const dateParam = (await searchParams).date
  const focusDate = Array.isArray(dateParam) ? dateParam[0] : dateParam

  const [scheduleRecords, clientRecords, employeeRecords] = await Promise.all([
    prisma.schedule.findMany({
      include: {
        client: { select: { id: true, name: true, address: true } },
        branch: { select: { id: true, name: true, address: true } },
        createdBy: {
          include: {
            employee: { select: { firstName: true, lastName: true } },
          },
        },
        assignments: {
          include: {
            employee: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
    // Name and address only. Branches are fetched per client when one is
    // picked (listBranches) rather than shipping every branch of every client.
    prisma.client.findMany({
      select: { id: true, name: true, address: true },
      orderBy: { name: "asc" },
    }),
    prisma.employee.findMany({
      where: { OR: [{ account: null }, { account: { isActive: true } }] },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        position: true,
        skills: true,
      },
      orderBy: { firstName: "asc" },
    }),
  ])

  const schedules: ScheduleRecord[] = scheduleRecords.map((schedule) => ({
    id: schedule.id,
    date: schedule.date.toISOString(),
    startTime: schedule.startTime.toISOString(),
    endTime: schedule.endTime.toISOString(),
    workTypes: schedule.workTypes,
    status: schedule.status,
    contactPerson: schedule.contactPerson,
    contactNumber: schedule.contactNumber,
    remarks: schedule.remarks,
    createdAt: schedule.createdAt.toISOString(),
    createdByName: schedule.createdBy
      ? `${schedule.createdBy.employee.firstName} ${schedule.createdBy.employee.lastName}`
      : null,
    client: schedule.client,
    branch: schedule.branch,
    assignments: schedule.assignments.map((assignment) => ({
      id: assignment.id,
      employeeId: assignment.employeeId,
      employeeName: `${assignment.employee.firstName} ${assignment.employee.lastName}`,
    })),
  }))

  // One entry per (employee, job) so the assignment picker can flag a clash
  // as the time is typed. Cancelled jobs are left out — they don't hold
  // anyone's time, which is the same rule the server enforces on submit.
  const busy: EmployeeBusyBlock[] = scheduleRecords
    .filter((schedule) => schedule.status !== "CANCELLED")
    .flatMap((schedule) =>
      schedule.assignments.map((assignment) => ({
        employeeId: assignment.employeeId,
        scheduleId: schedule.id,
        start: schedule.startTime.toISOString(),
        end: schedule.endTime.toISOString(),
        label: schedule.branch
          ? `${schedule.client.name} · ${schedule.branch.name}`
          : schedule.client.name,
      }))
    )

  const clients: ClientOption[] = clientRecords

  const employees: EmployeeOption[] = employeeRecords

  const today = new Date()
  const todayCount = schedules.filter((schedule) =>
    isSameDay(new Date(schedule.date), today)
  ).length
  const pendingCount = schedules.filter((s) => s.status === "PENDING").length
  const needsReturnCount = schedules.filter(
    (s) => s.status === "NEED_TO_RETURN"
  ).length
  const completedCount = schedules.filter((s) => s.status === "COMPLETED").length
  // Upcoming jobs with nobody on them are the ones that quietly go wrong, so
  // they get a tile of their own rather than hiding inside "Pending".
  const unassignedCount = schedules.filter(
    (s) =>
      s.assignments.length === 0 &&
      s.status === "PENDING" &&
      new Date(s.date) >= new Date(today.toDateString())
  ).length

  const summary = [
    {
      label: "Today's jobs",
      value: todayCount,
      icon: CalendarClock,
      color: "text-sky-600 dark:text-sky-400",
      bg: "bg-sky-600/10",
    },
    {
      label: "Pending",
      value: pendingCount,
      icon: Clock,
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-600/10",
    },
    {
      label: "Unassigned",
      value: unassignedCount,
      icon: UserX,
      color: "text-rose-600 dark:text-rose-400",
      bg: "bg-rose-600/10",
    },
    {
      label: "Need to return",
      value: needsReturnCount,
      icon: Undo2,
      color: "text-orange-600 dark:text-orange-400",
      bg: "bg-orange-600/10",
    },
    {
      label: "Completed",
      value: completedCount,
      icon: CheckCircle2,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-600/10",
    },
  ]

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold">Schedules</h2>
        <p className="text-sm text-muted-foreground">
          Create schedules at client sites and deploy the employees who&apos;ll
          handle them.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {summary.map((stat) => (
          <Card key={stat.label} className="shadow-sm" size="sm">
            <CardContent className="flex items-center gap-3">
              <div
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-lg",
                  stat.bg
                )}
              >
                <stat.icon className={cn("size-5", stat.color)} />
              </div>
              <div className="min-w-0">
                <p className="text-2xl leading-none font-semibold tabular-nums">
                  {stat.value}
                </p>
                <p className="mt-1.5 truncate text-xs text-muted-foreground">
                  {stat.label}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Keyed on the linked day so tapping a notification while already on
          this page still moves the calendar, instead of keeping the state the
          view already had. */}
      <SchedulesView
        key={focusDate ?? "today"}
        schedules={schedules}
        clients={clients}
        employees={employees}
        busy={busy}
        focusDate={focusDate}
      />
    </div>
  )
}
