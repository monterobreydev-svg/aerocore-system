import "server-only"
import { unstable_cache, revalidateTag } from "next/cache"
import { prisma } from "@/lib/db/prisma"
import { Prisma } from "@/app/generated/prisma/client"
import { cutoffEnd, cutoffStart } from "@/lib/attendance"
import {
  holidaysBetween,
  HOLIDAY_QUALIFYING_LOOKBACK_DAYS,
  type PayrollDayInput,
} from "@/lib/payroll"
import { OPEX_ROLES } from "@/lib/opex"
import { dateKey } from "@/lib/schedule"
import {
  labourCostForCutoff,
  mergeLabourCost,
  NO_LABOUR_COST,
  type LabourCost,
  type ScheduledSlice,
} from "@/lib/labour-cost"

// ---------------------------------------------------------------------------
// Reading what the wages were, so they can be split by job
//
// The arithmetic lives next door in index.ts; this is the part that has to go
// to the database for it. Nothing is stored — see the note there — so this runs
// on read, and what it reads has to stay proportional to the work being asked
// about rather than to how long the company has existed.
// ---------------------------------------------------------------------------

/**
 * Whose wages are a job's cost rather than the office's.
 *
 * The exact inverse of OPEX_STAFF. An Engineer can be put on a schedule, but
 * lib/opex has already counted their pay as overhead — charging it to a project
 * as well would bill the same peso twice. Employees with no login are field
 * staff and count.
 */
export const FIELD_STAFF: Prisma.EmployeeWhereInput = {
  NOT: { account: { is: { role: { in: OPEX_ROLES } } } },
}

/** Every cutoff touching the range, oldest first. */
function cutoffsBetween(from: Date, to: Date) {
  const cutoffs: { start: Date; end: Date }[] = []
  let cursor = cutoffStart(from)
  const last = cutoffStart(to)

  // Sixteen days at a time, so a year is twenty-four iterations.
  while (cursor <= last) {
    const start = new Date(cursor)
    const end = cutoffEnd(start)
    cutoffs.push({ start, end })
    cursor = new Date(end)
    cursor.setDate(cursor.getDate() + 1)
  }
  return cutoffs
}

/** One person's share of it, so a project panel can say whose hours those were. */
export type LabourPerson = {
  employeeId: string
  name: string
  cost: LabourCost
}

export type LabourBreakdown = LabourCost & {
  people: LabourPerson[]
}

const NO_BREAKDOWN: LabourBreakdown = { ...NO_LABOUR_COST, people: [] }

/**
 * What every job cost in wages over a span of time.
 *
 * `salesOrderNos` narrows which jobs are *asked about*, not what is read: an
 * employee scheduled on two clients in one day has their pay split between
 * both, so the weight of the job you didn't ask about still has to be known or
 * the job you did ask about is charged for the whole day. Narrowing the read
 * would silently overstate every project that shares a day with another.
 *
 * So the shape is: find whose days are in play, then read those people's days
 * whole.
 */
