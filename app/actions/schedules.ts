"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { verifySession } from "@/lib/auth"
import {
  dateKey,
  SCHEDULE_STATUS_LABELS,
  scheduleEndsAt,
  shiftMinutes,
  todayKey,
  toTimeInputValue,
  WORK_TYPE_LABELS,
} from "@/lib/schedule"
import { MAX_SHIFT_HOURS } from "@/lib/attendance"
import { notifyEmployees } from "@/lib/notify"
import type { ScheduleStatus, WorkType } from "@/app/generated/prisma/client"

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

/**
 * The two instants a scheduled shift runs between.
 *
 * The only place that decides where an end time lands, so a night shift can't
 * be written with an end that sits eleven hours before its own start. The row's
 * `date` stays the day the shift *begins* — the same day attendance files the
 * punch under, which is what keeps the two able to find each other.
 */
function shiftBounds(date: string, startTime: string, endTime: string) {
  return {
    start: combineDateAndTime(date, startTime),
    end: scheduleEndsAt(date, startTime, endTime)!,
  }
}

// ---------------------------------------------------------------------------
// Edit history
//
// One row per field that actually moved, holding both sides in the words the
// office uses — client and branch by name, status and work types by label, the
// crew by who was on it. The point of the log is that somebody reads it weeks
// later and understands what happened without opening anything else, so the
// values are resolved here rather than stored as ids to be joined back later.
// ---------------------------------------------------------------------------

type ScheduleSnapshot = {
  client: string
  branch: string | null
  date: string
  startTime: string
  endTime: string
  status: ScheduleStatus
  workTypes: WorkType[]
  contactPerson: string | null
  contactNumber: string | null
  remarks: string | null
  assigned: string[]
}

const timeOf = (value: Date) => toTimeInputValue(value.toISOString())
const dateKeyOf = (value: Date) => dateKey(value)

// Sorted, so re-saving the same crew or the same work types in a different
// order isn't recorded as a change that never happened.
function listOf(values: readonly string[]) {
  return [...values].sort().join(", ")
}

