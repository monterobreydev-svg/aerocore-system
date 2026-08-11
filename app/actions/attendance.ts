"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { verifySession } from "@/lib/auth"
import {
  buildObjectKey,
  isAllowedUploadType,
  isR2Configured,
  keySegment,
  MAX_UPLOAD_BYTES,
  presignDownload,
  presignUpload,
  uniqueObjectKey,
} from "@/lib/r2"
import {
  attendanceDay,
  clockTime,
  dayLabel,
  MAX_OVERTIME_HOURS,
  MAX_SHIFT_HOURS,
  nextDay,
  overtimeGate,
  workedMinutes,
} from "@/lib/attendance"
import {
  ATTENDANCE_DETAIL_SELECT,
  toAttendanceRow,
} from "@/lib/attendance-query"
import {
  STAFF_ATTENDANCE_PAGE_SIZE,
  STAFF_DAY_LIMIT,
  STAFF_SUMMARY_DAYS,
  type ScheduledJob,
  type StaffAttendancePage,
  type StaffAttendanceSummary,
} from "@/components/attendance/admin-attendance"
import { notifyEmployee, notifyReviewers } from "@/lib/notify"

function revalidateAll() {
  revalidatePath("/employee/attendance")
  revalidatePath("/employee")
  revalidatePath("/admin/attendance")
}

async function requireAdmin() {
  const session = await verifySession()
  if (session.role !== "DIRECTOR" && session.role !== "ADMINISTRATOR") {
    return null
  }
  return session
}

/**
 * A form field read as a number, where blank means *missing* rather than zero.
 * `Number("")` is 0 — a real position off the coast of Africa — so parsing the
 * hidden coordinate fields directly would turn "location never arrived" into a
 * punch at 0°, 0° that passes every range check and looks like evidence.
 */
function numberField(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.trim() === "") return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * An optional text field, read so that "absent" and "blank" mean the same
 * thing: not given.
 *
 * `formData.get()` returns **null** for a field that isn't in the DOM, and
 * `z.string().optional()` accepts `undefined` but rejects `null` — so a field
 * that is only rendered on one branch of a form fails validation on the other,
 * with an error naming a field the person never saw. That is exactly what broke
 * approving overtime: the note textarea only exists while rejecting.
 */
function textField(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed === "" ? undefined : trimmed
}

// ---------------------------------------------------------------------------
// Today's shift
// ---------------------------------------------------------------------------

// The scheduled day, taken from the assignments the office made. Several jobs in
// one day are one shift for attendance purposes: you clock in for the first and
// out after the last, so the bounds are the earliest start and the latest end.
async function shiftForDay(employeeId: string, day: Date) {
  const next = new Date(day)
  next.setDate(next.getDate() + 1)

  const schedules = await prisma.schedule.findMany({
    where: {
      assignments: { some: { employeeId } },
      date: { gte: day, lt: next },
      status: { not: "CANCELLED" },
    },
    select: {
      startTime: true,
      endTime: true,
      client: { select: { name: true } },
      branch: { select: { name: true } },
    },
    orderBy: { startTime: "asc" },
  })

  if (schedules.length === 0) return null

  return {
    startsAt: schedules.reduce(
      (earliest, s) => (s.startTime < earliest ? s.startTime : earliest),
      schedules[0].startTime
    ),
    endsAt: schedules.reduce(
      (latest, s) => (s.endTime > latest ? s.endTime : latest),
      schedules[0].endTime
    ),
    jobs: schedules.map((s) => ({
      clientName: s.client.name,
      branchName: s.branch?.name ?? null,
      startTime: s.startTime,
      endTime: s.endTime,
    })),
  }
}

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------

export type UploadTicket =
  | { ok: true; url: string; key: string }
  | { ok: false; message: string }

/**
 * A short-lived URL to PUT one punch selfie — or the optional end-of-day report
 * — straight into storage. The key is built here from the session, never taken
 * from the browser: a selfie is evidence, and evidence you can rename is not
 * evidence.
 */
