import "server-only"

import { prisma } from "@/lib/db/prisma"
import { autoTimeOut, dayParam, shiftEndFor } from "@/lib/attendance"

// ---------------------------------------------------------------------------
// Closing the punches nobody closed
// ---------------------------------------------------------------------------
//
// A punch left open is not a neutral thing. It pays nothing, so the day reads
// as unworked on the payslip; it keeps the kiosk saying "on the clock" the next
// morning, so the person cannot time in; and it sits in the day log looking
// like somebody is still on site hours after the van got back.
//
// So a shift that ends at 17:00 gives an hour to close it properly — with the
// selfie and the position that make a punch evidence — and after that the
// system closes it at 17:00 anyway. Approved overtime moves both: two hours
// granted means the stamp is 19:00 and the sweep waits until 20:00.
//
// There is no scheduler in this app, and this deliberately does not need one.
// The stamp is computed from the schedule, not from the clock, so running the
// sweep late produces exactly the same row as running it on time — which means
// it can simply run whenever the app is used, and a real cron calling
// /api/attendance/auto-timeout is an optimisation rather than a requirement.
//
// Every punch is closable. A scheduled shift supplies its own end; a punch
// with nothing scheduled — the ordinary case for admin-side staff, who keep no
// roster — implies one nine hours from timing in, which is the same ordinary
// day payroll pays by. See `shiftEndFor`.

/**
 * How far back to look for punches to close.
 *
 * Anything older is a data-entry problem for the office, not something to
 * silently stamp weeks after the fact. It also keeps the query small: this runs
 * on ordinary page loads.
 */
const SWEEP_DAYS = 14

/** One closed punch, for whoever wants to report what just happened. */
export type ClosedPunch = {
  attendanceId: string
  employeeId: string
  timeOut: Date
}

/**
 * Close every abandoned punch that has fallen due.
 *
 * Scoped to one person when the caller only cares about them — the kiosk
 * asking "who is this and what can they do" wants their own row settled before
 * it answers, and has no business sweeping the whole company to do it.
 */
export async function closeAbandonedPunches(
  employeeId?: string
): Promise<ClosedPunch[]> {
  const now = new Date()
  const since = new Date(now)
  since.setDate(since.getDate() - SWEEP_DAYS)

  const open = await prisma.attendance.findMany({
    where: {
      timeOut: null,
      timeIn: { gte: since },
      ...(employeeId ? { employeeId } : {}),
    },
    select: {
      id: true,
      employeeId: true,
      date: true,
      timeIn: true,
      overtime: {
        select: { status: true, hours: true, approvedHours: true },
      },
    },
  })
  if (open.length === 0) return []

  // The scheduled end for each open punch, in one query rather than one per
  // row. A day can hold several jobs and they are one shift for attendance —
  // clock in for the first, out after the last — so the latest end wins.
  const schedules = await prisma.schedule.findMany({
    where: {
      assignments: {
        some: { employeeId: { in: open.map((row) => row.employeeId) } },
      },
      date: { in: open.map((row) => row.date) },
      status: { not: "CANCELLED" },
    },
    select: {
      date: true,
      endTime: true,
      assignments: { select: { employeeId: true } },
    },
  })

  const endsAt = new Map<string, Date>()
  for (const schedule of schedules) {
    for (const assignment of schedule.assignments) {
      const key = `${assignment.employeeId}|${dayParam(schedule.date)}`
      const known = endsAt.get(key)
      if (!known || schedule.endTime > known) endsAt.set(key, schedule.endTime)
    }
  }

  const closed: ClosedPunch[] = []

  for (const row of open) {
    // Scheduled end where there is one; otherwise the nine hours the punch
    // implies. Admin-side staff keep no roster, so before this their punches
    // were the one kind nothing could ever close — a forgotten time-out on a
    // Friday afternoon stayed open, and the day paid nothing.
    const shiftEndsAt = shiftEndFor(
      row.timeIn,
      endsAt.get(`${row.employeeId}|${dayParam(row.date)}`) ?? null
    )

    // Only overtime the office actually granted extends the shift. A request
    // still pending, or refused, moves nothing.
    const approvedOvertimeHours =
      row.overtime?.status === "APPROVED"
        ? Number(row.overtime.approvedHours ?? row.overtime.hours)
        : 0

    const { closesAt, dueAt } = autoTimeOut({
      shiftEndsAt,
      approvedOvertimeHours,
    })
    if (now < dueAt) continue

    // Guarded on `timeOut: null` rather than by id alone: two sweeps can
    // overlap on a busy afternoon, and the second must not overwrite a punch
    // the person closed properly in between.
    const result = await prisma.attendance.updateMany({
      where: { id: row.id, timeOut: null },
      data: { timeOut: closesAt, autoTimedOut: true },
    })

    if (result.count > 0) {
      closed.push({
        attendanceId: row.id,
        employeeId: row.employeeId,
        timeOut: closesAt,
      })
    }
  }

  return closed
}