async function computeLabourCost({
  from,
  to,
  salesOrderNos,
  includeUnscheduled = false,
}: {
  from: Date
  to: Date
  /** Seeds which people matter. Omit to cover every scheduled field employee. */
  salesOrderNos?: string[]
  /**
   * Also take in field staff who were scheduled on nothing at all.
   *
   * They contribute nothing to any job by definition, so the COGS callers
   * leave them out. The OPEX caller must not: a crew member who worked a full
   * month with no schedule against them is a real wage the company paid, and
   * leaving them unseeded would drop that money out of both halves of the
   * accounts — charged to no job and counted as no overhead.
   */
  includeUnscheduled?: boolean
}): Promise<LabourBreakdown> {
  if (salesOrderNos?.length === 0) return NO_BREAKDOWN

  const cutoffs = cutoffsBetween(from, to)
  if (cutoffs.length === 0) return NO_BREAKDOWN

  const windowStart = cutoffs[0].start
  const windowEnd = cutoffs[cutoffs.length - 1].end

  // 1. Who was scheduled on the jobs in question. Ids only — this pass exists
  //    to narrow the roster, not to weigh anything.
  const seeded = includeUnscheduled
    ? await prisma.employee.findMany({
        where: FIELD_STAFF,
        select: { id: true },
      })
    : await prisma.scheduleAssignment.findMany({
        where: {
          employee: FIELD_STAFF,
          schedule: {
            status: { not: "CANCELLED" },
            salesOrderNo: salesOrderNos ? { in: salesOrderNos } : { not: null },
            date: { gte: windowStart, lte: windowEnd },
          },
        },
        select: { employeeId: true },
        distinct: ["employeeId"],
      })

  const employeeIds = seeded.map((row) =>
    "id" in row ? row.id : row.employeeId
  )
  if (employeeIds.length === 0) return NO_BREAKDOWN

  // 2. Those people's whole days — every job they were on, not just the asked
  //    ones. This is the read the note above is about.
  //
  //    Summed in the database rather than in memory. What the arithmetic wants
  //    is minutes per person per day per job, and that is what comes back: one
  //    narrow row per combination instead of one nested Schedule object per
  //    assignment. Two visits to the same job in a day arrive already added
  //    together, and at fifty crew across a year that is the difference between
  //    a few thousand scalars and tens of thousands of hydrated objects.
  const [assignments, staff] = await Promise.all([
    prisma.$queryRaw<
      { employeeId: string; day: Date; salesOrderNo: string; minutes: number }[]
    >`
      SELECT sa."employeeId",
             s."date" AS day,
             s."salesOrderNo",
             SUM(EXTRACT(EPOCH FROM (s."endTime" - s."startTime")) / 60)::int
               AS minutes
      FROM "ScheduleAssignment" sa
      JOIN "Schedule" s ON s."id" = sa."scheduleId"
      WHERE sa."employeeId" IN (${Prisma.join(employeeIds)})
        AND s."status" <> 'CANCELLED'
        AND s."salesOrderNo" IS NOT NULL
        AND s."date" >= ${windowStart}
        AND s."date" <= ${windowEnd}
      GROUP BY sa."employeeId", s."date", s."salesOrderNo"
    `,
    prisma.employee.findMany({
      where: { id: { in: employeeIds } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        hourlyRate: true,
        attendance: {
          where: {
            date: {
              // Reaches back far enough for a holiday on the 1st to know
              // whether the day before it was worked.
              gte: new Date(
                windowStart.getFullYear(),
                windowStart.getMonth(),
                windowStart.getDate() - HOLIDAY_QUALIFYING_LOOKBACK_DAYS
              ),
              lte: windowEnd,
            },
          },
          select: {
            date: true,
            timeIn: true,
            timeOut: true,
            overtime: {
              select: { hours: true, approvedHours: true, status: true },
            },
          },
        },
        payrollAdjustments: {
          where: { cutoffStart: { gte: windowStart, lte: windowEnd } },
          select: { cutoffStart: true, label: true, amount: true },
        },
      },
    }),
  ])

  // 3. Index those rows by person and day, which is how the split reads them.
  const scheduleByEmployee = new Map<string, Map<string, ScheduledSlice[]>>()
  for (const row of assignments) {
    if (row.minutes <= 0) continue

    const byDay =
      scheduleByEmployee.get(row.employeeId) ??
      new Map<string, ScheduledSlice[]>()
    scheduleByEmployee.set(row.employeeId, byDay)

    const key = dateKey(row.day)
    const slices = byDay.get(key) ?? []
    slices.push({ salesOrderNo: row.salesOrderNo, minutes: row.minutes })
    byDay.set(key, slices)
  }

  // 4. A cutoff at a time, because that is the unit payroll pays in.
  let total = NO_LABOUR_COST
  const people: LabourPerson[] = []

  for (const person of staff) {
    let mine = NO_LABOUR_COST
    const hourlyRate = Number(person.hourlyRate)
    const punches: PayrollDayInput[] = person.attendance.map((punch) => ({
      date: punch.date,
      timeIn: punch.timeIn,
      timeOut: punch.timeOut,
      approvedOvertimeHours:
        punch.overtime?.status === "APPROVED"
          ? Number(punch.overtime.approvedHours ?? punch.overtime.hours)
          : 0,
    }))
    const scheduleByDay =
      scheduleByEmployee.get(person.id) ?? new Map<string, ScheduledSlice[]>()

    for (const cutoff of cutoffs) {
      const lookbackFrom = new Date(cutoff.start)
      lookbackFrom.setDate(
        lookbackFrom.getDate() - HOLIDAY_QUALIFYING_LOOKBACK_DAYS
      )

      const inCutoff = punches.filter(
        (punch) => punch.date >= cutoff.start && punch.date <= cutoff.end
      )
      const before = punches.filter(
        (punch) => punch.date >= lookbackFrom && punch.date < cutoff.start
      )
      const adjustments = person.payrollAdjustments.filter(
        (row) => +row.cutoffStart === +cutoff.start
      )

      // Nothing worked, nothing added, and no holiday to qualify: this half of
      // the month cost nothing and there is no arithmetic worth doing.
      if (
        inCutoff.length === 0 &&
        adjustments.length === 0 &&
        before.length === 0
      ) {
        continue
      }

      mine = mergeLabourCost(
        mine,
        labourCostForCutoff({
          hourlyRate,
          days: inCutoff,
          daysBeforeCutoff: before,
          holidaysInCutoff: holidaysBetween(cutoff.start, cutoff.end),
          adjustments: adjustments.map((row) => ({
            label: row.label,
            amount: Number(row.amount),
          })),
          scheduleByDay,
        })
      )
    }

    if (mine.gross === 0) continue
    total = mergeLabourCost(total, mine)
    people.push({
      employeeId: person.id,
      name: `${person.firstName} ${person.lastName}`,
      cost: mine,
    })
  }

  // Biggest contributor first — that is the one anybody checking a job's cost
  // is looking for.
  people.sort((a, b) => b.cost.gross - a.cost.gross)

  return { ...total, people }
}

