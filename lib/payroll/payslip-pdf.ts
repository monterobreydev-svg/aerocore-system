import "server-only"

import { renderPdf, monoColumns, type PdfBlock } from "@/lib/formats/pdf"
import {
  NIGHT_DIFFERENTIAL_RATE,
  OVERTIME_STARTS_AFTER_HOURS,
  REGULAR_HOURS_PER_DAY,
  type Payslip,
} from "@/lib/payroll"

// ---------------------------------------------------------------------------
// The payslip, in full
// ---------------------------------------------------------------------------
//
// The screen shows an employee what they were paid. This shows them how it was
// arrived at: every day, the hours it rendered, and the peso each line of the
// summary is the sum of. That is a table nobody wants on a phone and everybody
// wants when they disagree with a number — which is exactly the split between a
// page and a download.
//
// Composed as monospace rows rather than laid out in columns: see lib/pdf.ts.

const BODY_SIZE = 9
const COLUMNS = monoColumns(BODY_SIZE)

/** No peso sign in the standard fonts — every column is labelled PHP instead. */
function amount(value: number) {
  return value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function hours(value: number) {
  return value === 0 ? "-" : String(value)
}

function shortDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", {
    weekday: "short",
    month: "short",
    day: "2-digit",
  })
}

function longDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

/** "Label ............ 1,234.56", filling the width so the eye can track across. */
function leader(label: string, value: string, width = COLUMNS) {
  const room = Math.max(1, width - label.length - value.length - 2)
  return `${label} ${".".repeat(room)} ${value}`
}

function row(cells: [string, number][], gap = 1) {
  return cells
    .map(([text, width]) =>
      width < 0 ? text.padStart(-width) : text.padEnd(width)
    )
    .join(" ".repeat(gap))
}

export type PayslipDocument = {
  employeeName: string
  employeeNo: string | null
  position: string
  cutoffLabel: string
  cutoffStart: string
  cutoffEnd: string
  releasedAt: string | null
  payslip: Payslip
  adjustments: { label: string; amount: number }[]
}

function heading(text: string): PdfBlock[] {
  return [
    { kind: "space", height: 10 },
    { kind: "text", text, font: "sans-bold", size: 10.5 },
    { kind: "rule", light: true },
  ]
}

