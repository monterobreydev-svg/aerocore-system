import "server-only"

import { STYLE, columnName, xlsxStream, type Cell, type Row } from "@/lib/formats/xlsx"

// ---------------------------------------------------------------------------
// The payroll run, as a spreadsheet
// ---------------------------------------------------------------------------
//
// The office's own copy of a whole cutoff: one row per employee, the earnings
// that make up their gross, the three contributions that come off it, and what
// lands in the bank. A different document from the payslip an employee
// downloads — that one explains one person's fortnight day by day; this one is
// the run, for filing and for handing to whoever moves the money.

export const COMPANY_NAME = "Aerocoole Airconditioning Services"

export type PayrollSheetRow = {
  employeeNo: string | null
  lastName: string
  firstName: string
  middleName: string | null
  position: string
  /**
   * The employee's own membership numbers, as recorded on their staff record.
   * Null when the office has not been given one — shown as a dash rather than
   * an empty cell, so "not on file" reads differently from "column is broken".
   */
  sssNo: string | null
  philhealthNo: string | null
  pagibigNo: string | null
  basicPay: number
  overtimePay: number
  nightHours: number
  nightPay: number
  restDayPay: number
  holidayPay: number
  /**
   * Signed: positive added to the pay, negative taken off it. One column
   * rather than two, because a register is read across and "Adjustment
   * (addition)" next to "Adjustment (deduction)" is two mostly-empty columns
   * saying one thing.
   */
  adjustment: number
  /** What the hours earned, with the adjustment already folded in. */
  gross: number
  sss: number
  philhealth: number
  pagibig: number
  net: number
  /** Why the adjustment was made — empty when there was none. */
  remarks: string
}

/**
 * Heading, and how wide its column needs to be.
 *
 * Widths are in characters and were set against the widest thing each column
 * can actually hold — a peso figure in the tens of thousands, a two-line
 * heading, a long surname — rather than left to Excel's default, which clips
 * headings and shows money as ###.
 */
const COLUMNS: { label: string; width: number; kind: "text" | "hours" | "money" }[] =
  [
    { label: "Employee No.", width: 14, kind: "text" },
    { label: "Last Name", width: 18, kind: "text" },
    { label: "First Name", width: 16, kind: "text" },
    { label: "Middle Name", width: 16, kind: "text" },
    { label: "Position", width: 22, kind: "text" },
    { label: "SSS No.", width: 15, kind: "text" },
    { label: "PhilHealth No.", width: 17, kind: "text" },
    { label: "Pag-IBIG No.", width: 17, kind: "text" },
    { label: "Basic Pay", width: 13, kind: "money" },
    { label: "Overtime Pay", width: 13, kind: "money" },
    { label: "Night Hours", width: 11, kind: "hours" },
    { label: "Night Pay", width: 13, kind: "money" },
    { label: "Rest Day Pay", width: 13, kind: "money" },
    { label: "Holiday Pay", width: 13, kind: "money" },
    { label: "Adjustment", width: 13, kind: "money" },
    { label: "Gross Pay", width: 14, kind: "money" },
    { label: "SSS", width: 12, kind: "money" },
    { label: "PhilHealth", width: 12, kind: "money" },
    { label: "Pag-IBIG", width: 12, kind: "money" },
    { label: "Total Net Pay", width: 15, kind: "money" },
    // Last, and wide: it is the one column that holds a sentence, and it must
    // not squeeze the figures to the left of it.
    { label: "Comments / Remarks", width: 38, kind: "text" },
  ]

const LAST_COLUMN = columnName(COLUMNS.length - 1)

const text = (value: string, style: number = STYLE.text): Cell => ({
  kind: "text",
  value,
  style,
})
const money = (value: number, style: number = STYLE.money): Cell => ({
  kind: "number",
  value: Math.round(value * 100) / 100,
  style,
})
const count = (value: number, style: number = STYLE.number): Cell => ({
  kind: "number",
  value,
  style,
})

/** A whole row of empties, so the merged title band carries its fill cleanly. */
function bandRow(cells: Cell[]): Row {
  const padded = [...cells]
  while (padded.length < COLUMNS.length) padded.push({ kind: "blank" })
  return { cells: padded }
}

