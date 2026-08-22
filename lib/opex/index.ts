import type { Prisma, Role } from "@/app/generated/prisma/client"
import {
  computePayslip,
  holidaysBetween,
  HOLIDAY_QUALIFYING_LOOKBACK_DAYS,
  type PayrollDayInput,
} from "@/lib/payroll"

// ---------------------------------------------------------------------------
// Operating expense
// ---------------------------------------------------------------------------
//
// What it costs to run the office, as opposed to what it costs to do a job.
// A job's cost is the receipts liquidated against its S.O. number — that's
// COGS. This is the other half: the wages of the people who are not billed to
// anybody, worked out from the same punches and the same rules payroll uses.
//
// Nothing here is stored, and nothing here changes payroll. It reads what
// payroll would pay and totals it by month; the payroll page remains the only
// place any of it is decided.
//
// Worked out a CUTOFF at a time, not a day at a time. Payroll pays for things
// no punch exists for — a regular holiday nobody worked still pays a full day
// if the person was present the workday before, and an allowance the office
// added belongs to a period rather than to a date. Totalling days would leave
// both out, which for ten regular holidays a year is tens of thousands of
// pesos the company really spent and the sheet never showed. A calendar month
// is exactly two cutoffs, so nothing has to be apportioned to get from one to
// the other.

/**
 * Who counts as an operating cost.
 *
 * The admin side — a Director, an Administrator, an Engineer. They keep no
 * client schedule and their hours are never charged to a sales order, so their
 * pay is the company's own overhead. An Employee's day is billable work and
 * belongs to a job, not here.
 */
export const OPEX_ROLES: Role[] = ["DIRECTOR", "ADMINISTRATOR", "ENGINEER"]

/**
 * The same roster in the shape a Prisma `where` wants.
 *
 * Deliberately NOT filtered on `isActive`. Payroll's own roster excludes
 * deactivated logins because payroll is about who gets paid *now*; this is a
 * report about what months already cost, and a month that has closed must not
 * change. Filtering here would erase a departed manager's wages from every
 * month they worked the day their login was switched off — last year's net
 * profit would move because of something done this morning.
 */
export const OPEX_STAFF: Prisma.EmployeeWhereInput = {
  account: { is: { role: { in: OPEX_ROLES } } },
}

/** One person's punch, in the shape the payroll rules read. */
export type OpexAttendance = PayrollDayInput

/** One hand-made correction, still attached to the cutoff it was made for. */
export type OpexAdjustment = {
  cutoffStart: Date
  label: string
  amount: number
}

/** What one month cost for one person, and what the figure is made of. */
export type OpexFigures = {
  pay: number
  daysWorked: number
  hours: number
  overtimeHours: number
  /** Regular holidays paid without being worked — see the note above. */
  holidayPay: number
  /** Allowances the office added. Deductions are not the company's expense. */
  allowances: number
  /** Which holidays those were, so the breakdown can name them. */
  paidHolidays: { date: string; name: string; pay: number }[]
}

/** One person's contribution to a month's overhead. */
export type OpexPerson = OpexFigures & {
  employeeId: string
  name: string
  role: Role
  position: string
}

/** One line the office typed in: rent, a bill, a permit fee. */
export type OpexExpense = {
  id: string
  spentOn: string
  description: string
  amount: number
  recordedByName: string
}

export type OpexMonth = {
  /** 0–11. */
  month: number
  /** Wages plus everything recorded by hand. */
  total: number
  /** The payroll half on its own, so the two are addable on screen. */
  wages: number
  /**
   * Field crews' wages that no job could be charged for — a day worked with
   * nothing scheduled on it, or a regular holiday nobody worked.
   *
   * Their scheduled hours are a project's cost (see lib/labour-cost); this is
   * the remainder, which belongs to nobody's job and so is the company's own.
   * Kept as its own figure rather than folded into `wages`: a number that
   * climbs month on month means crews are working unscheduled, and every peso
   * of it is missing from some project's COGS.
   */
  unallocatedFieldWages: number
  people: OpexPerson[]
  expenses: OpexExpense[]
}

/**
 * How far back attendance has to be read before the window being reported on.
 *
 * A holiday on the 1st is qualified by the last workday of the month before,
 * so a read that starts on the 1st cannot answer whether it pays.
 */
export const OPEX_LOOKBACK_DAYS = HOLIDAY_QUALIFYING_LOOKBACK_DAYS

function centavos(value: number) {
  return Math.round(value * 100) / 100
}

/** The two cutoffs a calendar month is made of. */
function cutoffsOf(year: number, month: number) {
  return [
    { start: new Date(year, month, 1), end: new Date(year, month, 15) },
    { start: new Date(year, month, 16), end: new Date(year, month + 1, 0) },
  ]
}

const EMPTY: OpexFigures = {
  pay: 0,
  daysWorked: 0,
  hours: 0,
  overtimeHours: 0,
  holidayPay: 0,
  allowances: 0,
  paidHolidays: [],
}

/**
 * What one admin-side person cost in one month.
 *
 * `computePayslip` per cutoff, then the two added together. Its `gross` is
 * what the company pays before anything is withheld — basic, overtime, night
 * differential, holiday and rest-day premiums, holidays paid but not worked,
 * and any allowance added by hand. Deductions are deliberately not subtracted:
 * SSS and the rest come out of the employee's pay, not out of the company's
 * pocket, so taking them off would understate what the office spends.
 */
export function opexForMonth(
  year: number,
  month: number,
  attendance: OpexAttendance[],
  adjustments: OpexAdjustment[],
  hourlyRate: number
): OpexFigures {
  let figures: OpexFigures = { ...EMPTY, paidHolidays: [] }

  for (const cutoff of cutoffsOf(year, month)) {
    const lookbackFrom = new Date(cutoff.start)
    lookbackFrom.setDate(lookbackFrom.getDate() - OPEX_LOOKBACK_DAYS)

    const inCutoff = attendance.filter(
      (punch) => punch.date >= cutoff.start && punch.date <= cutoff.end
    )
    const before = attendance.filter(
      (punch) => punch.date >= lookbackFrom && punch.date < cutoff.start
    )
    const forCutoff = adjustments.filter(
      (row) => +row.cutoffStart === +cutoff.start
    )

    // Nothing worked, nothing added, and no holiday to qualify: this half of
    // the month cost nothing and there is no arithmetic worth doing.
    if (inCutoff.length === 0 && forCutoff.length === 0 && before.length === 0) {
      continue
    }

    const slip = computePayslip({
      hourlyRate,
      days: inCutoff,
      daysBeforeCutoff: before,
      holidaysInCutoff: holidaysBetween(cutoff.start, cutoff.end),
      adjustments: forCutoff,
    })

    figures = {
      pay: centavos(figures.pay + slip.gross),
      daysWorked: figures.daysWorked + slip.daysWorked,
      hours: centavos(figures.hours + slip.regularHours + slip.nightHours),
      overtimeHours: centavos(figures.overtimeHours + slip.overtimeHours),
      holidayPay: centavos(
        figures.holidayPay +
          slip.unworkedHolidays.reduce((total, day) => total + day.pay, 0)
      ),
      allowances: centavos(figures.allowances + slip.adjustmentAdditions),
      paidHolidays: [
        ...figures.paidHolidays,
        // Only the ones that actually paid. A holiday that qualified nobody is
        // already shown as an absence on the payslip; here it is just noise.
        ...slip.unworkedHolidays
          .filter((day) => day.pay > 0)
          .map((day) => ({ date: day.date, name: day.name, pay: day.pay })),
      ],
    }
  }

  return figures
}
