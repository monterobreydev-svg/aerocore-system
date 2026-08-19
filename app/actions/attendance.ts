"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import type { OvertimeStatus, Role } from "@/app/generated/prisma/client"
import { prisma } from "@/lib/db/prisma"
import { canReachEmployee, verifySession } from "@/lib/auth"
import {
  buildObjectKey,
  buildReportKey,
  isAllowedUploadType,
  isR2Configured,
  keySegment,
  MAX_UPLOAD_BYTES,
  presignDownload,
  presignUpload,
  uniqueObjectKey,
} from "@/lib/storage/r2"
import {
  monthFolder,
  REPORT_TYPE_FOLDER,
  reportFileName,
} from "@/lib/documents"
import {
  attendanceDay,
  canPunchWithoutSchedule,
  clockTime,
  cutoffEnd,
  cutoffStart,
  dayLabel,
  MAX_OVERTIME_HOURS,
  MAX_SHIFT_HOURS,
  nextDay,
  overtimeGate,
  shiftEndFor,
  workedMinutes,
  type OvertimeGate,
} from "@/lib/attendance"
import {
  ATTENDANCE_DETAIL_SELECT,
  toAttendanceRow,
} from "@/lib/attendance/query"
import { reverseGeocode } from "@/lib/geocode"
import {
  STAFF_DAY_LIMIT,
  STAFF_SUMMARY_DAYS,
  type ReportType,
  type ScheduledJob,
  type StaffAttendancePage,
  type StaffAttendanceSummary,
} from "@/components/attendance/admin-attendance"
import { notifyEmployee, notifyReviewers } from "@/lib/notifications/notify"
import { closeAbandonedPunches } from "@/lib/attendance/auto-timeout"

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

/** A report ticket also says what the file has been renamed to. */
export type ReportUploadTicket =
  | { ok: true; url: string; key: string; fileName: string }
  | { ok: false; message: string }

/**
 * A short-lived URL to PUT one filed report into storage, under the name and in
 * the folder the office will look for it in.
 *
 * Separate from the selfie ticket below because a report needs four more facts
 * to file itself, and every one of them is re-read from the database here
 * rather than trusted from the browser. The phone sends ids; the name on the
 * file and the path it lands on are composed from the rows those ids point at,
 * so a tampered request can't file a report under a client it wasn't for.
 */
export async function createReportUploadUrl(input: {
  type: ReportType
  clientId: string
  branchId: string | null
  serialNo: string
  filename: string
  contentType: string
  size: number
}): Promise<ReportUploadTicket> {
  await verifySession()
  return reportTicket(input)
}

/**
 * The report ticket itself, for a caller that has already established who is
 * asking. Nothing in the key depends on *which* person filed it — a report is
 * filed under the client, the branch and the month it belongs to — so the only
 * thing the session was ever doing here was the door check.
 */
async function reportTicket(input: {
  type: ReportType
  clientId: string
  branchId: string | null
  serialNo: string
  filename: string
  contentType: string
  size: number
}): Promise<ReportUploadTicket> {
  if (!isR2Configured()) {
    return {
      ok: false,
      message: "File storage isn't configured yet. Ask IT to set up R2.",
    }
  }
  if (!isAllowedUploadType(input.contentType)) {
    return { ok: false, message: "Upload a JPG, PNG, WEBP, HEIC or PDF." }
  }
  if (
    !Number.isFinite(input.size) ||
    input.size <= 0 ||
    input.size > MAX_UPLOAD_BYTES
  ) {
    return { ok: false, message: "Files must be smaller than 10 MB." }
  }

  const serialNo = input.serialNo.trim()
  if (!serialNo) {
    return { ok: false, message: "Enter the report's serial number first." }
  }

  const client = await prisma.client.findUnique({
    where: { id: input.clientId },
    select: { id: true, name: true, acronym: true },
  })
  if (!client) {
    return { ok: false, message: "That client is no longer on file." }
  }

  let branchName: string | null = null
  if (input.branchId) {
    const branch = await prisma.branch.findUnique({
      where: { id: input.branchId },
      select: { name: true, clientId: true },
    })
    // A branch belonging to a different client would file the report in the
    // wrong cabinet, so it's rejected rather than quietly ignored.
    if (!branch || branch.clientId !== client.id) {
      return { ok: false, message: "That branch isn't part of this client." }
    }
    branchName = branch.name
  }

  const fileName = reportFileName({
    serialNo,
    clientName: client.name,
    clientAcronym: client.acronym,
    branchName,
    sourceName: input.filename,
  })

  // Filed under the day the work was done. A shift that ends after midnight is
  // punched under the day it began, and `attendanceDay` is what decides that,
  // so the report lands in the same month as the punch that carries it.
  const day = attendanceDay(new Date())

  const key = await uniqueObjectKey(
    buildReportKey({
      year: day.getFullYear(),
      typeFolder: REPORT_TYPE_FOLDER[input.type],
      clientName: client.name,
      branchName,
      monthFolder: monthFolder(day.getMonth()),
      fileName,
    })
  )

  return {
    ok: true,
    url: await presignUpload(key, input.contentType),
    key,
    fileName,
  }
}

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
  return uploadTicketFor(session.employeeId, kind, filename, contentType, size, serialNo)
}

