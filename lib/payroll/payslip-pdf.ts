import "server-only"

import { COMPANY_ADDRESS, COMPANY_NAME } from "@/lib/company"
import {
  renderPdf,
  wrapText,
  type PdfBlock,
  type PdfCell,
  type PdfTableRow,
} from "@/lib/formats/pdf"
import {
  isRestDay,
  NIGHT_DIFFERENTIAL_RATE,
  NIGHT_HOUR_PERCENT,
  PAGIBIG_MONTHLY,
  PHILHEALTH_EMPLOYEE_RATE,
  REST_DAY_RATE,
  OVERTIME_STARTS_AFTER_HOURS,
  REGULAR_HOURS_PER_DAY,
  type Payslip,
} from "@/lib/payroll"

// ---------------------------------------------------------------------------
// The payslip
// ---------------------------------------------------------------------------
//
// A ruled form, the way a payslip has been printed since long before any of
// this was software: who paid it, who was paid, what was earned on the left,
// what came off on the right, and the one figure that lands in a hand at the
// bottom. The shape is the point — somebody who has held a payslip before can
// find the number they are looking for without reading the document.
//
// What it deliberately does *not* carry is the attendance register. The hours
// live on their own screen, and reprinting every punch here made a two-page
// document out of a one-page one while answering a question nobody asks of a
// payslip. What stands in its place is a short summary — days, hours, overtime,
// night, holiday, days not worked — which is enough to see where the earnings
// below came from, and to know which day to go and look at if they seem wrong.

/** Body text. Small: this is a form, and every cell has to sit on one line. */
const BODY = 8

/** Headings inside the ruled bands. */
const LABEL = 7

/** No peso sign in the standard fonts — every amount column is labelled PHP. */
function amount(value: number) {
  return value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function hours(value: number) {
  return value === 0 ? "—" : `${value} h`
}

function longDate(value: string | Date) {
  return new Date(value).toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

/** "August 1 – 15, 2026", and "July 26 – August 10, 2026" when it straddles. */
function periodLabel(start: string, end: string) {
  const from = new Date(start)
  const to = new Date(end)
  const sameMonth =
    from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear()

  const opening = from.toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
  })
  const closing = sameMonth
    ? String(to.getDate())
    : to.toLocaleDateString("en-PH", { month: "long", day: "numeric" })

  return `${opening} – ${closing}, ${to.getFullYear()}`
}

export type PayslipDocument = {
  employeeName: string
  employeeNo: string | null
  position: string
  /** As recorded on the staff file: probationary, regular, contractual. */
  employmentType: string | null
  cutoffLabel: string
  cutoffStart: string
  cutoffEnd: string
  /** When payroll for the period was published. Null while it is still open. */
  releasedAt: string | null
  payslip: Payslip
  adjustments: { label: string; amount: number }[]
}

// ---------------------------------------------------------------------------
// The summary figures
// ---------------------------------------------------------------------------

/** Hours that were paid at a holiday rate, worked and unworked alike. */
function holidayHours(slip: Payslip) {
  const worked = slip.days
    .filter((day) => day.holiday)
    .reduce((total, day) => total + day.regularHours + day.overtimeHours, 0)

  const rested = slip.unworkedHolidays.filter((holiday) => holiday.qualified)
    .length

  return worked + rested * REGULAR_HOURS_PER_DAY
}

/**
 * Days in the period that pay nothing because nobody was there.
 *
 * Derived rather than recorded — there is no absence form in this system, so
 * an unpaid day is a working day that closed with no attendance against it.
 * Sundays are left out, being rest days, and so is anything still in the
 * future: half a cutoff of days that have not happened yet is not absence.
 */
function unpaidDays(doc: PayslipDocument) {
  const worked = new Set(
    doc.payslip.days.map((day) => new Date(day.date).toDateString())
  )
  const paidHoliday = new Set(
    doc.payslip.unworkedHolidays
      .filter((holiday) => holiday.qualified)
      .map((holiday) => new Date(holiday.date).toDateString())
  )

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const last = new Date(doc.cutoffEnd)
  last.setHours(0, 0, 0, 0)
  const until = last > today ? today : last

  let count = 0
  for (
    const cursor = new Date(doc.cutoffStart);
    cursor <= until;
    cursor.setDate(cursor.getDate() + 1)
  ) {
    const key = cursor.toDateString()
    if (isRestDay(cursor) || worked.has(key) || paidHoliday.has(key)) continue
    count++
  }
  return count
}

