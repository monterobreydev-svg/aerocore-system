import {
  computePayslip,
  type AdjustmentInput,
  type PayrollDayInput,
} from "@/lib/payroll"
import type { Holiday } from "@/lib/payroll/holidays"
import { dateKey } from "@/lib/schedule"

// ---------------------------------------------------------------------------
// What a job cost in wages
// ---------------------------------------------------------------------------
//
// The other half of lib/opex. That file works out what the admin side costs and
// says so in as many words: "An Employee's day is billable work and belongs to
// a job, not here." This is the job.
//
// A field employee is paid for a day, not for a visit — payroll knows about
// punches and cutoffs, and nothing in it has ever heard of a sales order. What
// ties the two together is the schedule: it already says which job the person
// was sent to and for how long, so it is the only thing that can say how much
// of a day's wage belongs to which project.
//
// So the day's pay is split by SCHEDULED minutes:
//
//   in 8:00, out 17:15, paid ₱1,000
//   scheduled 08:00–09:00 on SO 260001   60 min → 12.5% → ₱125
//   scheduled 10:00–17:00 on SO 260002  420 min → 87.5% → ₱875
//
// Scheduled, not clocked, and that is deliberate. The 09:00–10:00 gap and the
// quarter hour worked past the last job need no rule of their own: only the
// relative weights matter, so time on the clock that belongs to no job is
// carried by the jobs of that day in proportion. Pay is still decided entirely
// by payroll — this only decides whose cost it is.
//
// Nothing here is stored. That is the house rule, argued in the PayrollRelease
// model: "Deliberately not a snapshot of the figures... the arithmetic stays
// live." Correct a punch or fix a schedule and every project's cost follows,
// rather than leaving two numbers in the building that disagree.

/** One job's claim on a day: the sales order, and the minutes booked to it. */
export type ScheduledSlice = {
  salesOrderNo: string
  minutes: number
}

export type LabourCostInput = {
  hourlyRate: number
  /** The employee's punches inside this cutoff. */
  days: PayrollDayInput[]
  /** Punches just before it, read only to qualify a holiday. Never paid. */
  daysBeforeCutoff?: PayrollDayInput[]
  holidaysInCutoff: { date: Date; holiday: Holiday }[]
  /** What the office added or took off by hand this cutoff. */
  adjustments?: AdjustmentInput[]
  /** What they were scheduled on, keyed by local day ("YYYY-MM-DD"). */
  scheduleByDay: Map<string, ScheduledSlice[]>
}

export type LabourCost = {
  /** Sales order number → pesos of wage that belong to it. */
  bySalesOrder: Record<string, number>
  /**
   * Wage with no schedule behind it, and so no job to charge.
   *
   * A day worked with nothing booked on it, and every peso payroll pays that
   * no day owns at all — an unworked regular holiday. It is a real cost with no
   * project, which makes it the company's own overhead: the caller folds it
   * into OPEX beside the admin wages.
   *
   * Worth watching rather than hiding. A number that climbs means field work is
   * happening without being scheduled, and every peso of it is missing from
   * some job's cost.
   */
  unallocated: number
  /**
   * The employee's gross pay across the period, and nothing else.
   *
   * Deliberately only this. The company's own SSS, PhilHealth and Pag-IBIG
   * contributions are a real cost of employing somebody, but they are filed
   * outside this system and are nobody here's figure to compute — a second,
   * uncorroborated set of contribution rates living in the codebase would go
   * stale the first time a circular landed and be believed anyway.
   *
   * Always exactly `sum(bySalesOrder) + unallocated`.
   */
  gross: number
}

/**
 * Divide pesos by weight without losing or inventing a centavo.
 *
 * Money split three ways rarely divides evenly, and rounding each share on its
 * own leaves a total that is a centavo off the wage actually paid. Over a
 * cutoff of daily splits those centavos accumulate into a figure somebody has
 * to explain, so the split is done in whole centavos and the remainder handed
 * to the largest fractions — the standard largest-remainder apportionment.
 *
 * The result always sums to exactly `amount`.
 */