/** The ticket itself, for whoever has already been identified. */
async function uploadTicketFor(
  employeeId: string,
  kind: "time-in" | "time-out" | "report",
  filename: string,
  contentType: string,
  size: number,
  serialNo?: string
): Promise<UploadTicket> {

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
    where: { id: employeeId },
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

/**
 * The place names for a punch's two positions.
 *
 * Asked for separately from the record itself, and only when the detail dialog
 * is opened: the day log is a list of everyone who punched, and resolving two
 * addresses per row would turn opening it into dozens of outbound calls for
 * addresses nobody asked to see. Cached in the database after the first look
 * — see lib/geocode.
 *
 * Admin-side only, matching where this dialog is used. An address is a
 * meaningfully softer piece of information than a coordinate — "Brgy. San
 * Isidro, Cabuyao" is legible to anyone, where a lat/long is not — so it is
 * gated at least as tightly as the punch it describes.
 */
export async function getPunchPlaces(
  points: { latitude: number; longitude: number }[]
): Promise<(string | null)[]> {
  const session = await verifySession()
  if (session.role !== "DIRECTOR" && session.role !== "ADMINISTRATOR") {
    return points.map(() => null)
  }

  // Two per punch. A caller asking for more than a handful is not the dialog.
  if (points.length === 0 || points.length > 4) return points.map(() => null)

  const valid = points.every(
    (point) =>
      Number.isFinite(point.latitude) &&
      Number.isFinite(point.longitude) &&
      Math.abs(point.latitude) <= 90 &&
      Math.abs(point.longitude) <= 180
  )
  if (!valid) return points.map(() => null)

  try {
    return await reverseGeocode(points)
  } catch {
    // The address is a convenience laid over the coordinates; never a reason
    // for the dialog to fail.
    return points.map(() => null)
  }
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
  return listClientsForReports()
}

/** The list itself, for a caller that has already checked who is asking. */
async function listClientsForReports(): Promise<ReportClient[]> {
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
  return branchesForClient(clientId)
}

async function branchesForClient(clientId: string) {
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

/**
 * Whoever the punch is being recorded for.
 *
 * A punch can arrive two ways: from someone signed into their own account, or
 * from the shared phone on the kiosk where a person typed their username. Both
 * end here, with the same rules applied to the same fields — the difference is
 * only in how the person was identified, which is settled before this runs.
 */
export type PunchActor = { employeeId: string; role: Role }

/**
 * The time-in rule, once.
 *
 * Deliberately not reading the session: it is called both by the signed-in
 * action below and by the kiosk. Two copies of "may this person punch" is how
 * the two screens end up disagreeing about somebody's day.
 */
async function punchIn(
  actor: PunchActor,
  formData: FormData
): Promise<PunchState> {
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
  // to check against. Admin-side roles are exempt — see
  // canPunchWithoutSchedule for why office hours can't work that way.
  const shift = await shiftForDay(actor.employeeId, day)
  if (!shift && !canPunchWithoutSchedule(actor.role)) {
    return {
      message:
        "You have no shift scheduled today, so you can't time in. Contact the office if that's wrong.",
    }
  }

  const existing = await prisma.attendance.findUnique({
    where: { employeeId_date: { employeeId: actor.employeeId, date: day } },
    select: { id: true, timeIn: true },
  })
  if (existing) {
    return {
      message: `Already timed in today at ${clockTime(existing.timeIn)}.`,
    }
  }

  const { selfieKey, latitude, longitude, accuracy } = validated.data

  await prisma.attendance.create({
    data: {
      employeeId: actor.employeeId,
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

export async function timeIn(
  _state: PunchState,
  formData: FormData
): Promise<PunchState> {
  return punchIn(await verifySession(), formData)
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

/**
 * The time-out rule, once — see punchIn for why this doesn't read the session.
 */
async function punchOut(
  actor: PunchActor,
  formData: FormData
): Promise<PunchState> {
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

  const existing = await openPunch(actor.employeeId, now)
  if (!existing.ok) return { message: existing.message }

  const { selfieKey, latitude, longitude, accuracy, reportNote, reports } =
    validated.data

  // Site ids come from the browser, so they're checked rather than trusted. A
  // branch has to actually belong to the client it's filed under — otherwise a
  // report can be attributed to a site that pairing never existed at, and the
  // office would chase the wrong client for it.
  // Names to rebuild each report's filename from, filled in by the validation
  // pass below. The browser sends one too, but it is a label for the list on
  // the way out — what gets stored is composed here, from the rows.
  // Name *and* acronym: the filename is composed from both, and the acronym is
  // as much a fact of the client row as the name is.
  let clientsById = new Map<string, { name: string; acronym: string | null }>()
  let branchNames = new Map<string, string>()

  if (reports.length > 0) {
    const clientIds = [...new Set(reports.map((report) => report.clientId))]
    const branchIds = [
      ...new Set(reports.map((report) => report.branchId).filter(Boolean)),
    ] as string[]

    const [clients, branches] = await Promise.all([
      prisma.client.findMany({
        where: { id: { in: clientIds } },
        select: { id: true, name: true, acronym: true },
      }),
      branchIds.length
        ? prisma.branch.findMany({
            where: { id: { in: branchIds } },
            select: { id: true, name: true, clientId: true },
          })
        : Promise.resolve([]),
    ])

    const knownClients = new Set(clients.map((client) => client.id))
    const branchOwner = new Map(
      branches.map((branch) => [branch.id, branch.clientId])
    )
    clientsById = new Map(
      clients.map((client) => [
        client.id,
        { name: client.name, acronym: client.acronym },
      ])
    )
    branchNames = new Map(branches.map((branch) => [branch.id, branch.name]))

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
      data: reports.map((report) => {
        const branchId = report.branchId || null
        const client = clientsById.get(report.clientId)
        const branchName = branchId ? (branchNames.get(branchId) ?? null) : null

        return {
          attendanceId: existing.id,
          type: report.type,
          clientId: report.clientId,
          branchId,
          serialNo: report.serialNo,
          fileKey: report.fileKey,
          // Recomposed from the client and branch rows rather than taken from
          // the request. The upload was named the same way, so these agree —
          // but only one of the two is a fact the browser can't rewrite.
          fileName: client
            ? reportFileName({
                serialNo: report.serialNo,
                clientName: client.name,
                clientAcronym: client.acronym,
                branchName,
                sourceName: report.fileName,
              })
            : report.fileName,
        }
      }),
    }),
  ])

  revalidateAll()
  return { success: true, at: now.toISOString() }
}

export async function timeOut(
  _state: PunchState,
  formData: FormData
): Promise<PunchState> {
  return punchOut(await verifySession(), formData)
}

// ---------------------------------------------------------------------------
// The shared phone
//
// Most of the crew never sign in. One person carries a phone to the site, and
// everybody punches on it by typing their username — no password, because a
// password on a borrowed phone is either shared or forgotten, and neither is
// worth the friction for people whose real proof is standing in front of the
// camera.
//
// What actually establishes who punched is the same as it has always been: a
// photograph taken by the app at that moment, and the position the device
// reported. A username is how the record is addressed, not how it is proven —
// which is why this is safe to leave open, and why the rules below are the
// same ones the signed-in path runs.
// ---------------------------------------------------------------------------

/**
 * How far back the kiosk looks for a decision on somebody's overtime.
 *
 * The office usually answers the same day, but a request filed at 18:00 is
 * often reviewed the next morning — by which time the person who asked is
 * standing at the gate about to time in. Three days covers that and a weekend
 * without turning the kiosk into a history screen.
 */
const KIOSK_OVERTIME_DAYS = 3

/** The answer to somebody's last overtime request, for the kiosk to show. */
export type KioskOvertimeRequest = {
  status: OvertimeStatus
  /** What was asked for. */
  hours: number
  /** What the office granted. Null while it is still pending. */
  approvedHours: number | null
  reviewNote: string | null
  reviewedAt: string | null
  /** The day the request was filed, so an old answer says which day it is for. */
  requestedAt: string
}

/** What the kiosk knows about a person after they type their name. */
export type KioskWho =
  | { ok: false; message: string }
  | {
      ok: true
      name: string
      /** Where they are in the day, so the kiosk shows one button, not three. */
      state: "out" | "in" | "done"
      timeIn: string | null
      timeOut: string | null
      shiftEndsAt: string | null
      /** Whether an overtime request may be filed right now, and why not. */
      overtime: OvertimeGate
      overtimeRequested: boolean
      /**
       * Their last request and what became of it.
       *
       * The kiosk could file overtime but never told anyone the answer — the
       * crew asked for hours into a machine that then said nothing, and had to
       * ring the office to find out whether they had been granted. Carried
       * separately from `overtimeRequested`, which is about *this* punch and
       * decides whether the button is available.
       */
      overtimeRequest: KioskOvertimeRequest | null
    }

/**
 * Resolve a typed username to the person it belongs to.
 *
 * Exact match, case included: the column is unique and Postgres compares
 * case-sensitively, so "JuanD" and "juand" are different people as far as this
 * is concerned. Mobile keyboards capitalise the first letter by default, which
 * is why the field that feeds this turns autocapitalise off.
 *
 * A deactivated account is refused in the same words as a wrong name. Someone
 * dismissed on Friday should not be able to confirm they still exist in the
 * system by typing their name into a phone at the gate.
 */
async function resolveUsername(raw: FormDataEntryValue | null) {
  const username = typeof raw === "string" ? raw.trim() : ""
  if (!username) {
    return { ok: false as const, message: "Type your username first." }
  }

  const account = await prisma.userAccount.findUnique({
    where: { username },
    select: {
      isActive: true,
      employeeId: true,
      role: true,
      employee: { select: { firstName: true, lastName: true } },
    },
  })

  if (!account || !account.isActive) {
    return {
      ok: false as const,
      message: `No active account for "${username}". Check the spelling — capitals count.`,
    }
  }

  return {
    ok: true as const,
    employeeId: account.employeeId,
    role: account.role,
    name: `${account.employee.firstName} ${account.employee.lastName}`,
  }
}

/**
 * Who this is and what they can do right now.
 *
 * Everything the kiosk needs to decide which single button to show, so the
 * person in front of it is never asked to work out whether they are timing in
 * or out.
 */
export async function kioskWhoIs(username: string): Promise<KioskWho> {
  const who = await resolveUsername(username)
  if (!who.ok) return who

  // Settle their own abandoned punches before answering. Someone who forgot to
  // time out last night would otherwise be told they are still on the clock and
  // offered a "Time out" button for a shift that ended sixteen hours ago —
  // and this is the screen where that gets noticed.
  await closeAbandonedPunches(who.employeeId)

  const now = new Date()
  const day = attendanceDay(now)

  const since = new Date(day)
  since.setDate(since.getDate() - KIOSK_OVERTIME_DAYS)

  const [open, todayRow, shift, lastOvertime] = await Promise.all([
    prisma.attendance.findFirst({
      where: {
        employeeId: who.employeeId,
        timeOut: null,
        timeIn: { gte: new Date(now.getTime() - MAX_SHIFT_HOURS * 3_600_000) },
      },
      orderBy: { timeIn: "desc" },
      select: { timeIn: true, date: true, overtime: { select: { id: true } } },
    }),
    prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId: who.employeeId, date: day } },
      select: { timeIn: true, timeOut: true, overtime: { select: { id: true } } },
    }),
    shiftForDay(who.employeeId, day),
    // Their last request, whichever punch it hangs off — a decision made this
    // morning is about last night's shift, and that row is filed under
    // yesterday.
    prisma.overtimeRequest.findFirst({
      where: { employeeId: who.employeeId, requestedAt: { gte: since } },
      orderBy: { requestedAt: "desc" },
      select: {
        status: true,
        hours: true,
        approvedHours: true,
        reviewNote: true,
        reviewedAt: true,
        requestedAt: true,
      },
    }),
  ])

  // An overnight shift is filed under the day it began, so the live punch —
  // not today's row — is what says whether somebody is still on the clock.
  const state = open ? "in" : todayRow?.timeOut ? "done" : "out"
  const scheduledEnd = open
    ? ((await shiftForDay(who.employeeId, open.date))?.endsAt ?? null)
    : (shift?.endsAt ?? null)
  // Somebody on the clock with nothing scheduled is working an implied day
  // measured from when they timed in — that is what opens their overtime
  // window and what eventually closes the punch. Off the clock there is no
  // time-in to measure from, so there is nothing to imply.
  const shiftEnd = open ? shiftEndFor(open.timeIn, scheduledEnd) : scheduledEnd
  const requested = Boolean(open?.overtime ?? todayRow?.overtime)

  return {
    ok: true,
    name: who.name,
    state,
    timeIn: (open?.timeIn ?? todayRow?.timeIn)?.toISOString() ?? null,
    timeOut: todayRow?.timeOut?.toISOString() ?? null,
    shiftEndsAt: shiftEnd?.toISOString() ?? null,
    overtime: overtimeGate({
      shiftEndsAt: shiftEnd,
      now,
      isWorking: state === "in",
      alreadyRequested: requested,
    }),
    overtimeRequested: requested,
    overtimeRequest: lastOvertime
      ? {
          status: lastOvertime.status,
          hours: Number(lastOvertime.hours),
          approvedHours:
            lastOvertime.approvedHours === null
              ? null
              : Number(lastOvertime.approvedHours),
          reviewNote: lastOvertime.reviewNote,
          reviewedAt: lastOvertime.reviewedAt?.toISOString() ?? null,
          requestedAt: lastOvertime.requestedAt.toISOString(),
        }
      : null,
  }
}