// ---------------------------------------------------------------------------
// Caching
// ---------------------------------------------------------------------------
//
// The computation above is proportional to (field staff × days in the window),
// because payroll has to be worked out per person per cutoff before any of it
// can be split by job. At three crew that is nothing; at fifty it is tens of
// thousands of rows read every time somebody opens the projects tracker.
//
// It is cached rather than stored. A stored allocation would be a second answer
// that can disagree with the punches behind it — the thing the PayrollRelease
// model refuses to do, and for good reason. A cache is not a second answer: it
// is the same answer, kept until something it was computed from changes.
//
// Two safeguards, because a stale money figure is worse than a slow one:
//
//   the tag       every action that edits a punch, a schedule, an adjustment or
//                 a pay rate clears it, so a correction shows immediately.
//   the interval  a backstop for a write path nobody remembered to tag. Five
//                 minutes bounds how wrong this can be even then, on a page
//                 that is read rather than transacted against.

/** Clear with `revalidateTag(LABOUR_COST_TAG)` after touching any input. */
export const LABOUR_COST_TAG = "labour-cost"

const LABOUR_COST_MAX_AGE_SECONDS = 300

const cachedLabourCost = unstable_cache(
  async (
    fromIso: string,
    toIso: string,
    salesOrderNos: string[] | null,
    includeUnscheduled: boolean
  ) =>
    computeLabourCost({
      from: new Date(fromIso),
      to: new Date(toIso),
      salesOrderNos: salesOrderNos ?? undefined,
      includeUnscheduled,
    }),
  ["labour-cost"],
  { tags: [LABOUR_COST_TAG], revalidate: LABOUR_COST_MAX_AGE_SECONDS }
)

/**
 * What every job cost in wages and employer contributions over a span of time.
 *
 * The cached face of computeLabourCost. Arguments are reduced to primitives
 * first, because they are the cache key: two Dates that mean the same instant
 * must produce the same key, and a list of sales orders in a different order is
 * the same question and should not be a second entry.
 */
export async function labourCostBetween(args: {
  from: Date
  to: Date
  salesOrderNos?: string[]
  includeUnscheduled?: boolean
}): Promise<LabourBreakdown> {
  return cachedLabourCost(
    args.from.toISOString(),
    args.to.toISOString(),
    args.salesOrderNos ? [...new Set(args.salesOrderNos)].sort() : null,
    args.includeUnscheduled ?? false
  )
}

/**
 * Forget everything worked out from wages, punches or schedules.
 *
 * Called by every action that changes one of them. Cheap and deliberately
 * blunt: the alternative is per-cutoff keys that each write path has to reason
 * about, and a write path that reasons wrongly leaves the wrong number on a
 * financial report.
 */
export function revalidateLabourCost() {
  // Two arguments deliberately: the single-argument form is deprecated in this
  // version of Next and only still works while TypeScript errors are being
  // suppressed. "max" is the cache-life profile the entry is re-dated to.
  revalidateTag(LABOUR_COST_TAG, "max")
}