function diffSchedule(before: ScheduleSnapshot, after: ScheduleSnapshot) {
  const changes: { field: string; oldValue: string; newValue: string }[] = []

  function put(field: string, oldValue: string | null, newValue: string | null) {
    if ((oldValue ?? "") !== (newValue ?? "")) {
      changes.push({
        field,
        oldValue: oldValue ?? "",
        newValue: newValue ?? "",
      })
    }
  }

  put("client", before.client, after.client)
  // A job with no branch is at the client's head office, which is what the
  // form calls it — so that is what the history should call it too.
  put("branch", before.branch ?? "Head office", after.branch ?? "Head office")
  put("date", before.date, after.date)
  put("startTime", before.startTime, after.startTime)
  put("endTime", before.endTime, after.endTime)
  put(
    "status",
    SCHEDULE_STATUS_LABELS[before.status],
    SCHEDULE_STATUS_LABELS[after.status]
  )
  put(
    "workTypes",
    listOf(before.workTypes.map((type) => WORK_TYPE_LABELS[type])),
    listOf(after.workTypes.map((type) => WORK_TYPE_LABELS[type]))
  )
  put(
    "assigned",
    listOf(before.assigned) || "Nobody",
    listOf(after.assigned) || "Nobody"
  )
  put("contactPerson", before.contactPerson, after.contactPerson)
  put("contactNumber", before.contactNumber, after.contactNumber)
  put("remarks", before.remarks, after.remarks)

  return changes
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
  "BACKJOB",
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
  .refine((data) => data.endTime !== data.startTime, {
    message: "The start and end can't be the same time.",
    path: ["endTime"],
  })
  // An end *before* the start is a night shift, not a typo — 19:00 to 08:00 is
  // thirteen hours of one job, and attendance has always handled a punch that
  // crosses midnight. What is a mistake is a shift nobody could punch out of:
  // timing out stops looking for an open punch after MAX_SHIFT_HOURS, so a
  // schedule longer than that could never be closed properly.
  .refine(
    (data) => shiftMinutes(data.startTime, data.endTime) <= MAX_SHIFT_HOURS * 60,
    {
      message: `A shift can't run longer than ${MAX_SHIFT_HOURS} hours.`,
      path: ["endTime"],
    }
  )
  // Work is assigned, not recorded: a job on a day that has already been and
  // gone is nobody's to turn up for. The date picker is capped at today too,
  // but a form left open overnight submits yesterday's date in good faith and
  // an action is a public endpoint regardless of what the dialog allows — so
  // the day is checked here, when it is actually being written.
  //
  // Only on creation. Editing keeps a past date editable, because a job that
  // already happened still needs its outcome recorded against the day it
  // happened on.
  .refine((data) => data.date >= todayKey(), {
    message: "That day has already passed. Schedule work for today or later.",
    path: ["date"],
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

  const { start, end } = shiftBounds(date, startTime, endTime)

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
  .refine((data) => data.endTime !== data.startTime, {
    message: "The start and end can't be the same time.",
    path: ["endTime"],
  })
  // An end *before* the start is a night shift, not a typo — 19:00 to 08:00 is
  // thirteen hours of one job, and attendance has always handled a punch that
  // crosses midnight. What is a mistake is a shift nobody could punch out of:
  // timing out stops looking for an open punch after MAX_SHIFT_HOURS, so a
  // schedule longer than that could never be closed properly.
  .refine(
    (data) => shiftMinutes(data.startTime, data.endTime) <= MAX_SHIFT_HOURS * 60,
    {
      message: `A shift can't run longer than ${MAX_SHIFT_HOURS} hours.`,
      path: ["endTime"],
    }
  )

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

  const { start, end } = shiftBounds(date, startTime, endTime)

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
    // crew — and the history below would have nothing to compare against.
    //
    // Names, not ids: a log entry reading "clientId a3f1… → b8c2…" is a row
    // nobody can act on months later.
    const prior = await tx.schedule.findUniqueOrThrow({
      where: { id: scheduleId },
      select: {
        date: true,
        startTime: true,
        endTime: true,
        contactPerson: true,
        contactNumber: true,
        remarks: true,
        workTypes: true,
        status: true,
        client: { select: { name: true } },
        branch: { select: { name: true } },
        assignments: {
          select: {
            employeeId: true,
            employee: { select: { firstName: true, lastName: true } },
          },
        },
      },
    })
    const before = new Set(prior.assignments.map((row) => row.employeeId))

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

    // In the same transaction as the change it describes: a history that can
    // survive a failed write is a history nobody can trust.
    //
    // Names for whoever is on the job now. The people already on it came back
    // with `prior`; this covers the ones just added.
    const named = await tx.employee.findMany({
      where: { id: { in: employeeIds } },
      select: { id: true, firstName: true, lastName: true },
    })
    const nameById = new Map(
      named.map((row) => [row.id, `${row.firstName} ${row.lastName}`])
    )
    const assignedAfter = employeeIds.map(
      (id) => nameById.get(id) ?? "Unknown employee"
    )
    const changes = diffSchedule(
      {
        client: prior.client.name,
        branch: prior.branch?.name ?? null,
        date: dateKeyOf(prior.date),
        startTime: timeOf(prior.startTime),
        endTime: timeOf(prior.endTime),
        status: prior.status,
        workTypes: prior.workTypes,
        contactPerson: prior.contactPerson,
        contactNumber: prior.contactNumber,
        remarks: prior.remarks,
        assigned: prior.assignments.map(
          (row) => `${row.employee.firstName} ${row.employee.lastName}`
        ),
      },
      {
        client: updated.client.name,
        branch: updated.branch?.name ?? null,
        date,
        startTime,
        endTime,
        status,
        workTypes,
        contactPerson: contactPerson || null,
        contactNumber: contactNumber || null,
        remarks: remarks || null,
        assigned: assignedAfter,
      }
    )

    if (changes.length > 0) {
      await tx.scheduleEditLog.createMany({
        data: changes.map((change) => ({
          scheduleId,
          editedById: session.accountId,
          field: change.field,
          oldValue: change.oldValue,
          newValue: change.newValue,
        })),
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

  await prisma.$transaction(async (tx) => {
    const prior = await tx.schedule.findUniqueOrThrow({
      where: { id: scheduleId },
      select: { status: true },
    })

    await tx.schedule.update({
      where: { id: scheduleId },
      data: { status: parsed.data },
    })

    // Closing a job out from the calendar is an edit like any other, and it's
    // the one that gets queried afterwards — "who marked this completed when
    // the crew says they never went". Re-selecting the status it already has
    // is not a change and doesn't earn a row.
    if (prior.status !== parsed.data) {
      await tx.scheduleEditLog.create({
        data: {
          scheduleId,
          editedById: session.accountId,
          field: "status",
          oldValue: SCHEDULE_STATUS_LABELS[prior.status],
          newValue: SCHEDULE_STATUS_LABELS[parsed.data],
        },
      })
    }
  })

  revalidatePath("/admin/schedules")
  revalidatePath("/employee/schedule")
}

// The history for one job, fetched when its detail sheet opens rather than
// shipped with the calendar.
//
// Every schedule on screen × every edit ever made to it is the payload that
// grows with two things at once — the calendar would get heavier every time
// anyone touched a job. Capped as well: a sheet shows what happened recently,
// and forty entries is already more than anyone reads.
//
// Not exported: a "use server" module may only export async functions, and a
// stray `export const` here takes down every route that imports the file.
const SCHEDULE_HISTORY_LIMIT = 40

export type ScheduleHistoryEntry = {
  id: string
  field: string
  oldValue: string | null
  newValue: string | null
  createdAt: string
  editedByName: string
}

export async function listScheduleHistory(
  scheduleId: string
): Promise<ScheduleHistoryEntry[]> {
  const session = await requireScheduleAccess()
  if (!session || !scheduleId) return []

  const rows = await prisma.scheduleEditLog.findMany({
    where: { scheduleId },
    select: {
      id: true,
      field: true,
      oldValue: true,
      newValue: true,
      createdAt: true,
      editedBy: {
        select: { employee: { select: { firstName: true, lastName: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: SCHEDULE_HISTORY_LIMIT,
  })

  return rows.map((row) => ({
    id: row.id,
    field: row.field,
    oldValue: row.oldValue,
    newValue: row.newValue,
    createdAt: row.createdAt.toISOString(),
    editedByName: `${row.editedBy.employee.firstName} ${row.editedBy.employee.lastName}`,
  }))
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
