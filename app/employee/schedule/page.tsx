import { prisma } from "@/lib/prisma"
import { getCurrentEmployee } from "@/lib/dal"
import { EmployeeScheduleView } from "@/components/employee/employee-schedule-view"
import type { ScheduleRecord } from "@/components/admin/schedule-types"

export default async function EmployeeSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string | string[] }>
}) {
  const employee = await getCurrentEmployee()

  // ?date=YYYY-MM-DD is how a notification points at the day it's about. Read
  // here rather than with useSearchParams so the view renders on the right day
  // server-side, with no flash of today first.
  const dateParam = (await searchParams).date
  const focusDate = Array.isArray(dateParam) ? dateParam[0] : dateParam

  // Driven straight off the assignment join, so anything the office creates —
  // or reassigns, reschedules or cancels — shows up here on the next load.
  // The schedule actions revalidate this path, so that's immediate.
  const scheduleRecords = await prisma.schedule.findMany({
    where: { assignments: { some: { employeeId: employee.id } } },
    include: {
      client: { select: { id: true, name: true, address: true } },
      branch: { select: { id: true, name: true, address: true } },
      createdBy: {
        include: { employee: { select: { firstName: true, lastName: true } } },
      },
      assignments: {
        include: {
          employee: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  })

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

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold">My Schedule</h2>
        <p className="text-sm text-muted-foreground">
          Where you&apos;re deployed. Updated whenever the office changes a
          schedule.
        </p>
      </div>

      {/* Keyed on the linked day: tapping a notification while already on this
          page is a same-route navigation, which would otherwise keep the view's
          existing state and leave it sitting on today. */}
      <EmployeeScheduleView
        key={focusDate ?? "today"}
        schedules={schedules}
        employeeId={employee.id}
        focusDate={focusDate}
      />
    </div>
  )
}