export async function createAttendanceUploadUrl(
  kind: "time-in" | "time-out" | "report",
  filename: string,
  contentType: string,
  size: number,
  /**
   * For a report, the serial printed on the form. Only a hint — the key is
   * still assembled here, so the worst a tampered value can do is name a file
   * oddly inside the sender's own folder.
   */
  serialNo?: string
): Promise<UploadTicket> {
  const session = await verifySession()

  if (!isR2Configured()) {
    return {
      ok: false,
      message: "File storage isn't configured yet. Ask IT to set up R2.",
    }
  }

  // A punch photograph is taken by the camera in the page, so it is always a
  // JPEG. A report is a document.
  const allowed =
    kind === "report"
      ? isAllowedUploadType(contentType)
      : contentType === "image/jpeg" || contentType === "image/webp"
  if (!allowed) {
    return {
      ok: false,
      message:
        kind === "report"
          ? "Upload a JPG, PNG, WEBP, HEIC or PDF."
          : "That photo format isn't supported.",
    }
  }

  if (!Number.isFinite(size) || size <= 0 || size > MAX_UPLOAD_BYTES) {
    return { ok: false, message: "Files must be smaller than 10 MB." }
  }

  const employee = await prisma.employee.findUnique({
    where: { id: session.employeeId },
    select: { firstName: true },
  })
  const owner = employee?.firstName ?? "unknown"

  const now = new Date()
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
  // A filed report gets looked up by its serial far more often than by its
  // date, so the serial goes in the name when there is one.
  const suffix =
    kind === "time-in"
      ? "in"
      : kind === "time-out"
        ? "out"
        : serialNo
          ? keySegment(serialNo, "report", 40)
          : "report"

  const key = await uniqueObjectKey(
    buildObjectKey({
      folder: "attendance",
      owner,
      date,
      label: `${date}_${keySegment(owner, "unknown")}_${suffix}`,
      filename,
    })
  )

  return { ok: true, url: await presignUpload(key, contentType), key }
}

/** Signed view URL. An employee may only open their own punch evidence. */
export async function getAttendanceFileUrl(key: string) {
  const session = await verifySession()
  if (!key || !isR2Configured()) return null

  const isAdmin = session.role === "DIRECTOR" || session.role === "ADMINISTRATOR"
  if (!isAdmin) {
    const owned = await prisma.attendance.findFirst({
      where: {
        employeeId: session.employeeId,
        OR: [
          { timeInSelfieKey: key },
          { timeOutSelfieKey: key },
          { reports: { some: { fileKey: key } } },
        ],
      },
      select: { id: true },
    })
    if (!owned) return null
  }

  return presignDownload(key)
}

// ---------------------------------------------------------------------------
// Sites, for filing a report against
// ---------------------------------------------------------------------------

export type ReportClient = {
  id: string
  name: string
  /** Whether to bother asking which branch. Most clients have none. */
  hasBranches: boolean
}

/**
 * The client list for the report form. Fetched when the form opens rather than
 * shipped with the attendance page, because most days end without a report
 * being filed at all.
 *
 * `hasBranches` is a boolean, not the branches themselves — sending every
 * client's branches is the O(clients x branches) payload AGENTS.md warns about,
 * and the form only ever needs one client's worth.
 */
export async function listReportClients(): Promise<ReportClient[]> {
  await verifySession()

  const clients = await prisma.client.findMany({
    select: {
      id: true,
      name: true,
      _count: { select: { branches: true } },
    },
    orderBy: { name: "asc" },
  })

  return clients.map((client) => ({
    id: client.id,
    name: client.name,
    hasBranches: client._count.branches > 0,
  }))
}

/** One client's branches, asked for when that client is picked. */
export async function listReportBranches(clientId: string) {
  await verifySession()
  if (!clientId) return []

  return prisma.branch.findMany({
    where: { clientId },
    select: { id: true, name: true, address: true },
    orderBy: { name: "asc" },
  })
}

// ---------------------------------------------------------------------------
// Finding the punch someone is currently inside
// ---------------------------------------------------------------------------

type OpenPunch =
  | { ok: true; id: string; date: Date; timeIn: Date }
  | { ok: false; message: string }