export function payslipBlocks(doc: PayslipDocument): PdfBlock[] {
  const slip = doc.payslip
  const blocks: PdfBlock[] = [
    { kind: "text", text: "AeroCoole", font: "sans-bold", size: 17 },
    { kind: "text", text: "Payslip", font: "sans", size: 11 },
    { kind: "space", height: 6 },
    { kind: "rule" },
    { kind: "space", height: 4 },

    { kind: "text", text: doc.employeeName, font: "sans-bold", size: 12 },
    {
      kind: "text",
      text: [doc.position, doc.employeeNo && `Employee no. ${doc.employeeNo}`]
        .filter(Boolean)
        .join("  ·  "),
      size: 9.5,
    },
    { kind: "text", text: `Period: ${doc.cutoffLabel}`, size: 9.5 },
  ]

  if (doc.releasedAt) {
    blocks.push({
      kind: "text",
      text: `Released ${longDate(doc.releasedAt)}`,
      size: 9.5,
    })
  }

  // ----- the days -------------------------------------------------------
  //
  // The reason this document exists. Every other figure on the page is a sum
  // of this table, so it comes first and it is complete.

  blocks.push(...heading("Days worked"))

  const DAY = 15
  const HOURS = -5
  const OT = -5
  const NIGHT = -6
  const PAY = -12

  blocks.push({
    kind: "text",
    font: "mono-bold",
    size: BODY_SIZE,
    text: row([
      ["Date", DAY],
      ["Hrs", HOURS],
      ["OT", OT],
      ["Night", NIGHT],
      ["Pay (PHP)", PAY],
    ]),
  })

  if (slip.days.length === 0) {
    blocks.push({
      kind: "text",
      font: "mono",
      size: BODY_SIZE,
      text: "No attendance in this period.",
    })
  }

  for (const day of slip.days) {
    blocks.push({
      kind: "text",
      font: "mono",
      size: BODY_SIZE,
      text: row([
        [shortDay(day.date), DAY],
        [hours(day.regularHours), HOURS],
        [hours(day.overtimeHours), OT],
        [hours(day.nightHours), NIGHT],
        [amount(day.total), PAY],
      ]),
    })

    // The holiday is why a Friday paid double, so it is said on the day
    // rather than left to be inferred from the total.
    if (day.holiday) {
      blocks.push({
        kind: "text",
        font: "mono",
        size: BODY_SIZE,
        indent: 12,
        text: `${day.holiday} — worked, paid double`,
      })
    }
    if (day.renderedMinutes === 0) {
      blocks.push({
        kind: "text",
        font: "mono",
        size: BODY_SIZE,
        indent: 12,
        text: "still on the clock — pays nothing until closed",
      })
    }
  }

  for (const holiday of slip.unworkedHolidays) {
    blocks.push({
      kind: "text",
      font: "mono",
      size: BODY_SIZE,
      text: row([
        [shortDay(holiday.date), DAY],
        ["-", HOURS],
        ["-", OT],
        ["-", NIGHT],
        [amount(holiday.pay), PAY],
      ]),
    })
    blocks.push({
      kind: "text",
      font: "mono",
      size: BODY_SIZE,
      indent: 12,
      text: holiday.qualified
        ? `${holiday.name} — not worked, ${REGULAR_HOURS_PER_DAY} h holiday pay`
        : `${holiday.name} — not worked, absent the day before, so unpaid`,
    })
  }

  blocks.push({ kind: "space", height: 4 }, { kind: "rule", light: true })
  blocks.push({
    kind: "text",
    font: "mono-bold",
    size: BODY_SIZE,
    text: row([
      [`${slip.daysWorked} days`, DAY],
      [hours(slip.regularHours), HOURS],
      [hours(slip.overtimeHours), OT],
      [hours(slip.nightHours), NIGHT],
      [amount(slip.basicPay + slip.overtimePay + slip.nightPay + slip.holidayPay), PAY],
    ]),
  })

  // ----- earnings -------------------------------------------------------

  blocks.push(...heading("Earnings"))

  const rate = amount(slip.hourlyRate)
  const lines: [string, string][] = [
    [`Basic pay (${slip.regularHours - slip.nightPaidHours} h @ ${rate})`, amount(slip.basicPay)],
    [
      `Overtime (${slip.overtimeHours} h approved and worked)`,
      amount(slip.overtimePay),
    ],
    // The hour and its premium on one line, so it reads as what a night hour
    // is worth. Those hours are excluded from the basic line above rather than
    // counted twice.
    [
      `Night hours (${slip.nightPaidHours} h @ ${rate} + ${NIGHT_DIFFERENTIAL_RATE * 100}%)`,
      amount(slip.nightPay),
    ],
    ["Holiday pay", amount(slip.holidayPay)],
  ]
  if (slip.adjustmentAdditions > 0) {
    lines.push(["Adjustments added", amount(slip.adjustmentAdditions)])
  }

  for (const [label, value] of lines) {
    blocks.push({
      kind: "text",
      font: "mono",
      size: BODY_SIZE,
      text: leader(label, value),
    })
  }
  blocks.push({
    kind: "text",
    font: "mono-bold",
    size: BODY_SIZE,
    text: leader("GROSS PAY (PHP)", amount(slip.gross)),
  })

  // ----- deductions -----------------------------------------------------

  blocks.push(...heading("Deductions"))
  blocks.push({
    kind: "text",
    font: "sans",
    size: 8.5,
    text: "Contributions are monthly figures; payroll runs twice a month, so half of each is taken here.",
  })

  const taken: [string, string][] = [
    ["SSS", amount(slip.deductions.sss)],
    ["PhilHealth", amount(slip.deductions.philhealth)],
    ["Pag-IBIG", amount(slip.deductions.pagibig)],
  ]
  if (slip.deductions.adjustments > 0) {
    taken.push(["Adjustments deducted", amount(slip.deductions.adjustments)])
  }

  for (const [label, value] of taken) {
    blocks.push({
      kind: "text",
      font: "mono",
      size: BODY_SIZE,
      text: leader(label, value),
    })
  }
  blocks.push({
    kind: "text",
    font: "mono-bold",
    size: BODY_SIZE,
    text: leader("TOTAL DEDUCTIONS (PHP)", amount(slip.deductions.total)),
  })

  // A contribution is withheld from wages and can't exceed them. When the
  // cutoff couldn't cover it, saying so here is the difference between a
  // payslip that looks wrong and one that explains itself.
  if (slip.deductions.shortfall > 0) {
    blocks.push({
      kind: "text",
      font: "mono",
      size: BODY_SIZE,
      text: leader(
        "Not taken this cutoff (carried)",
        amount(slip.deductions.shortfall)
      ),
    })
  }

  if (doc.adjustments.length > 0) {
    blocks.push(...heading("Adjustments"))
    for (const entry of doc.adjustments) {
      blocks.push({
        kind: "text",
        font: "mono",
        size: BODY_SIZE,
        text: leader(
          `${entry.amount > 0 ? "+" : "-"} ${entry.label}`,
          amount(Math.abs(entry.amount))
        ),
      })
    }
  }

  // ----- net ------------------------------------------------------------

  blocks.push({ kind: "space", height: 10 }, { kind: "rule" })
  blocks.push({
    kind: "text",
    font: "mono-bold",
    size: 12,
    text: leader("NET PAY (PHP)", amount(slip.net), monoColumns(12)),
  })
  blocks.push({ kind: "rule" })

  blocks.push(
    { kind: "space", height: 12 },
    {
      kind: "text",
      font: "sans",
      size: 8,
      text: `Paid hours are whole hours capped at ${REGULAR_HOURS_PER_DAY} a day — the ninth hour on site is the unpaid break.`,
    },
    {
      kind: "text",
      font: "sans",
      size: 8,
      text: `Overtime pays approved hours actually worked past ${OVERTIME_STARTS_AFTER_HOURS} hours on the clock, so an approval alone pays nothing.`,
    },
    {
      kind: "text",
      font: "sans",
      size: 8,
      text: `An hour worked between 22:00 and 06:00 pays the hourly rate plus a further ${NIGHT_DIFFERENTIAL_RATE * 100}% — ${(1 + NIGHT_DIFFERENTIAL_RATE) * 100}% in total. Those hours are shown on the night line rather than in basic pay, so no hour is counted twice.`,
    },
    {
      kind: "text",
      font: "sans",
      size: 8,
      text: "Computed from recorded attendance. Raise anything that looks wrong with the office.",
    }
  )

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
