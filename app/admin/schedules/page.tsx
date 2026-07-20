import { CalendarClock, CheckCircle2, Clock, Undo2 } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { CreateScheduleDialog } from "@/components/admin/create-schedule-dialog"
import { SchedulesView } from "@/components/admin/schedules-view"
import { Card, CardContent } from "@/components/ui/card"
import type {
  ClientOption,
  EmployeeOption,
  ScheduleRecord,
} from "@/components/admin/schedule-types"

export default async function SchedulesPage() {
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
    prisma.client.findMany({
      include: { branches: { orderBy: { name: "asc" } } },
      orderBy: { name: "asc" },
    }),
    prisma.employee.findMany({
      where: { OR: [{ account: null }, { account: { isActive: true } }] },
      select: { id: true, firstName: true, lastName: true, position: true },
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

  const clients: ClientOption[] = clientRecords.map((client) => ({
    id: client.id,
    name: client.name,
    address: client.address,
    branches: client.branches.map((branch) => ({
      id: branch.id,
      name: branch.name,
      address: branch.address,
    })),
  }))

  const employees: EmployeeOption[] = employeeRecords

  const todayKey = new Date().toDateString()
  const todayCount = schedules.filter(
    (schedule) => new Date(schedule.date).toDateString() === todayKey
  ).length
  const pendingCount = schedules.filter((s) => s.status === "PENDING").length
  const needsReturnCount = schedules.filter(
    (s) => s.status === "NEED_TO_RETURN"
  ).length
  const completedCount = schedules.filter(
    (s) => s.status === "COMPLETED"
  ).length

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Schedules</h2>
          <p className="text-sm text-muted-foreground">
            Book jobs and assign the employees who&apos;ll handle them.
          </p>
        </div>
        <CreateScheduleDialog clients={clients} employees={employees} />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="shadow-sm">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-semibold">{todayCount}</p>
              <p className="text-sm text-muted-foreground">Today&apos;s jobs</p>
            </div>
            <div className="flex size-9 items-center justify-center rounded-lg bg-sky-600/10">
              <CalendarClock className="size-4.5 text-sky-600 dark:text-sky-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-semibold">{pendingCount}</p>
              <p className="text-sm text-muted-foreground">Pending</p>
            </div>
            <div className="flex size-9 items-center justify-center rounded-lg bg-amber-600/10">
              <Clock className="size-4.5 text-amber-600 dark:text-amber-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-semibold">{needsReturnCount}</p>
              <p className="text-sm text-muted-foreground">Need to return</p>
            </div>
            <div className="flex size-9 items-center justify-center rounded-lg bg-orange-600/10">
              <Undo2 className="size-4.5 text-orange-600 dark:text-orange-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-semibold">{completedCount}</p>
              <p className="text-sm text-muted-foreground">Completed</p>
            </div>
            <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-600/10">
              <CheckCircle2 className="size-4.5 text-emerald-600 dark:text-emerald-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      <SchedulesView schedules={schedules} clients={clients} employees={employees} />
    </div>
  )
}