/**
 * The shift this person is currently on, wherever it started.
 *
 * Not "today's row" — that is the whole point. An attendance row is keyed to
 * the day the shift *began*, so a 22:00 start is filed under the 11th and is
 * still the open shift at 02:00 on the 12th. Looking up the 12th finds nothing
 * and tells someone who has been working all night that they never timed in.
 *
 * Bounded by MAX_SHIFT_HOURS so a punch nobody closed on Tuesday can't be
 * closed on Thursday and booked as a forty-hour day.
 */
async function openPunch(employeeId: string, now: Date): Promise<OpenPunch> {
  const cutoff = new Date(now.getTime() - MAX_SHIFT_HOURS * 3_600_000)

  const open = await prisma.attendance.findFirst({
    where: { employeeId, timeOut: null, timeIn: { gte: cutoff } },
    orderBy: { timeIn: "desc" },
    select: { id: true, date: true, timeIn: true },
  })
  if (open) return { ok: true, ...open }

  // Nothing open and in range. Which of the three reasons it is decides what
  // the person is told, and they need different things from the office.
  const [todayRow, stale] = await Promise.all([
    prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId, date: attendanceDay(now) } },
      select: { timeOut: true },
    }),
    prisma.attendance.findFirst({
      where: { employeeId, timeOut: null },
      orderBy: { timeIn: "desc" },
      select: { timeIn: true },
    }),
  ])

  if (todayRow?.timeOut) {
    return {
      ok: false,
      message: `You already timed out at ${clockTime(todayRow.timeOut)}.`,
    }
  }
  if (stale) {
    return {
      ok: false,
      message: `Your punch from ${dayLabel(stale.timeIn)} was never closed, and it's now too old to time out against. Ask the office to correct it.`,
    }
  }
  return { ok: false, message: "You haven't timed in." }
}

// ---------------------------------------------------------------------------
// Punching in and out
// ---------------------------------------------------------------------------

const FixSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().nonnegative().optional(),
})

const PunchSchema = FixSchema.extend({
  selfieKey: z.string().trim().min(1),
})

export type PunchState =
  | { message?: string; success?: boolean; at?: string }
  | undefined

export async function timeIn(
  _state: PunchState,
  formData: FormData
): Promise<PunchState> {
  const session = await verifySession()

  const validated = PunchSchema.safeParse({
    selfieKey: formData.get("selfieKey"),
    latitude: numberField(formData.get("latitude")),
    longitude: numberField(formData.get("longitude")),
    accuracy: numberField(formData.get("accuracy")),
  })
  if (!validated.success) {
    return {
      message:
        "The photo or your location didn't come through. Try timing in again.",
    }
  }

  const now = new Date()
  const day = attendanceDay(now)

  // Blocked without a schedule, by decision: attendance is recorded against
  // work the office assigned, and a punch with no shift behind it has nothing
  // to check against.
  const shift = await shiftForDay(session.employeeId, day)
  if (!shift) {
    return {
      message:
        "You have no shift scheduled today, so you can't time in. Contact the office if that's wrong.",
    }
  }

  const existing = await prisma.attendance.findUnique({
    where: { employeeId_date: { employeeId: session.employeeId, date: day } },
    select: { id: true, timeIn: true },
  })
  if (existing) {
    return {
      message: `You already timed in today at ${clockTime(existing.timeIn)}.`,
    }
  }

  const { selfieKey, latitude, longitude, accuracy } = validated.data

  await prisma.attendance.create({
    data: {
      employeeId: session.employeeId,
      date: day,
      timeIn: now,
      timeInSelfieKey: selfieKey,
      timeInLatitude: latitude,
      timeInLongitude: longitude,
      timeInAccuracy: accuracy ?? null,
    },
  })

  revalidateAll()
  return { success: true, at: now.toISOString() }
}

// A day can cover several sites, so a report is a row rather than a column.
// Capped because this arrives as one JSON blob from the browser.
const MAX_REPORTS_PER_PUNCH = 15

const ReportSchema = z.object({
  type: z.enum(["PMS", "SERVICE"]),
  clientId: z.string().min(1),
  branchId: z.string().min(1).nullish(),
  serialNo: z.string().trim().min(1).max(60),
  fileKey: z.string().trim().min(1),
  fileName: z.string().trim().min(1).max(255),
})