/** The selfie upload ticket, for someone identified by username. */
export async function kioskUploadUrl(
  username: string,
  kind: "time-in" | "time-out",
  filename: string,
  contentType: string,
  size: number
): Promise<UploadTicket> {
  const who = await resolveUsername(username)
  if (!who.ok) return { ok: false, message: who.message }

  return uploadTicketFor(who.employeeId, kind, filename, contentType, size)
}

export async function kioskTimeIn(
  _state: PunchState,
  formData: FormData
): Promise<PunchState> {
  const who = await resolveUsername(formData.get("username"))
  if (!who.ok) return { message: who.message }

  return punchIn({ employeeId: who.employeeId, role: who.role }, formData)
}

export async function kioskTimeOut(
  _state: PunchState,
  formData: FormData
): Promise<PunchState> {
  const who = await resolveUsername(formData.get("username"))
  if (!who.ok) return { message: who.message }

  return punchOut({ employeeId: who.employeeId, role: who.role }, formData)
}

export async function kioskRequestOvertime(
  _state: OvertimeState,
  formData: FormData
): Promise<OvertimeState> {
  const who = await resolveUsername(formData.get("username"))
  if (!who.ok) return { message: who.message }

  return fileOvertime(who.employeeId, formData)
}

/**
 * Filing the day's paperwork from the shared phone.
 *
 * The crew that did the work is the crew holding this handset, and the report
 * is part of timing out — leaving it to whoever signs in later means it gets
 * filed from memory, or not at all. Keyed by username like every other kiosk
 * call, so an anonymous request can't mint an upload URL.
 */