// ---------------------------------------------------------------------------
// The form
// ---------------------------------------------------------------------------

function headers(...labels: string[]): PdfTableRow {
  return {
    fill: true,
    height: 14,
    cells: labels.map((text) => ({
      text,
      align: "center" as const,
      font: "sans-bold" as const,
      size: LABEL,
    })),
  }
}

function values(...texts: string[]): PdfTableRow {
  return {
    height: 17,
    cells: texts.map((text) => ({
      text,
      align: "center" as const,
      size: BODY + 0.5,
    })),
  }
}

/** A line of the payments side, or of the deductions side. */
type Entry = { label: string; basis?: string; value: number }

export function payslipBlocks(doc: PayslipDocument): PdfBlock[] {
  const slip = doc.payslip
  const rate = amount(slip.hourlyRate)

  // ----- who it is from, and who it is for ------------------------------

  const blocks: PdfBlock[] = [
    { kind: "text", text: COMPANY_NAME.toUpperCase(), font: "sans-bold", size: 14 },
    { kind: "text", text: COMPANY_ADDRESS, size: 8.5 },
    { kind: "space", height: 10 },
    {
      kind: "table",
      widths: [1],
      rows: [
        {
          fill: true,
          height: 20,
          cells: [
            {
              text: "PAYSLIP",
              align: "center",
              font: "sans-bold",
              size: 11,
            },
          ],
        },
      ],
    },
    {
      kind: "table",
      widths: [1.1, 2, 1.7],
      rows: [
        headers("EMPLOYEE NO.", "EMPLOYEE NAME", "POSITION"),
        values(
          doc.employeeNo ?? "—",
          doc.employeeName,
          doc.position
        ),
        headers("EMPLOYMENT STATUS", "PAY PERIOD", "PAY DATE"),
        values(
          // Title case: the enum shouts, and a payslip is a document a person
          // reads, not a database row.
          doc.employmentType
            ? doc.employmentType.charAt(0) +
                doc.employmentType.slice(1).toLowerCase()
            : "—",
          periodLabel(doc.cutoffStart, doc.cutoffEnd),
          // The date the run was published is the date the money moved. An
          // open period has not got one yet, and inventing the end of the
          // cutoff as a stand-in would put a date on a payslip that nobody
          // was paid on.
          doc.releasedAt ? longDate(doc.releasedAt) : "Pending release"
        ),
      ],
    },
    { kind: "space", height: 12 },
  ]

  // ----- what the hours came to -----------------------------------------
  //
  // Before any money is named. The earnings below are all sums of these.

  // Days and regular hours always print a figure; the three that are often
  // nothing print a dash, so a glance down the column finds what happened
  // rather than a wall of zeroes. Same convention as the breakdown on screen.
  const unpaid = unpaidDays(doc)
  const summary: [string, string][] = [
    ["Regular days worked", `${slip.daysWorked} d`],
    ["Overtime hours", hours(slip.overtimeHours)],
    ["Regular hours", `${slip.regularHours} h`],
    ["Night differential hours", hours(slip.nightHours)],
    ["Holiday hours", hours(holidayHours(slip))],
    ["Days not worked", unpaid === 0 ? "—" : `${unpaid} d`],
  ]

  blocks.push({
    kind: "table",
    widths: [1.7, 0.9, 1.7, 0.9],
    rows: [
      {
        fill: true,
        height: 14,
        cells: [
          {
            text: "PAYROLL SUMMARY",
            span: 4,
            align: "center",
            font: "sans-bold",
            size: LABEL,
          },
        ],
      },
      // Two pairs to a line: six figures down a single column is a tall box
      // for very little in it.
      ...[0, 2, 4].map((at): PdfTableRow => {
        const pair = summary.slice(at, at + 2)
        return {
          height: 15,
          cells: pair.flatMap(([label, value]): PdfCell[] => [
            { text: label, size: BODY },
            { text: value, align: "right", font: "sans-bold", size: BODY },
          ]),
        }
      }),
    ],
  })

  blocks.push({ kind: "space", height: 12 })

  // ----- earnings and deductions, side by side --------------------------

  const earnings: Entry[] = [
    {
      label: "Basic pay",
      basis: `${slip.regularHours - slip.nightPaidHours} h @ ${rate}`,
      value: slip.basicPay,
    },
    {
      label: "Overtime pay",
      basis:
        slip.overtimeHours > 0
          ? `${slip.overtimeHours} h approved and worked`
          : "none worked",
      value: slip.overtimePay,
    },
    {
      // The hour and its premium on one line, so it reads as what a night hour
      // is worth. Those hours are held off the basic line above rather than
      // counted in both places.
      label: "Night differential pay",
      basis:
        slip.nightPaidHours > 0
          ? `${slip.nightPaidHours} h @ +${NIGHT_DIFFERENTIAL_RATE * 100}%`
          : "no night hours",
      value: slip.nightPay,
    },
    {
      label: "Rest day premium",
      basis:
        slip.restDayPay > 0
          ? `Sundays worked @ +${REST_DAY_RATE * 100}%`
          : "no Sunday worked",
      value: slip.restDayPay,
    },
    {
      label: "Holiday pay",
      basis:
        slip.holidayPay > 0
          ? [
              ...slip.days.filter((day) => day.holiday).map((day) => day.holiday!),
              ...slip.unworkedHolidays
                .filter((holiday) => holiday.qualified)
                .map((holiday) => holiday.name),
            ].join(", ") || "holiday worked"
          : "no holiday this period",
      value: slip.holidayPay,
    },
    // Everything the office added by hand, named. This is the one part of a
    // payslip that isn't derived from evidence, so it says what it was for.
    ...doc.adjustments
      .filter((entry) => entry.amount > 0)
      .map((entry) => ({
        label: entry.label,
        basis: "other earnings",
        value: entry.amount,
      })),
  ]

  const withheld: Entry[] = [
    {
      label: "SSS",
      basis: `MSC ${amount(slip.sss.monthlySalaryCredit)}`,
      value: slip.deductions.sss,
    },
    {
      label: "PhilHealth",
      basis: `${PHILHEALTH_EMPLOYEE_RATE * 100}% of ${amount(slip.philhealthBasis)}`,
      value: slip.deductions.philhealth,
    },
    {
      label: "Pag-IBIG",
      basis: `${amount(PAGIBIG_MONTHLY)}/mo, half`,
      value: slip.deductions.pagibig,
    },
    ...doc.adjustments
      .filter((entry) => entry.amount < 0)
      .map((entry) => ({ label: entry.label, value: -entry.amount })),
  ]

  // A contribution is withheld *from* wages and cannot exceed them. When the
  // period could not cover what the schedules asked for, the difference is
  // shown coming back off — so the column still adds up to the total under it,
  // and the carried amount is on the payslip rather than left to be discovered
  // next month.
  if (slip.deductions.shortfall > 0) {
    withheld.push({
      label: "Less: carried to next period",
      basis: "pay did not cover it",
      value: -slip.deductions.shortfall,
    })
  }

  const body: PdfTableRow[] = []
  // A form keeps its shape: the box is as tall as the longer side, and the
  // shorter one runs out into empty cells rather than pulling the totals up.
  for (let at = 0; at < Math.max(earnings.length, withheld.length); at++) {
    const earned = earnings[at]
    const took = withheld[at]

    body.push({
      height: 14,
      cells: [
        { text: earned?.label ?? "", size: BODY },
        {
          text: earned?.basis ?? "",
          size: BODY - 0.5,
        },
        {
          text: earned ? amount(earned.value) : "",
          align: "right",
          font: "mono",
          size: BODY,
        },
        {
          text: took ? [took.label, took.basis].filter(Boolean).join(" · ") : "",
          size: BODY,
        },
        {
          text: took ? amount(took.value) : "",
          align: "right",
          font: "mono",
          size: BODY,
        },
      ],
    })
  }

  blocks.push({
    kind: "table",
    widths: [1.45, 1.15, 0.95, 1.55, 0.95],
    rows: [
      {
        fill: true,
        height: 15,
        cells: [
          {
            text: "EARNINGS",
            span: 3,
            align: "center",
            font: "sans-bold",
            size: LABEL + 0.5,
          },
          {
            text: "DEDUCTIONS",
            span: 2,
            align: "center",
            font: "sans-bold",
            size: LABEL + 0.5,
          },
        ],
      },
      {
        fill: true,
        height: 13,
        cells: [
          { text: "Description", size: LABEL },
          { text: "Basis", size: LABEL },
          { text: "Amount (PHP)", align: "right", size: LABEL },
          { text: "Description", size: LABEL },
          { text: "Amount (PHP)", align: "right", size: LABEL },
        ],
      },
      ...body,
      {
        fill: true,
        height: 17,
        cells: [
          {
            text: "GROSS PAY",
            span: 2,
            font: "sans-bold",
            size: BODY,
          },
          {
            text: amount(slip.gross),
            align: "right",
            font: "mono-bold",
            size: BODY + 0.5,
          },
          { text: "TOTAL DEDUCTIONS", font: "sans-bold", size: BODY },
          {
            text: amount(slip.deductions.total),
            align: "right",
            font: "mono-bold",
            size: BODY + 0.5,
          },
        ],
      },
    ],
  })

  // ----- the answer -----------------------------------------------------

  blocks.push({ kind: "space", height: 12 })
  blocks.push({
    kind: "table",
    widths: [3.2, 1.4],
    rows: [
      {
        height: 26,
        fill: true,
        cells: [
          {
            text: "NET PAY (PHP)",
            align: "right",
            font: "sans-bold",
            size: 11,
          },
          {
            text: amount(slip.net),
            align: "right",
            font: "mono-bold",
            size: 12,
          },
        ],
      },
    ],
  })

  // ----- the rules it was worked out under ------------------------------

  blocks.push({ kind: "space", height: 14 })

  const NOTE_SIZE = 7.5
  const notes = [
    `Paid hours are whole hours capped at ${REGULAR_HOURS_PER_DAY} a day — the ninth hour on site is the unpaid break.`,
    `Overtime pays approved hours actually worked past ${OVERTIME_STARTS_AFTER_HOURS} hours on the clock, so an approval alone pays nothing.`,
    `An hour worked between 22:00 and 06:00 pays the hourly rate plus a further ${NIGHT_DIFFERENTIAL_RATE * 100}% — ${NIGHT_HOUR_PERCENT}% in total. Those hours are shown on the night line rather than in basic pay, so no hour is counted twice.`,
    "SSS, PhilHealth and Pag-IBIG are monthly contributions and payroll runs twice a month, so half of each is taken here.",
    `Hourly rate ${rate}. Computed from recorded attendance — raise anything that looks wrong with the office.`,
  ]

  for (const note of notes) {
    // Wrapped, not trusted to fit: a `text` block is one line, and the longest
    // of these is three times the width of the page.
    for (const line of wrapText(note, "sans", NOTE_SIZE)) {
      blocks.push({ kind: "text", text: line, size: NOTE_SIZE })
    }
  }

  if (!doc.releasedAt) {
    blocks.push(
      { kind: "space", height: 6 },
      {
        kind: "text",
        text: "PROVISIONAL — this period has not been released. Figures still move as attendance is corrected.",
        font: "sans-bold",
        size: 7.5,
      }
    )
  }

  return blocks
}

export function payslipPdf(doc: PayslipDocument) {
  return renderPdf(payslipBlocks(doc))
}

/** `Payslip_Aug-1-15-2026_Prince-Reyes.pdf` — sorts and reads as itself. */
export function payslipFileName(doc: PayslipDocument) {
  const segment = (value: string) =>
    value
      .normalize("NFKD")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48)

  return `Payslip_${segment(doc.cutoffLabel)}_${segment(doc.employeeName)}.pdf`
}

/**
 * The payslip as a download, headers and all.
 *
 * Two routes serve this file — the office's, which names an employee, and the
 * employee's own, which never does — and they must hand over the same document.
 * Keeping the response here rather than writing it out in both is what makes
 * that true by construction instead of by two people remembering: a change to
 * the filename, the caching or the bytes reaches both at once, and neither
 * route is in a position to disagree with the other.
 */
export function payslipResponse(doc: PayslipDocument) {
  return new Response(payslipPdf(doc), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${payslipFileName(doc)}"`,
      // Pay is personal, and the figures are recomputed on every read; neither
      // is something a shared cache should be holding on to.
      "Cache-Control": "no-store, private",
    },
  })
}