const TimeOutSchema = PunchSchema.extend({
  reportNote: z.string().trim().max(2000).optional(),
  reports: z.array(ReportSchema).max(MAX_REPORTS_PER_PUNCH),
})

/** The reports ride in one hidden field as JSON; a malformed blob is no reports. */
function parseReports(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.trim() === "") return []
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function timeOut(
  _state: PunchState,
  formData: FormData
): Promise<PunchState> {
  const session = await verifySession()

  const validated = TimeOutSchema.safeParse({
    selfieKey: formData.get("selfieKey"),
    latitude: numberField(formData.get("latitude")),
    longitude: numberField(formData.get("longitude")),
    accuracy: numberField(formData.get("accuracy")),
    // Read through textField because the note is only rendered on the time-out
    // form, and a null would fail the whole punch over an optional field.
    reportNote: textField(formData.get("reportNote")),
    reports: parseReports(formData.get("reports")),
  })
  if (!validated.success) {
    const fields = validated.error.flatten().fieldErrors
    return {
      message: fields.reports
        ? "One of the reports is incomplete. Go back and check each one has a type, a site, a serial number and a file."
        : "The photo or your location didn't come through. Try timing out again.",
    }
  }

  const now = new Date()

  const existing = await openPunch(session.employeeId, now)
  if (!existing.ok) return { message: existing.message }

  const { selfieKey, latitude, longitude, accuracy, reportNote, reports } =
    validated.data

  // Site ids come from the browser, so they're checked rather than trusted. A
  // branch has to actually belong to the client it's filed under — otherwise a
  // report can be attributed to a site that pairing never existed at, and the
  // office would chase the wrong client for it.
  if (reports.length > 0) {
    const clientIds = [...new Set(reports.map((report) => report.clientId))]
    const branchIds = [
      ...new Set(reports.map((report) => report.branchId).filter(Boolean)),
    ] as string[]

    const [clients, branches] = await Promise.all([
      prisma.client.findMany({
        where: { id: { in: clientIds } },
        select: { id: true },
      }),
      branchIds.length
        ? prisma.branch.findMany({
            where: { id: { in: branchIds } },
            select: { id: true, clientId: true },
          })
        : Promise.resolve([]),
    ])

    const knownClients = new Set(clients.map((client) => client.id))
    const branchOwner = new Map(
      branches.map((branch) => [branch.id, branch.clientId])
    )

    for (const report of reports) {
      if (!knownClients.has(report.clientId)) {
        return { message: "One of the reports names a client that no longer exists." }
      }
      if (report.branchId && branchOwner.get(report.branchId) !== report.clientId) {
        return {
          message: "One of the reports names a branch that isn't part of that client.",
        }
      }
    }
  }

  // The punch and its reports go in together: a time out recorded without the
  // paperwork it was submitted with would leave the employee thinking the
  // reports were filed when they weren't.
  await prisma.$transaction([
    prisma.attendance.update({
      where: { id: existing.id },
      data: {
        timeOut: now,
        timeOutSelfieKey: selfieKey,
        timeOutLatitude: latitude,
        timeOutLongitude: longitude,
        timeOutAccuracy: accuracy ?? null,
        reportNote: reportNote || null,
      },
    }),
    prisma.attendanceReport.createMany({
      data: reports.map((report) => ({
        attendanceId: existing.id,
        type: report.type,
        clientId: report.clientId,
        branchId: report.branchId || null,
        serialNo: report.serialNo,
        fileKey: report.fileKey,
        fileName: report.fileName,
      })),
    }),
  ])

  revalidateAll()
  return { success: true, at: now.toISOString() }
}

// ---------------------------------------------------------------------------
// One person's record
// ---------------------------------------------------------------------------

const EMPTY_SUMMARY: StaffAttendanceSummary = {
  days: 0,
  openDays: 0,
  minutes: 0,
  overtimeHours: 0,
  firstDay: null,
  lastDay: null,
  truncated: false,
}

