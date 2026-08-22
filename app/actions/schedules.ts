"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db/prisma"
import { canReachEmployee, verifySession } from "@/lib/auth"
import {
  dateKey,
  parseDateKey,
  SCHEDULE_STATUS_LABELS,
  scheduleEndsAt,
  shiftMinutes,
  todayKey,
  toTimeInputValue,
  WORK_TYPE_LABELS,
} from "@/lib/schedule"
import { MAX_SHIFT_HOURS } from "@/lib/attendance"
import { notifyEmployees } from "@/lib/notifications/notify"
import { revalidateLabourCost } from "@/lib/labour-cost/query"
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
// office uses — the client by name, the job by its sales order number, status
// and work types by label, the crew by who was on it. The point of the log is
// that somebody reads it weeks later and understands what happened without
// opening anything else, so the values are resolved here rather than stored as
// ids to be joined back later.
// ---------------------------------------------------------------------------

type ScheduleSnapshot = {
  client: string
  branch: string | null
  salesOrderNo: string | null
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
  // Jobs booked before sales orders reached this model carry none. "—" rather
  // than "" so a backfill reads as a value arriving, not a field appearing out
  // of nowhere.
  put("salesOrderNo", before.salesOrderNo ?? "—", after.salesOrderNo ?? "—")
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
  const site = job.branch
    ? `${job.client.name} · ${job.branch.name}`
    : job.client.name

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

/** The two instants one visit runs between. */
type ShiftRange = { start: Date; end: Date }

// Half-open, so a job finishing at 12:00 and one starting at 12:00 are not
// treated as a clash. The one place the comparison is written.
function overlaps(a: ShiftRange, b: ShiftRange) {
  return a.start < b.end && a.end > b.start
}

// The rule the whole feature hangs on: a person can't be in two places at
// once. Checked here rather than only in the browser because the browser copy
// can be stale — someone else may have assigned the same employee seconds ago —
// and because a server action is a public endpoint regardless of what the UI
// does.
//
// Takes every range being booked at once and answers per range, because the
// create form now books a batch: one crew, several visits. One query covering
// the batch's whole window, then the overlap test in memory — a query per row
// would be a dozen round trips to say the same thing, and the rows are already
// narrowed to this crew.
//
// CANCELLED jobs don't hold anyone's time; every other status does.
async function findAssignmentConflicts({
  employeeIds,
  ranges,
  excludeScheduleId,
}: {
  employeeIds: string[]
  ranges: ShiftRange[]
  excludeScheduleId?: string
}): Promise<string[][]> {
  const none = ranges.map(() => [])
  if (employeeIds.length === 0 || ranges.length === 0) return none

  const from = new Date(Math.min(...ranges.map((range) => +range.start)))
  const to = new Date(Math.max(...ranges.map((range) => +range.end)))

  const clashing = await prisma.schedule.findMany({
    where: {
      ...(excludeScheduleId ? { id: { not: excludeScheduleId } } : {}),
      status: { not: "CANCELLED" },
      startTime: { lt: to },
      endTime: { gt: from },
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

  return ranges.map((range) =>
    clashing
      .filter((schedule) =>
        overlaps(range, { start: schedule.startTime, end: schedule.endTime })
      )
      .flatMap((schedule) => {
        const site = schedule.branch
          ? `${schedule.client.name} · ${schedule.branch.name}`
          : schedule.client.name
        const when = `${shortDate(schedule.startTime)} ${shortTime(schedule.startTime)}–${shortTime(schedule.endTime)}`

        return schedule.assignments.map(
          (assignment) =>
            `${assignment.employee.firstName} ${assignment.employee.lastName} is already assigned to ${site} (${when}).`
        )
      })
  )
}

// The other half of the same rule, and the one only a batch can break: two
// visits in the *same* submission overlapping each other. They share a crew by
// construction, so any overlap is a person double-booked — and neither row
// exists yet, so the query above cannot see it.
//
// Reported against the later row of each pair: the earlier one is the booking
// that already stood when the clash was created.
function findBatchOverlaps(
  ranges: ShiftRange[],
  /**
   * What to call each range when naming it in a message — the row's position in
   * the *form*, which is not its position here once rows without a sales order
   * have been dropped. "Overlaps schedule 2" has to mean the one labelled 2 on
   * screen, or it sends you to the wrong row.
   */
  labels: number[]
): string[][] {
  return ranges.map((range, index) =>
    ranges
      .slice(0, index)
      .flatMap((earlier, earlierIndex) =>
        overlaps(range, earlier)
          ? [
              `Overlaps schedule ${labels[earlierIndex]} in this batch (${shortDate(
                earlier.start
              )} ${shortTime(earlier.start)}–${shortTime(earlier.end)}). The same crew can't be on both.`,
            ]
          : []
      )
  )
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

// ---------------------------------------------------------------------------
// Creating schedules
//
// One submission books several jobs, and the only thing they share is the
// crew. That is the shape the office actually works in: the same four people
// are out all week, one client on Tuesday and a different one on Thursday, and
// re-picking those four for every visit was the whole reason bulk entry hurt.
//
// So *every* other field belongs to the row — client, branch, sales order, the
// day, the hours, the work, and the on-site contact. A different client means a
// different site, and a different site means a different person meeting the
// crew at the gate; a contact shared across the batch would be wrong for all
// but one of them.
// ---------------------------------------------------------------------------

// Enough for a fortnight of work, few enough that the conflict window below
// stays a narrow read and the review step stays something a person can actually
// check before committing.
//
// Not exported: a "use server" module may only export async functions, and a
// stray `export const` here takes down every route that imports the file.
const SCHEDULE_BATCH_LIMIT = 20

// The shape only — untrusted JSON off the wire. The rules each row has to
// satisfy are checked in rowProblems below, where each can produce a message
// aimed at the row it belongs to.
const ScheduleRowSchema = z.object({
  clientId: z.string(),
  branchId: z.string(),
  salesOrderNo: z.string(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  workTypes: z.array(z.enum(WORK_TYPE_VALUES)),
  contactPerson: z.string(),
  contactNumber: z.string(),
  remarks: z.string(),
})

const CreateSchedulesSchema = z.object({
  rows: z
    .array(ScheduleRowSchema)
    .min(1, "Add at least one schedule.")
    .max(
      SCHEDULE_BATCH_LIMIT,
      `That's more than ${SCHEDULE_BATCH_LIMIT} schedules in one go. Save these first, then start another batch.`
    ),
})

type ScheduleRow = z.infer<typeof ScheduleRowSchema>

/**
 * What's wrong with one row, in the words the person filling it in needs.
 *
 * Returned as a flat list per row rather than raised as zod issues, because
 * that is how the form shows them: under the row they belong to, all of them at
 * once, so a row with two problems doesn't take two submissions to fix.
 */
function rowProblems(row: ScheduleRow, today: string): string[] {
  const problems: string[] = []

  if (!row.clientId) problems.push("Select a client.")
  // Required, because payroll is allocated by it: an employee's day is split
  // across the jobs they were scheduled on, and a visit naming no job has
  // nothing to charge its share of the wage to. See lib/labour-cost.
  if (!row.salesOrderNo) problems.push("Select the SO number this work is for.")
  if (!row.date) problems.push("Select a date.")
  if (!row.startTime) problems.push("Set a start time.")
  if (!row.endTime) problems.push("Set an end time.")
  if (row.workTypes.length === 0) problems.push("Select at least one work type.")
  if (row.remarks.length > 2000) problems.push("Remarks are too long.")
  if (problems.length > 0) return problems

  // Work is assigned, not recorded: a job on a day that has already been and
  // gone is nobody's to turn up for. The date picker is capped at today too,
  // but a form left open overnight submits yesterday's date in good faith and
  // an action is a public endpoint regardless of what the dialog allows — so
  // the day is checked here, when it is actually being written.
  if (row.date < today) {
    problems.push("That day has already passed. Schedule work for today or later.")
  }

  // A start time earlier *today* is deliberately NOT rejected, though the form
  // says so plainly before you commit.
  //
  // A schedule is no longer only an instruction to turn up; it is also what
  // splits a day's wage across the jobs it was spent on (lib/labour-cost).
  // Crews get phoned and sent at eight and the office records it at ten, and
  // refusing that leaves two hours attributed to nobody — the job's cost lands
  // in overhead instead, which is a worse answer than a slightly late entry.
  // Editing has never had a floor either, so a block here was only ever a
  // detour through the edit form.

  if (row.startTime === row.endTime) {
    problems.push("The start and end can't be the same time.")
  } else if (shiftMinutes(row.startTime, row.endTime) > MAX_SHIFT_HOURS * 60) {
    // An end *before* the start is a night shift, not a typo — 19:00 to 08:00
    // is thirteen hours of one job, and attendance has always handled a punch
    // that crosses midnight. What is a mistake is a shift nobody could punch
    // out of: timing out stops looking for an open punch after MAX_SHIFT_HOURS,
    // so a schedule longer than that could never be closed properly.
    problems.push(`A shift can't run longer than ${MAX_SHIFT_HOURS} hours.`)
  }

  return problems
}

/**
 * Rows naming a branch or a sales order that isn't the client's.
 *
 * The pickers only ever offer the row's own client's, but a server action is a
 * public endpoint regardless of what the dialog allows, and both cost something
 * real when wrong: a foreign branch sends the crew to another customer's
 * address, and a foreign SO puts this job's labour on another project's books —
 * the COGS roll-up groups by exactly that number.
 *
 * Two queries however many rows there are: the ids are collected across the
 * whole batch and looked up once. A check per row would be forty round trips to
 * answer a question about a handful of distinct values.
 *
 * A valid sales order also proves the client exists, since it has to be that
 * client's — which is what keeps a bogus clientId from reaching the insert.
 */
async function findMisfiledRows(rows: ScheduleRow[]): Promise<ScheduleRowErrors> {
  const branchIds = [...new Set(rows.map((row) => row.branchId).filter(Boolean))]
  const orderNos = [
    ...new Set(rows.map((row) => row.salesOrderNo).filter(Boolean)),
  ]

  const [branches, projects] = await Promise.all([
    branchIds.length > 0
      ? prisma.branch.findMany({
          where: { id: { in: branchIds } },
          select: { id: true, clientId: true },
        })
      : [],
    orderNos.length > 0
      ? prisma.project.findMany({
          where: { salesOrderNo: { in: orderNos } },
          select: { salesOrderNo: true, clientId: true },
        })
      : [],
  ])

  const branchOwner = new Map(branches.map((row) => [row.id, row.clientId]))
  const orderOwner = new Map(
    projects.map((row) => [row.salesOrderNo, row.clientId])
  )

  const problems: ScheduleRowErrors = {}
  rows.forEach((row, index) => {
    const messages: string[] = []
    // No branch at all is head office, which is always the client's own.
    if (row.branchId && branchOwner.get(row.branchId) !== row.clientId) {
      messages.push("That branch isn't one of this client's.")
    }
    if (orderOwner.get(row.salesOrderNo) !== row.clientId) {
      messages.push("That sales order isn't one of this client's.")
    }
    if (messages.length > 0) problems[index] = messages
  })

  return problems
}

/** Row index → what's wrong with it. Absent keys are rows with nothing wrong. */
export type ScheduleRowErrors = Record<number, string[]>

export type ScheduleBatchState =
  | {
      errors?: {
        employeeIds?: string[]
        /** Wrong with the batch as a whole — none, or too many. */
        rows?: string[]
        /** Wrong with individual rows, keyed by their position in the form. */
        row?: ScheduleRowErrors
      }
      message?: string
      success?: boolean
      /** Echoed back so the dialog can report what it just booked. */
      createdCount?: number
    }
  | undefined

/**
 * One notification per person, however many visits they were just given.
 *
 * A crew put on six jobs would otherwise get six inbox rows saying almost the
 * same thing, which is how an inbox stops being read at all. Names the clients
 * rather than the dates, because "who am I going to" is the question a person
 * opens this to answer, and the batch can now span several of them.
 */
function batchAssignmentNotice(
  jobs: {
    date: Date
    startTime: Date
    endTime: Date
    client: { name: string }
    branch: { name: string } | null
  }[]
) {
  const first = jobs[0]
  if (jobs.length === 1) return assignmentNotice(first)

  const last = jobs[jobs.length - 1]
  const clients = [...new Set(jobs.map((job) => job.client.name))]
  const who =
    clients.length === 1
      ? clients[0]
      : `${clients[0]} +${clients.length - 1} more`

  return {
    type: "SCHEDULE_ASSIGNED" as const,
    title: `${jobs.length} new schedules assigned`,
    body: `${who} · ${shortDate(first.date)} – ${shortDate(last.date)}`,
    destination: "schedule" as const,
    // The first day of the run: it's the one that comes up soonest, and the
    // calendar it opens shows the rest from there.
    focusDate: dateKey(first.date),
  }
}

export async function createSchedules(
  _state: ScheduleBatchState,
  formData: FormData
): Promise<ScheduleBatchState> {
  const session = await requireScheduleAccess()
  if (!session) {
    return { message: "You don't have permission to create schedules." }
  }

  // The rows arrive as one JSON field rather than repeated form keys: each row
  // carries a *list* of work types, and repeated keys give no way to tell which
  // row a given `workTypes` value belongs to.
  let rawRows: unknown = []
  try {
    rawRows = JSON.parse(String(formData.get("rows") ?? "[]"))
  } catch {
    return { message: "Couldn't read the schedules. Try again." }
  }

  const validatedFields = CreateSchedulesSchema.safeParse({ rows: rawRows })
  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors }
  }

  const { rows } = validatedFields.data

  // The one thing the whole batch shares.
  const employeeIds = [
    ...new Set(formData.getAll("employeeIds").map(String).filter(Boolean)),
  ]

  // 1-based, as the form numbers its cards.
  const labels = rows.map((_row, index) => index + 1)

  // Read once: a batch submitted across midnight would otherwise judge its own
  // rows against two different "today"s.
  const today = todayKey()
  const problems: ScheduleRowErrors = {}
  const addProblems = (index: number, messages: string[]) => {
    if (messages.length > 0) {
      problems[index] = [...(problems[index] ?? []), ...messages]
    }
  }

  rows.forEach((row, index) => addProblems(index, rowProblems(row, today)))

  // Bad rows have no usable bounds, so the clash checks below can't run over
  // them. Say what's wrong with the shape first and let it be fixed.
  if (Object.keys(problems).length > 0) {
    return {
      errors: { row: problems },
      message: "Some of the schedules need fixing.",
    }
  }

  const misfiled = await findMisfiledRows(rows)
  for (const [index, messages] of Object.entries(misfiled)) {
    addProblems(Number(index), messages)
  }
  if (Object.keys(problems).length > 0) {
    return {
      errors: { row: problems },
      message: "Nothing was created — check the highlighted schedules.",
    }
  }

  const ranges = rows.map((row) =>
    shiftBounds(row.date, row.startTime, row.endTime)
  )

  // Both halves of "a person can't be in two places at once": against what is
  // already booked, and against the rest of this batch. The second half is the
  // one only a batch can break, and it matters more now that rows can name
  // different clients — two sites at the same hour is exactly the mistake this
  // form makes easy to type.
  const existing = await findAssignmentConflicts({ employeeIds, ranges })
  const withinBatch = findBatchOverlaps(ranges, labels)

  rows.forEach((_row, index) =>
    addProblems(index, [...withinBatch[index], ...existing[index]])
  )

  // All or nothing. A partial write is the worst outcome here: the dialog
  // closes, some of the visits exist, and nobody can tell which without
  // re-reading the calendar.
  if (Object.keys(problems).length > 0) {
    return {
      errors: { row: problems },
      message:
        "Nothing was created — some of these clash with work already booked.",
    }
  }

  const created = await prisma.$transaction(
    rows.map((row, index) =>
      prisma.schedule.create({
        data: {
          clientId: row.clientId,
          branchId: row.branchId || null,
          salesOrderNo: row.salesOrderNo,
          date: new Date(`${row.date}T00:00:00`),
          startTime: ranges[index].start,
          endTime: ranges[index].end,
          contactPerson: row.contactPerson.trim() || null,
          contactNumber: row.contactNumber.trim() || null,
          remarks: row.remarks.trim() || null,
          workTypes: row.workTypes,
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
    )
  )

  // Oldest first, so the summary reads as the span it is.
  const jobs = [...created].sort((a, b) => +a.startTime - +b.startTime)

  // An engineer who put themselves on the job doesn't need telling.
  await notifyEmployees(
    employeeIds.filter((id) => id !== session.employeeId),
    batchAssignmentNotice(jobs)
  )

  revalidatePath("/admin/schedules")
  revalidatePath("/employee/schedule")
  revalidateLabourCost()

  return { success: true, createdCount: created.length }
}

const UpdateScheduleSchema = z
  .object({
    scheduleId: z.string().min(1),
    clientId: z.string().min(1, "Select a client."),
    branchId: z.string().trim().optional(),
    salesOrderNo: z
      .string()
      .trim()
      .min(1, "Select the SO number this work is for."),
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
        salesOrderNo?: string[]
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
    salesOrderNo: formData.get("salesOrderNo"),
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
    salesOrderNo,
    date,
    startTime,
    endTime,
    contactPerson,
    contactNumber,
    remarks,
    workTypes,
    status,
  } = validatedFields.data

  // The same ownership check the batch runs, on a batch of one — so editing a
  // job can't move it onto another customer's branch or sales order either.
  // Only the fields it looks at need to be real here.
  const misfiled = await findMisfiledRows([
    {
      clientId,
      branchId: branchId ?? "",
      salesOrderNo,
      date: "",
      startTime: "",
      endTime: "",
      workTypes: [],
      contactPerson: "",
      contactNumber: "",
      remarks: "",
    },
  ])
  if (misfiled[0]) {
    return {
      errors: {
        // Both land on the field they name, so the sheet can mark it.
        branchId: misfiled[0].filter((message) => message.includes("branch")),
        salesOrderNo: misfiled[0].filter((message) =>
          message.includes("sales order")
        ),
      },
    }
  }

  const employeeIds = [
    ...new Set(formData.getAll("employeeIds").map(String).filter(Boolean)),
  ]

  const { start, end } = shiftBounds(date, startTime, endTime)

  // One range, so one list back. Excludes this schedule, so re-saving a job
  // without changing its employees doesn't report the job clashing with itself.
  const [conflicts] = await findAssignmentConflicts({
    employeeIds,
    ranges: [{ start, end }],
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
        salesOrderNo: true,
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
        salesOrderNo,
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
        salesOrderNo: prior.salesOrderNo,
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
        salesOrderNo,
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
  revalidateLabourCost()

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
  revalidateLabourCost()
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
//
// The sales order numbers alongside it come from listClientProjects() in
// app/actions/projects.ts — the same per-client shape, for the same reason.
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
  revalidateLabourCost()
}

// ---------------------------------------------------------------------------
// One person's day, for their staff record
// ---------------------------------------------------------------------------
//
// The schedules page answers "who is out today"; this answers "where is this
// one person on this one day", which is what gets asked with the record already
// open — a client rings about a visit, or somebody's leave has to be covered.
//
// Deliberately a day at a time. Their whole assignment history is the unbounded
// relation AGENTS.md rules out, and the office asks this question about a date,
// not about a year. What crosses the wire is a handful of jobs with their names
// already resolved, never a schedule row.

export type StaffScheduleJob = {
  id: string
  startTime: string
  endTime: string
  minutes: number
  workTypes: WorkType[]
  status: ScheduleStatus
  clientName: string
  branchName: string | null
  /** The job this visit belongs to. Null on schedules booked before SO numbers. */
  salesOrderNo: string | null
  /** The branch's own address when there is one — that's where the crew goes. */
  address: string
  contactPerson: string | null
  contactNumber: string | null
  remarks: string | null
  /** Who else is on the job, by name — everyone but the person being viewed. */
  crew: string[]
}

export type StaffScheduleDay = {
  date: string
  jobs: StaffScheduleJob[]
  /** Scheduled minutes for the day, cancellations excluded. */
  minutes: number
  /**
   * The nearest days on either side that this person is actually on. Without
   * them, stepping is blind: an empty Tuesday says nothing about whether the
   * next job is on Wednesday or in three weeks, and the only way to find out
   * is to keep tapping.
   */
  prevDate: string | null
  nextDate: string | null
}

/**
 * May the signed-in user look at this person's staff record?
 *
 * Director and Administrator only — an Engineer can create schedules but has no
 * business on somebody's record. `canReachEmployee` then keeps an Administrator
 * out of a Director's, the same rule the staff list is filtered by.
 */
async function requireStaffRecordAccess(employeeId: string) {
  const session = await verifySession()
  if (session.role !== "DIRECTOR" && session.role !== "ADMINISTRATOR") {
    return null
  }
  if (!(await canReachEmployee(session.role, employeeId))) return null
  return session
}

export async function listEmployeeDaySchedule(
  employeeId: string,
  date: string
): Promise<StaffScheduleDay> {
  const empty: StaffScheduleDay = {
    date,
    jobs: [],
    minutes: 0,
    prevDate: null,
    nextDate: null,
  }

  if (!employeeId || !parseDateKey(date)) return empty
  if (!(await requireStaffRecordAccess(employeeId))) return empty

  // Local midnight, written exactly as createSchedule writes it — comparing an
  // ISO/UTC day here would land a day out for everyone east of UTC, Manila
  // included.
  const day = new Date(`${date}T00:00:00`)
  const assignedToThem = { assignments: { some: { employeeId } } }

  const [rows, previous, next] = await Promise.all([
    prisma.schedule.findMany({
      where: { ...assignedToThem, date: day },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        workTypes: true,
        status: true,
        contactPerson: true,
        contactNumber: true,
        remarks: true,
        salesOrderNo: true,
        client: { select: { name: true, address: true } },
        branch: { select: { name: true, address: true } },
        assignments: {
          select: {
            employeeId: true,
            employee: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { startTime: "asc" },
    }),
    // Dates only — two single-column reads to label the steppers.
    prisma.schedule.findFirst({
      where: {
        ...assignedToThem,
        status: { not: "CANCELLED" },
        date: { lt: day },
      },
      select: { date: true },
      orderBy: { date: "desc" },
    }),
    prisma.schedule.findFirst({
      where: {
        ...assignedToThem,
        status: { not: "CANCELLED" },
        date: { gt: day },
      },
      select: { date: true },
      orderBy: { date: "asc" },
    }),
  ])

  const jobs: StaffScheduleJob[] = rows.map((row) => ({
    id: row.id,
    startTime: row.startTime.toISOString(),
    endTime: row.endTime.toISOString(),
    minutes: Math.round((+row.endTime - +row.startTime) / 60000),
    workTypes: row.workTypes,
    status: row.status,
    clientName: row.client.name,
    branchName: row.branch?.name ?? null,
    salesOrderNo: row.salesOrderNo,
    address: row.branch?.address ?? row.client.address,
    contactPerson: row.contactPerson,
    contactNumber: row.contactNumber,
    remarks: row.remarks,
    crew: row.assignments
      .filter((assignment) => assignment.employeeId !== employeeId)
      .map(
        (assignment) =>
          `${assignment.employee.firstName} ${assignment.employee.lastName}`
      ),
  }))

  return {
    date,
    jobs,
    // A cancelled job holds nobody's time, so it is listed but not counted —
    // the same rule the assignment conflict check uses.
    minutes: jobs
      .filter((job) => job.status !== "CANCELLED")
      .reduce((total, job) => total + job.minutes, 0),
    prevDate: previous ? dateKey(previous.date) : null,
    nextDate: next ? dateKey(next.date) : null,
  }
}
