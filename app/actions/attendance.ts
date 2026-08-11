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
  MAX_OVERTIME_HOURS,
  overtimeGate,
} from "@/lib/attendance"
import { notifyReviewers } from "@/lib/notify"

function revalidateAll() {
  revalidatePath("/employee/attendance")
  revalidatePath("/employee")
  revalidatePath("/admin/attendance")
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
  size: number
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
  const suffix = kind === "time-in" ? "in" : kind === "time-out" ? "out" : "report"

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
          { reportKey: key },
        ],
      },
      select: { id: true },
    })
    if (!owned) return null
  }

  return presignDownload(key)
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
    latitude: Number(formData.get("latitude")),
    longitude: Number(formData.get("longitude")),
    accuracy: formData.get("accuracy")
      ? Number(formData.get("accuracy"))
      : undefined,
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

const TimeOutSchema = PunchSchema.extend({
  reportKey: z.string().trim().optional(),
  reportName: z.string().trim().optional(),
  reportNote: z.string().trim().max(2000).optional(),
})

export async function timeOut(
  _state: PunchState,
  formData: FormData
): Promise<PunchState> {
  const session = await verifySession()

  const validated = TimeOutSchema.safeParse({
    selfieKey: formData.get("selfieKey"),
    latitude: Number(formData.get("latitude")),
    longitude: Number(formData.get("longitude")),
    accuracy: formData.get("accuracy")
      ? Number(formData.get("accuracy"))
      : undefined,
    reportKey: formData.get("reportKey"),
    reportName: formData.get("reportName"),
    reportNote: formData.get("reportNote"),
  })
  if (!validated.success) {
    return {
      message:
        "The photo or your location didn't come through. Try timing out again.",
    }
  }

  const now = new Date()
  const day = attendanceDay(now)

  const existing = await prisma.attendance.findUnique({
    where: { employeeId_date: { employeeId: session.employeeId, date: day } },
    select: { id: true, timeOut: true },
  })
  if (!existing) return { message: "You haven't timed in today." }
  if (existing.timeOut) {
    return { message: `You already timed out at ${clockTime(existing.timeOut)}.` }
  }

  const {
    selfieKey,
    latitude,
    longitude,
    accuracy,
    reportKey,
    reportName,
    reportNote,
  } = validated.data

  await prisma.attendance.update({
    where: { id: existing.id },
    data: {
      timeOut: now,
      timeOutSelfieKey: selfieKey,
      timeOutLatitude: latitude,
      timeOutLongitude: longitude,
      timeOutAccuracy: accuracy ?? null,
      reportKey: reportKey || null,
      reportName: reportName || null,
      reportNote: reportNote || null,
    },
  })

  revalidateAll()
  return { success: true, at: now.toISOString() }
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
  const day = attendanceDay(now)

  const attendance = await prisma.attendance.findUnique({
    where: { employeeId_date: { employeeId: session.employeeId, date: day } },
    select: { id: true, timeOut: true, overtime: { select: { id: true } } },
  })
  if (!attendance) return { message: "Time in first, then request overtime." }

  const shift = await shiftForDay(session.employeeId, day)

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