/**
 * Every day this person has clocked, newest first, for their staff record.
 *
 * Fetched on demand rather than shipped with the staff list: that list is every
 * employee, and a punch history grows forever — sending both together is the
 * O(employees x days) payload that leaves a phone on a blank screen.
 */
export async function listEmployeeAttendance(
  employeeId: string,
  page = 1
): Promise<StaffAttendancePage> {
  const session = await requireAdmin()
  const empty = {
    days: [],
    total: 0,
    page: 1,
    pages: 1,
    summary: EMPTY_SUMMARY,
  }
  if (!session || !employeeId) return empty

  const since = new Date()
  since.setDate(since.getDate() - STAFF_SUMMARY_DAYS)

  // Three narrow reads. The first two are dates only — enough to work out which
  // days exist and how to page them, without touching the rows behind them.
  const [punchDates, scheduleDates, spans] = await Promise.all([
    prisma.attendance.findMany({
      where: { employeeId },
      select: { date: true },
      orderBy: { date: "desc" },
      take: STAFF_DAY_LIMIT,
    }),
    prisma.schedule.findMany({
      where: {
        assignments: { some: { employeeId } },
        status: { not: "CANCELLED" },
      },
      select: { date: true },
      orderBy: { date: "desc" },
      take: STAFF_DAY_LIMIT,
    }),
    // Spans only, capped to a year — the totals are derived here and the
    // browser is sent four numbers, never the rows they came from.
    prisma.attendance.findMany({
      where: { employeeId, date: { gte: since } },
      select: {
        date: true,
        timeIn: true,
        timeOut: true,
        overtime: { select: { hours: true, approvedHours: true, status: true } },
      },
      orderBy: { date: "asc" },
    }),
  ])

  // A day counts if it was worked *or* assigned. Several jobs on one date
  // collapse to one day, which is why this is a set.
  const allDays = [
    ...new Set(
      [...punchDates, ...scheduleDates].map((row) =>
        attendanceDay(row.date).getTime()
      )
    ),
  ].sort((a, b) => b - a)

  const total = allDays.length
  if (total === 0) return empty

  const summary = spans.reduce<StaffAttendanceSummary>(
    (totals, span) => {
      const minutes = workedMinutes(span.timeIn, span.timeOut)
      return {
        days: totals.days + 1,
        openDays: totals.openDays + (minutes == null ? 1 : 0),
        minutes: totals.minutes + (minutes ?? 0),
        overtimeHours:
          totals.overtimeHours +
          (span.overtime?.status === "APPROVED"
            ? Number(span.overtime.approvedHours ?? span.overtime.hours)
            : 0),
        firstDay: totals.firstDay ?? span.date.toISOString(),
        lastDay: span.date.toISOString(),
        truncated: totals.truncated,
      }
    },
    { ...EMPTY_SUMMARY }
  )
  summary.overtimeHours = Math.round(summary.overtimeHours * 100) / 100

  // punchDates is newest-first, so the last one is the earliest punch on
  // record. If it predates the window, the totals above are a slice of a longer
  // history and the caption has to say so.
  const oldestPunch = punchDates.at(-1)?.date
  summary.truncated = oldestPunch
    ? attendanceDay(oldestPunch) < attendanceDay(since)
    : false

  const pages = Math.max(1, Math.ceil(total / STAFF_ATTENDANCE_PAGE_SIZE))
  const at = Math.min(Math.max(1, Math.trunc(page)), pages)

  const pageDays = allDays.slice(
    (at - 1) * STAFF_ATTENDANCE_PAGE_SIZE,
    at * STAFF_ATTENDANCE_PAGE_SIZE
  )

  // Bounded by the fifteen days actually on screen, not by the window they sit
  // in — one long gap between punches would otherwise pull in everything
  // between the two ends.
  const from = new Date(pageDays.at(-1)!)
  const to = nextDay(new Date(pageDays[0]))

  const [records, schedules] = await Promise.all([
    prisma.attendance.findMany({
      where: { employeeId, date: { gte: from, lt: to } },
      select: ATTENDANCE_DETAIL_SELECT,
      orderBy: { date: "desc" },
    }),
    prisma.schedule.findMany({
      where: {
        assignments: { some: { employeeId } },
        status: { not: "CANCELLED" },
        date: { gte: from, lt: to },
      },
      select: {
        id: true,
        date: true,
        startTime: true,
        endTime: true,
        status: true,
        workTypes: true,
        client: { select: { name: true } },
        branch: { select: { name: true } },
      },
      orderBy: { startTime: "asc" },
    }),
  ])

  const punchByDay = new Map(
    records.map((record) => [attendanceDay(record.date).getTime(), record])
  )
  const jobsByDay = new Map<number, ScheduledJob[]>()
  for (const schedule of schedules) {
    const key = attendanceDay(schedule.date).getTime()
    const list = jobsByDay.get(key) ?? []
    list.push({
      id: schedule.id,
      clientName: schedule.client.name,
      branchName: schedule.branch?.name ?? null,
      startTime: schedule.startTime.toISOString(),
      endTime: schedule.endTime.toISOString(),
      // CANCELLED is filtered out above, so it can't reach the narrower type.
      status: schedule.status as ScheduledJob["status"],
      workTypes: schedule.workTypes,
    })
    jobsByDay.set(key, list)
  }

  return {
    days: pageDays.map((key) => {
      const record = punchByDay.get(key)
      return {
        date: new Date(key).toISOString(),
        attendance: record ? toAttendanceRow(record) : null,
        scheduled: jobsByDay.get(key) ?? [],
      }
    }),
    total,
    page: at,
    pages,
    summary,
  }
}