export async function kioskReportUploadUrl(
  username: string,
  input: {
    type: ReportType
    clientId: string
    branchId: string | null
    serialNo: string
    filename: string
    contentType: string
    size: number
  }
): Promise<ReportUploadTicket> {
  const who = await resolveUsername(username)
  if (!who.ok) return { ok: false, message: who.message }

  return reportTicket(input)
}

/** The sites a report can be filed against, for the kiosk's report form. */
export async function kioskReportClients(
  username: string
): Promise<ReportClient[]> {
  const who = await resolveUsername(username)
  if (!who.ok) return []

  return listClientsForReports()
}

export async function kioskReportBranches(username: string, clientId: string) {
  const who = await resolveUsername(username)
  if (!who.ok || !clientId) return []

  return branchesForClient(clientId)
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
 * One payroll cutoff of this person's record, newest cutoff first.
 *
 * Fetched on demand rather than shipped with the staff list: that list is every
 * employee, and a punch history grows forever — sending both together is the
 * O(employees x days) payload that leaves a phone on a blank screen.
 *
 * `page` counts cutoffs that have something in them, not rows: 1 is their most
 * recent pay period, 2 the one before it. A period is at most sixteen days, so
 * the payload stays bounded whichever one is asked for.
 */
export async function listEmployeeAttendance(
  employeeId: string,
  page = 1
): Promise<StaffAttendancePage> {
  const session = await requireAdmin()
  const now = new Date()
  const empty: StaffAttendancePage = {
    days: [],
    total: 0,
    page: 1,
    pages: 1,
    summary: EMPTY_SUMMARY,
    cutoff: {
      start: cutoffStart(now).toISOString(),
      end: cutoffEnd(now).toISOString(),
      days: 0,
      openDays: 0,
      minutes: 0,
      overtimeHours: 0,
    },
  }
  if (!session || !employeeId) return empty
  // The tab is only reachable from a staff record, but the action takes an id.
  if (!(await canReachEmployee(session.role, employeeId))) return empty

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

  // The pay periods this person actually has days in, newest first. Built off
  // the dates already in hand, so knowing how many pages there are costs no
  // extra query — and a cutoff nobody worked never becomes a page to step past.
  const periods = [
    ...new Set(allDays.map((key) => cutoffStart(new Date(key)).getTime())),
  ].sort((a, b) => b - a)

  const pages = Math.max(1, periods.length)
  const at = Math.min(Math.max(1, Math.trunc(page)), pages)

  const periodStart = new Date(periods[at - 1])
  const periodEnd = cutoffEnd(periodStart)

  // allDays is newest-first already, so filtering keeps that order.
  const pageDays = allDays.filter(
    (key) => key >= periodStart.getTime() && key <= periodEnd.getTime()
  )

  // The cutoff itself is the window — sixteen days at the outside, however wide
  // the gaps between punches inside it.
  const from = periodStart
  const to = nextDay(periodEnd)

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

  // What this cutoff is worth, added up here rather than in the browser: the
  // whole reason to cut the record on the 15th and the end of the month is to
  // read one pay period's hours off it, and that is four numbers, not rows.
  const cutoff = records.reduce(
    (totals, record) => {
      const minutes = workedMinutes(record.timeIn, record.timeOut)
      return {
        ...totals,
        days: totals.days + 1,
        openDays: totals.openDays + (minutes == null ? 1 : 0),
        minutes: totals.minutes + (minutes ?? 0),
        overtimeHours:
          totals.overtimeHours +
          (record.overtime?.status === "APPROVED"
            ? Number(record.overtime.approvedHours ?? record.overtime.hours)
            : 0),
      }
    },
    {
      start: periodStart.toISOString(),
      end: periodEnd.toISOString(),
      days: 0,
      openDays: 0,
      minutes: 0,
      overtimeHours: 0,
    }
  )
  cutoff.overtimeHours = Math.round(cutoff.overtimeHours * 100) / 100

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
    cutoff,
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
  return fileOvertime(session.employeeId, formData)
}

/**
 * Filing the request, once — shared with the kiosk, so the window that decides
 * whether overtime may be asked for is the same one on both.
 */
async function fileOvertime(
  employeeId: string,
  formData: FormData
): Promise<OvertimeState> {
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
  const open = await openPunch(employeeId, now)
  if (!open.ok) return { message: open.message }

  const attendance = await prisma.attendance.findUnique({
    where: { id: open.id },
    select: {
      id: true,
      timeIn: true,
      timeOut: true,
      overtime: { select: { id: true } },
    },
  })
  if (!attendance) return { message: "Time in first, then request overtime." }

  // Measured against the day the shift *started*, so an overnight shift's end
  // time is still found after midnight. With nothing scheduled — which is the
  // ordinary case for admin-side staff — the shift is implied from the punch,
  // so office hours can be extended like anyone else's.
  const shift = await shiftForDay(employeeId, open.date)
  const shiftEndsAt = shiftEndFor(attendance.timeIn, shift?.endsAt ?? null)

  // The window is re-checked here rather than trusted from the browser. A
  // disabled button is a courtesy; this is the rule.
  const gate = overtimeGate({
    shiftEndsAt,
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
      employeeId: employeeId,
      hours,
      reason,
      shiftEndsAt,
    },
  })

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
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
