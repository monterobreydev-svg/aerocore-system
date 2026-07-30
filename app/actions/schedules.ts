"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { verifySession } from "@/lib/auth"
import { dateKey } from "@/lib/schedule"
import { notifyEmployees } from "@/lib/notify"

async function requireScheduleAccess() {
  const session = await verifySession()
  if (
    session.role !== "DIRECTOR" &&
    session.role !== "ADMINISTRATOR" &&
    session.role !== "ENGINEER"
  ) {
    return null
  }
  return session
}

function combineDateAndTime(date: string, time: string) {
  return new Date(`${date}T${time}:00`)
}

function shortTime(value: Date) {
  return value.toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
  })
}

function shortDate(value: Date) {
  return value.toLocaleDateString("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}

// What an assigned employee needs off a notification without opening anything:
// when, and where. Composed here so the create and edit paths word it the same.
function assignmentNotice(job: {
  date: Date
  startTime: Date
  endTime: Date
  client: { name: string }
  branch: { name: string } | null
}) {
  const site = job.branch ? `${job.client.name} · ${job.branch.name}` : job.client.name

  return {
    type: "SCHEDULE_ASSIGNED" as const,
    title: "New schedule assigned",
    body: `${shortDate(job.date)}, ${shortTime(job.startTime)}–${shortTime(job.endTime)} · ${site}`,
    // Resolved per recipient: an engineer assigned to a job reads it on the
    // admin calendar, an employee on their own schedule page — and both open on
    // the job's own day rather than today.
    destination: "schedule" as const,
    focusDate: dateKey(job.date),
  }
}

// The rule the whole feature hangs on: a person can't be in two places at
// once. Checked here rather than only in the browser because the browser copy
// can be stale — someone else may have assigned the same employee seconds ago —
// and because a server action is a public endpoint regardless of what the UI
// does.
//
// Half-open comparison (`startTime < end` AND `endTime > start`) so a job
// finishing at 12:00 and one starting at 12:00 are not treated as a clash.
// CANCELLED jobs don't hold anyone's time; every other status does.
async function findAssignmentConflicts({
  employeeIds,
  start,
  end,
  excludeScheduleId,
}: {
  employeeIds: string[]
  start: Date
  end: Date
  excludeScheduleId?: string
}) {
  if (employeeIds.length === 0) return []

  const clashing = await prisma.schedule.findMany({
    where: {
      ...(excludeScheduleId ? { id: { not: excludeScheduleId } } : {}),
      status: { not: "CANCELLED" },
      startTime: { lt: end },
      endTime: { gt: start },
      assignments: { some: { employeeId: { in: employeeIds } } },
    },
    select: {
      startTime: true,
      endTime: true,
      client: { select: { name: true } },
      branch: { select: { name: true } },
      assignments: {
        where: { employeeId: { in: employeeIds } },
        select: {
          employee: { select: { firstName: true, lastName: true } },
        },
      },
    },
    orderBy: { startTime: "asc" },
  })

  return clashing.flatMap((schedule) => {
    const site = schedule.branch
      ? `${schedule.client.name} · ${schedule.branch.name}`
      : schedule.client.name
    const when = `${shortTime(schedule.startTime)}–${shortTime(schedule.endTime)}`

    return schedule.assignments.map(
      (assignment) =>
        `${assignment.employee.firstName} ${assignment.employee.lastName} is already assigned to ${site} (${when}).`
    )
  })
}

const WORK_TYPE_VALUES = [
  "INSTALLATION",
  "REPAIR",
  "MAINTENANCE",
  "CLEANING",
  "INSPECTION",
  "SURVEY",
  "TROUBLESHOOT",
] as const

const STATUS_VALUES = [
  "PENDING",
  "COMPLETED",
  "NEED_TO_RETURN",
  "RESCHEDULED",
  "CANCELLED",
] as const

const ScheduleSchema = z
  .object({
    clientId: z.string().min(1, "Select a client."),
    branchId: z.string().trim().optional(),
    date: z.string().min(1, "Select a date."),
    startTime: z.string().min(1, "Set a start time."),
    endTime: z.string().min(1, "Set an end time."),
    contactPerson: z.string().trim().optional(),
    contactNumber: z.string().trim().optional(),
    remarks: z.string().trim().max(2000, "Remarks are too long.").optional(),
    workTypes: z
      .array(z.enum(WORK_TYPE_VALUES))
      .min(1, "Select at least one work type."),
  })
  .refine((data) => data.endTime > data.startTime, {
    message: "End time must be after the start time.",
    path: ["endTime"],
  })

export type ScheduleState =
  | {
      errors?: {
        clientId?: string[]
        branchId?: string[]
        date?: string[]
        startTime?: string[]
        endTime?: string[]
        contactPerson?: string[]
        contactNumber?: string[]
        remarks?: string[]
        workTypes?: string[]
        employeeIds?: string[]
      }
      message?: string
      success?: boolean
      // Echoed back so "Save & add another" can report a running count.
      createdId?: string
    }
  | undefined

export async function createSchedule(
  _state: ScheduleState,
  formData: FormData
): Promise<ScheduleState> {
  const session = await requireScheduleAccess()
  if (!session) {
    return { message: "You don't have permission to create schedules." }
  }

  const validatedFields = ScheduleSchema.safeParse({
    clientId: formData.get("clientId"),
    branchId: formData.get("branchId") || undefined,
    date: formData.get("date"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    contactPerson: formData.get("contactPerson"),
    contactNumber: formData.get("contactNumber"),
    remarks: formData.get("remarks"),
    workTypes: formData.getAll("workTypes"),
  })

  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors }
  }

  const {
    clientId,
    branchId,
    date,
    startTime,
    endTime,
    contactPerson,
    contactNumber,
    remarks,
    workTypes,
  } = validatedFields.data

  const employeeIds = [
    ...new Set(formData.getAll("employeeIds").map(String).filter(Boolean)),
  ]

  const start = combineDateAndTime(date, startTime)
  const end = combineDateAndTime(date, endTime)

  const conflicts = await findAssignmentConflicts({ employeeIds, start, end })
  if (conflicts.length > 0) {
    return {
      errors: { employeeIds: conflicts },
      message: "Some of the employees are already assigned at that time.",
    }
  }

  const created = await prisma.schedule.create({
    data: {
      clientId,
      branchId: branchId || null,
      date: new Date(`${date}T00:00:00`),
      startTime: start,
      endTime: end,
      contactPerson: contactPerson || null,
      contactNumber: contactNumber || null,
      remarks: remarks || null,
      workTypes,
      createdById: session.accountId,
      assignments:
        employeeIds.length > 0
          ? { create: employeeIds.map((employeeId) => ({ employeeId })) }
          : undefined,
    },
    // The client and branch names come back with the row rather than in a
    // second query — the notification needs them and they're already joined.
    select: {
      id: true,
      date: true,
      startTime: true,
      endTime: true,
      client: { select: { name: true } },
      branch: { select: { name: true } },
    },
  })

  // An engineer who put themselves on the job doesn't need telling.
  await notifyEmployees(
    employeeIds.filter((id) => id !== session.employeeId),
    assignmentNotice(created)
  )

  revalidatePath("/admin/schedules")
  revalidatePath("/employee/schedule")

  return { success: true, createdId: created.id }
}

const UpdateScheduleSchema = z
  .object({
    scheduleId: z.string().min(1),
    clientId: z.string().min(1, "Select a client."),
    branchId: z.string().trim().optional(),
    date: z.string().min(1, "Select a date."),
    startTime: z.string().min(1, "Set a start time."),
    endTime: z.string().min(1, "Set an end time."),
    contactPerson: z.string().trim().optional(),
    contactNumber: z.string().trim().optional(),
    remarks: z.string().trim().max(2000, "Remarks are too long.").optional(),
    workTypes: z
      .array(z.enum(WORK_TYPE_VALUES))
      .min(1, "Select at least one work type."),
    status: z.enum(STATUS_VALUES, { error: "Select a status." }),
  })
  .refine((data) => data.endTime > data.startTime, {
    message: "End time must be after the start time.",
    path: ["endTime"],
  })

export type UpdateScheduleState =
  | {
      errors?: {
        clientId?: string[]
        branchId?: string[]
        date?: string[]
        startTime?: string[]
        endTime?: string[]
        contactPerson?: string[]
        contactNumber?: string[]
        remarks?: string[]
        workTypes?: string[]
        status?: string[]
        employeeIds?: string[]
      }
      message?: string
      success?: boolean
    }
  | undefined

export async function updateSchedule(
  _state: UpdateScheduleState,
  formData: FormData
): Promise<UpdateScheduleState> {
  const session = await requireScheduleAccess()
  if (!session) {
    return { message: "You don't have permission to edit schedules." }
  }

  const validatedFields = UpdateScheduleSchema.safeParse({
    scheduleId: formData.get("scheduleId"),
    clientId: formData.get("clientId"),
    branchId: formData.get("branchId") || undefined,
    date: formData.get("date"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    contactPerson: formData.get("contactPerson"),
    contactNumber: formData.get("contactNumber"),
    remarks: formData.get("remarks"),
    workTypes: formData.getAll("workTypes"),
    status: formData.get("status"),
  })

  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors }
  }

  const {
    scheduleId,
    clientId,
    branchId,
    date,
    startTime,
    endTime,
    contactPerson,
    contactNumber,
    remarks,
    workTypes,
    status,
  } = validatedFields.data

  const employeeIds = [
    ...new Set(formData.getAll("employeeIds").map(String).filter(Boolean)),
  ]

  const start = combineDateAndTime(date, startTime)
  const end = combineDateAndTime(date, endTime)

  // Excludes this schedule, so re-saving a job without changing its employees
  // doesn't report the job clashing with itself.
  const conflicts = await findAssignmentConflicts({
    employeeIds,
    start,
    end,
    excludeScheduleId: scheduleId,
  })
  if (conflicts.length > 0) {
    return {
      errors: { employeeIds: conflicts },
      message: "Some of the employees are already assigned at that time.",
    }
  }

  const { job, addedEmployeeIds } = await prisma.$transaction(async (tx) => {
    // Read before the wipe: editing a job re-writes every assignment, so
    // "who is new to this job" can only be answered from what was there
    // first. Without it, saving a remarks change would re-notify the whole
    // crew.
    const previous = await tx.scheduleAssignment.findMany({
      where: { scheduleId },
      select: { employeeId: true },
    })
    const before = new Set(previous.map((row) => row.employeeId))

    const updated = await tx.schedule.update({
      where: { id: scheduleId },
      data: {
        clientId,
        branchId: branchId || null,
        date: new Date(`${date}T00:00:00`),
        startTime: start,
        endTime: end,
        contactPerson: contactPerson || null,
        contactNumber: contactNumber || null,
        remarks: remarks || null,
        workTypes,
        status,
      },
      select: {
        date: true,
        startTime: true,
        endTime: true,
        client: { select: { name: true } },
        branch: { select: { name: true } },
      },
    })

    await tx.scheduleAssignment.deleteMany({ where: { scheduleId } })

    if (employeeIds.length > 0) {
      await tx.scheduleAssignment.createMany({
        data: employeeIds.map((employeeId) => ({ scheduleId, employeeId })),
        skipDuplicates: true,
      })
    }

    return {
      job: updated,
      addedEmployeeIds: employeeIds.filter((id) => !before.has(id)),
    }
  })

  // Outside the transaction: an inbox row failing is not a reason to undo the
  // edit itself.
  await notifyEmployees(
    addedEmployeeIds.filter((id) => id !== session.employeeId),
    assignmentNotice(job)
  )

  revalidatePath("/admin/schedules")
  revalidatePath("/employee/schedule")

  return { success: true }
}