// ---------------------------------------------------------------------------
// Overtime
// ---------------------------------------------------------------------------

export type OvertimeState =
  | { message?: string; success?: boolean }
  | undefined

export async function requestOvertime(
  _state: OvertimeState,
  formData: FormData
): Promise<OvertimeState> {
  const session = await verifySession()

  const schema = z.object({
    hours: z.coerce
      .number()
      .positive("Enter how many extra hours you expect.")
      .max(MAX_OVERTIME_HOURS, `That's more than ${MAX_OVERTIME_HOURS} hours.`),
    reason: z.string().trim().min(1, "Say why the job needs longer."),
  })

  const validated = schema.safeParse({
    hours: formData.get("hours"),
    reason: formData.get("reason"),
  })
  if (!validated.success) {
    return {
      message:
        validated.error.flatten().fieldErrors.hours?.[0] ??
        validated.error.flatten().fieldErrors.reason?.[0] ??
        "Check the request and try again.",
    }
  }

  const now = new Date()

  // Same reason as timing out: at 05:30 on a shift that began at 22:00 the row
  // is filed under yesterday, and the last hour of that shift is exactly when
  // this is meant to be reachable.
  const open = await openPunch(session.employeeId, now)
  if (!open.ok) return { message: open.message }

  const attendance = await prisma.attendance.findUnique({
    where: { id: open.id },
    select: { id: true, timeOut: true, overtime: { select: { id: true } } },
  })
  if (!attendance) return { message: "Time in first, then request overtime." }

  // Measured against the day the shift *started*, so an overnight shift's end
  // time is still found after midnight.
  const shift = await shiftForDay(session.employeeId, open.date)

  // The window is re-checked here rather than trusted from the browser. A
  // disabled button is a courtesy; this is the rule.
  const gate = overtimeGate({
    shiftEndsAt: shift?.endsAt ?? null,
    now,
    isWorking: !attendance.timeOut,
    alreadyRequested: Boolean(attendance.overtime),
  })

  if (gate.state !== "open") {
    const reason: Record<typeof gate.state, string> = {
      "no-shift": "There's no scheduled shift today to extend.",
      early: `Overtime can only be requested in the last hour of your shift.`,
      closed:
        "Your shift has already ended. Ask the office to record the extra hours.",
      requested: "You've already requested overtime today.",
      "not-working": "You're not on the clock.",
    }
    return { message: reason[gate.state] }
  }

  const { hours, reason } = validated.data

  await prisma.overtimeRequest.create({
    data: {
      attendanceId: attendance.id,
      employeeId: session.employeeId,
      hours,
      reason,
      shiftEndsAt: shift!.endsAt,
    },
  })

  const employee = await prisma.employee.findUnique({
    where: { id: session.employeeId },
    select: { firstName: true, lastName: true },
  })

  await notifyReviewers({
    type: "OVERTIME_REQUESTED",
    title: "Overtime requested",
    body: `${employee?.firstName} ${employee?.lastName} asked for ${hours}h past ${clockTime(shift!.endsAt)}.`,
    destination: "attendance",
  })

  revalidateAll()
  return { success: true }
}