function formatDate(date: Date) {
  return date.toLocaleDateString("en-PH", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

function formatDateTime(date: Date) {
  return date.toLocaleString("en-PH", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function payrollSheet({
  rows,
  cutoffLabel,
  cutoffStart,
  cutoffEnd,
  generatedAt,
}: {
  rows: PayrollSheetRow[]
  /** "16–31 August 2026", as the payroll page names it. */
  cutoffLabel: string
  cutoffStart: Date
  cutoffEnd: Date
  generatedAt: Date
}) {
  const sheetRows: Row[] = []

  // ---- the title block ----------------------------------------------------
  //
  // Three lines above the table: who this is, what period it covers, and when
  // it was produced. The last one matters most — payroll is recomputed from
  // attendance every time it is asked for, so two exports of the same cutoff
  // can differ, and the sheet has to say when it was taken.
  sheetRows.push({ cells: bandRow([text(COMPANY_NAME, STYLE.title)]).cells, height: 24 })
  sheetRows.push(bandRow([text("Payroll Register", STYLE.caption)]))
  sheetRows.push(
    bandRow([
      text(
        `Payroll period: ${cutoffLabel}  (${formatDate(cutoffStart)} to ${formatDate(cutoffEnd)})`,
        STYLE.caption
      ),
    ])
  )
  sheetRows.push(
    bandRow([text(`Generated: ${formatDateTime(generatedAt)}`, STYLE.caption)])
  )
  sheetRows.push(
    bandRow([
      text(
        "Gross Pay is what the hours earned with the adjustment already applied. The adjustment itself is explained in the last column.",
        STYLE.caption
      ),
    ])
  )
  sheetRows.push(bandRow([]))

  const headerRowNumber = sheetRows.length + 1

  // ---- headings -----------------------------------------------------------
  sheetRows.push({
    cells: COLUMNS.map((column) => text(column.label, STYLE.header)),
    // Two lines' worth, since the wrapped headings need the room.
    height: 30,
  })

  // ---- the staff ----------------------------------------------------------
  for (const row of rows) {
    sheetRows.push({
      cells: [
        text(row.employeeNo ?? "—"),
        text(row.lastName),
        text(row.firstName),
        text(row.middleName ?? ""),
        text(row.position),
        text(row.sssNo ?? "—"),
        text(row.philhealthNo ?? "—"),
        text(row.pagibigNo ?? "—"),
        money(row.basicPay),
        money(row.overtimePay),
        count(row.nightHours),
        money(row.nightPay),
        money(row.restDayPay),
        money(row.holidayPay),
        money(row.adjustment),
        money(row.gross),
        money(row.sss),
        money(row.philhealth),
        money(row.pagibig),
        money(row.net),
        text(row.remarks, STYLE.note),
      ],
    })
  }

  // ---- the run's totals ---------------------------------------------------
  //
  // Written as values rather than as SUM() formulas on purpose: the file is a
  // record of what was paid, and a formula would silently recompute if somebody
  // sorted or deleted a row in it.
  const total = (pick: (row: PayrollSheetRow) => number) =>
    rows.reduce((sum, row) => sum + pick(row), 0)

  sheetRows.push({
    cells: [
      text(`TOTAL — ${rows.length} ${rows.length === 1 ? "employee" : "employees"}`, STYLE.totalText),
      { kind: "blank", style: STYLE.totalText },
      { kind: "blank", style: STYLE.totalText },
      { kind: "blank", style: STYLE.totalText },
      { kind: "blank", style: STYLE.totalText },
      { kind: "blank", style: STYLE.totalText },
      { kind: "blank", style: STYLE.totalText },
      { kind: "blank", style: STYLE.totalText },
      money(total((r) => r.basicPay), STYLE.totalMoney),
      money(total((r) => r.overtimePay), STYLE.totalMoney),
      count(total((r) => r.nightHours), STYLE.totalNumber),
      money(total((r) => r.nightPay), STYLE.totalMoney),
      money(total((r) => r.restDayPay), STYLE.totalMoney),
      money(total((r) => r.holidayPay), STYLE.totalMoney),
      money(total((r) => r.adjustment), STYLE.totalMoney),
      money(total((r) => r.gross), STYLE.totalMoney),
      money(total((r) => r.sss), STYLE.totalMoney),
      money(total((r) => r.philhealth), STYLE.totalMoney),
      money(total((r) => r.pagibig), STYLE.totalMoney),
      money(total((r) => r.net), STYLE.totalMoney),
      { kind: "blank", style: STYLE.totalText },
    ],
  })

  return xlsxStream({
    name: "Payroll",
    columns: COLUMNS.map((column) => column.width),
    rows: sheetRows,
    freezeAtRow: headerRowNumber,
    merges: [
      `A1:${LAST_COLUMN}1`,
      `A2:${LAST_COLUMN}2`,
      `A3:${LAST_COLUMN}3`,
      `A4:${LAST_COLUMN}4`,
    ],
  })
}

/** "AeroCoole_Payroll_16-31-Aug-2026.xlsx" — safe on every filesystem. */
export function payrollFileName(cutoffLabel: string) {
  const slug = cutoffLabel
    .normalize("NFD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
  return `AeroCoole_Payroll_${slug || "cutoff"}.xlsx`
}