// Status is the field that changes most after a schedule is created — it's how the
// day gets closed out. Giving it its own action means marking one Completed is
// a single click from the calendar, rather than opening the full edit form and
// re-submitting every other field (which would also re-run the conflict check
// on an unchanged assignment).
export async function updateScheduleStatus(
  scheduleId: string,
  status: (typeof STATUS_VALUES)[number]
) {
  const session = await requireScheduleAccess()
  if (!session) {
    throw new Error("You don't have permission to edit schedules.")
  }

  const parsed = z.enum(STATUS_VALUES).safeParse(status)
  if (!parsed.success) throw new Error("Unknown status.")

  await prisma.schedule.update({
    where: { id: scheduleId },
    data: { status: parsed.data },
  })

  revalidatePath("/admin/schedules")
  revalidatePath("/employee/schedule")
}

// Branches are fetched for one client at a time, on demand.
//
// Sending every client's branches with the page is O(clients x branches): a
// handful of 100-branch clients adds hundreds of KB to a load that mostly
// doesn't need them, and on 3G that is seconds of blank screen. The form only
// ever shows one client's branches, so it asks for them when a client is
// picked. The browser caches the result per client for the session.
export async function listBranches(clientId: string) {
  const session = await requireScheduleAccess()
  if (!session || !clientId) return []

  return prisma.branch.findMany({
    where: { clientId },
    select: { id: true, name: true, address: true },
    orderBy: { name: "asc" },
  })
}

export async function deleteSchedule(scheduleId: string) {
  const session = await requireScheduleAccess()
  if (!session) {
    throw new Error("You don't have permission to delete schedules.")
  }

  await prisma.schedule.delete({ where: { id: scheduleId } })

  revalidatePath("/admin/schedules")
  revalidatePath("/employee/schedule")
}