export type OvertimeReviewState =
  | { message?: string; success?: boolean }
  | undefined

/**
 * The office's answer to a request. Approved hours are what the timesheet adds
 * on top of the worked span, so this is the only thing standing between a
 * request and payroll — hence the decision, the reviewer and the time are all
 * written together and never overwritten once set.
 */
export async function reviewOvertime(
  _state: OvertimeReviewState,
  formData: FormData
): Promise<OvertimeReviewState> {
  const session = await requireAdmin()
  if (!session) {
    return { message: "You don't have permission to decide overtime." }
  }

  const schema = z.object({
    id: z.string().min(1),
    decision: z.enum(["APPROVED", "REJECTED"]),
    reviewNote: z.string().trim().max(1000).optional(),
    // What the office is actually granting. Absent means "as requested"; the
    // field is only ever sent when an administrator changed the number.
    approvedHours: z
      .number()
      .positive("Approved hours have to be more than zero.")
      .max(MAX_OVERTIME_HOURS, `That's more than ${MAX_OVERTIME_HOURS} hours.`)
      .optional(),
  })

  const validated = schema.safeParse({
    id: formData.get("id"),
    decision: formData.get("decision"),
    reviewNote: textField(formData.get("reviewNote")),
    approvedHours: numberField(formData.get("approvedHours")),
  })
  if (!validated.success) {
    // Name the field. "That decision isn't valid" sent whoever hit this
    // looking at the decision, which was the one thing that was fine.
    const fields = validated.error.flatten().fieldErrors
    return {
      message:
        fields.approvedHours?.[0] ??
        fields.reviewNote?.[0] ??
        fields.decision?.[0] ??
        "That decision couldn't be recorded. Reload the page and try again.",
    }
  }

  const { id, decision, reviewNote, approvedHours } = validated.data

  // Same rule as a rejected liquidation: "no" without a reason is what the
  // employee ends up phoning the office about.
  if (decision === "REJECTED" && !reviewNote) {
    return { message: "Add a reason when rejecting overtime." }
  }

  const existing = await prisma.overtimeRequest.findUnique({
    where: { id },
    select: {
      status: true,
      hours: true,
      employeeId: true,
      attendance: { select: { date: true } },
    },
  })
  if (!existing) return { message: "That request no longer exists." }
  if (existing.status !== "PENDING") {
    return {
      message: `This request was already ${existing.status.toLowerCase()}.`,
    }
  }

  const requested = Number(existing.hours)
  // Only stored when it differs, so `approvedHours == null` keeps meaning
  // "granted as asked" rather than becoming a copy of `hours` on every row.
  const granted =
    decision === "APPROVED" && approvedHours != null && approvedHours !== requested
      ? approvedHours
      : null

  await prisma.overtimeRequest.update({
    where: { id },
    data: {
      status: decision,
      approvedHours: granted,
      reviewedById: session.accountId,
      reviewedAt: new Date(),
      reviewNote: reviewNote || null,
    },
  })

  await notifyEmployee(existing.employeeId, {
    type: "OVERTIME_REQUESTED",
    title: decision === "APPROVED" ? "Overtime approved" : "Overtime rejected",
    body:
      decision === "REJECTED"
        ? `Your ${requested}h request was rejected. ${reviewNote}`
        : granted != null
          ? // Being told a different number was approved is the whole reason
            // this is worth a notification of its own.
            `Your overtime was approved for ${granted}h instead of the ${requested}h you asked for.${reviewNote ? ` ${reviewNote}` : ""}`
          : `Your ${requested}h request was approved.`,
    destination: "attendance",
  })

  revalidateAll()
  return { success: true }
}