export function splitPesos(amount: number, weights: number[]): number[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  if (weights.length === 0) return []
  if (total <= 0 || amount === 0) return weights.map(() => 0)

  const centavos = Math.round(amount * 100)
  const exact = weights.map((weight) => (centavos * weight) / total)
  const shares = exact.map(Math.floor)
  const spare = centavos - shares.reduce((sum, share) => sum + share, 0)

  // Whoever was rounded down hardest gets the leftovers first.
  const byFraction = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction)

  for (let i = 0; i < spare; i += 1) {
    shares[byFraction[i].index] += 1
  }

  return shares.map((share) => share / 100)
}

/** Adds pesos into the map without letting float noise creep in. */
function credit(into: Record<string, number>, key: string, amount: number) {
  if (amount === 0) return
  into[key] = Math.round(((into[key] ?? 0) + amount) * 100) / 100
}

/**
 * One employee, one cutoff: whose cost their wage was.
 *
 * Follows the same three-part shape `gross` itself has —
 *
 *   Σ(day.total)          paid for days worked   → split by that day's schedule
 *   unworked holiday pay  paid for no day at all → unallocated
 *   adjustment additions  paid for the period    → pro-rata over the above
 *
 * — so the parts add back up to the payslip by construction rather than by
 * hope.
 */
export function labourCostForCutoff(input: LabourCostInput): LabourCost {
  const slip = computePayslip({
    hourlyRate: input.hourlyRate,
    days: input.days,
    daysBeforeCutoff: input.daysBeforeCutoff,
    holidaysInCutoff: input.holidaysInCutoff,
    adjustments: input.adjustments,
  })

  const bySalesOrder: Record<string, number> = {}
  let unallocated = 0

  // `slip.days` is `input.days.map(...)`, so the two stay index-aligned. The
  // dates are read from the *input* rather than from the payslip: the payslip
  // carries them as an ISO string of local midnight, which east of UTC reads as
  // the day before — the same trap computePayslip documents.
  slip.days.forEach((day, index) => {
    if (day.total === 0) return

    const slices = input.scheduleByDay.get(dateKey(input.days[index].date)) ?? []
    const booked = slices.filter((slice) => slice.minutes > 0)

    if (booked.length === 0) {
      unallocated = Math.round((unallocated + day.total) * 100) / 100
      return
    }

    const shares = splitPesos(
      day.total,
      booked.map((slice) => slice.minutes)
    )
    booked.forEach((slice, position) =>
      credit(bySalesOrder, slice.salesOrderNo, shares[position])
    )
  })

  // A regular holiday nobody worked still pays a full day. There is no punch
  // and no schedule, so there is no job it can honestly be charged to.
  const unworkedHolidayPay = slip.unworkedHolidays.reduce(
    (total, holiday) => total + holiday.pay,
    0
  )
  unallocated = Math.round((unallocated + unworkedHolidayPay) * 100) / 100

  // Additions only — an allowance is money the company spent, so it belongs on
  // the job. A deduction is not: a cash advance repaid out of wages is the
  // company taking back money it already lent, and the wage it is withheld from
  // was paid in full. Subtracting it would report the job as cheaper than it
  // was. The same rule lib/opex states for overhead.
  //
  // Spread the way that cutoff's wages were spread, since nothing on the
  // adjustment says which job it was for.
  if (slip.adjustmentAdditions > 0) {
    const jobs = Object.keys(bySalesOrder)
    if (jobs.length === 0) {
      unallocated =
        Math.round((unallocated + slip.adjustmentAdditions) * 100) / 100
    } else {
      const shares = splitPesos(
        slip.adjustmentAdditions,
        jobs.map((job) => bySalesOrder[job])
      )
      jobs.forEach((job, index) => credit(bySalesOrder, job, shares[index]))
    }
  }

  return { bySalesOrder, unallocated, gross: slip.gross }
}

/** Adds one cutoff's answer into a running total across many. */
export function mergeLabourCost(into: LabourCost, next: LabourCost): LabourCost {
  const bySalesOrder = { ...into.bySalesOrder }
  for (const [job, amount] of Object.entries(next.bySalesOrder)) {
    credit(bySalesOrder, job, amount)
  }
  return {
    bySalesOrder,
    unallocated: Math.round((into.unallocated + next.unallocated) * 100) / 100,
    gross: Math.round((into.gross + next.gross) * 100) / 100,
  }
}

export const NO_LABOUR_COST: LabourCost = {
  bySalesOrder: {},
  unallocated: 0,
  gross: 0,
}
