import "server-only"

import { COMPANY_NAME } from "@/lib/company"
import { STYLE, columnName, type Cell, type Row, type Sheet } from "@/lib/formats/xlsx"
import { MONTH_NAMES } from "@/lib/documents"
import {
  PAYMENT_TERMS_LABELS,
  PROJECT_STATUS_LABELS,
  VAT_RATE,
} from "@/lib/projects"
import type { ProjectsReport } from "@/lib/projects/report"

// ---------------------------------------------------------------------------
// The project book, as a workbook
// ---------------------------------------------------------------------------
//
// Two tabs, because they are read by two different motions:
//
//   Projects   one row per job, every figure the tracker shows and the three
//              VAT lines derived from them. The sheet somebody sorts by margin.
//   Expenses   one row per charge, with the job it belongs to on every line so
//              the tab can be filtered, pivoted or subtotalled without needing
//              the other one open.
//
// Deliberately no charts. Writing OOXML chart parts by hand is several hundred
// lines that Excel validates strictly and rejects opaquely, and anybody holding
// a spreadsheet makes their own chart in three clicks. The pictures are the
// PDF's job; this file's job is numbers that add up and can be worked with.
//
// Numbers are written as numbers, never as pre-formatted text — a column of
// strings that look like money is the single most common way an export becomes
// useless the moment somebody tries to sum it.

// `style: number` rather than an inferred literal: STYLE.text is the *default*,
// not the only value these ever take, and a default parameter narrows the type
// to whatever it happens to be.
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
const blank = (style: number = STYLE.text): Cell => ({ kind: "blank", style })

/**
 * What this sheet covers, said in full.
 *
 * A filtered export that only said the year would be filed as the whole year
 * and reconciled against nothing.
 */
function scopeLine(report: ProjectsReport, lead: string) {
  return [`${lead} ${report.periodLabel}`, report.filterNote]
    .filter(Boolean)
    .join(" · ")
}

/** The three lines above every sheet: who, what, when. */
function titleBlock(
  heading: string,
  subtitle: string,
  generatedAt: string,
  width: number
) {
  const span = `A1:${columnName(width - 1)}1`
  const spanTwo = `A2:${columnName(width - 1)}2`
  const spanThree = `A3:${columnName(width - 1)}3`

  return {
    rows: [
      { cells: [text(COMPANY_NAME, STYLE.title)], height: 21 },
      { cells: [text(heading, STYLE.caption)] },
      {
        cells: [
          text(
            `${subtitle} · Generated ${new Date(generatedAt).toLocaleString("en-PH", {
              dateStyle: "medium",
              timeStyle: "short",
            })}`,
            STYLE.caption
          ),
        ],
      },
      { cells: [] },
    ] as Row[],
    merges: [span, spanTwo, spanThree],
  }
}

const PROJECT_COLUMNS: { label: string; width: number }[] = [
  { label: "S.O. No.", width: 11 },
  { label: "Start", width: 11 },
  { label: "End", width: 11 },
  { label: "Client", width: 34 },
  { label: "Site", width: 20 },
  { label: "Project", width: 40 },
  { label: "Status", width: 17 },
  { label: "Terms", width: 22 },
  { label: "S.I. No.", width: 12 },
  { label: "Project amount", width: 15 },
  { label: "Net of VAT", width: 14 },
  { label: "Input VAT", width: 13 },
  { label: "COGS", width: 14 },
  { label: "COGS VAT", width: 13 },
  { label: "Output VAT", width: 13 },
  { label: "Cash collection", width: 15 },
  { label: "Accrual revenue", width: 15 },
  { label: "Gross profit", width: 14 },
  { label: "Margin %", width: 10 },
]

/** One row per job, with the money as money. */
function projectsSheet(report: ProjectsReport): Sheet {
  const head = titleBlock(
    "Project ledger",
    scopeLine(report, "Every project starting in"),
    report.generatedAt,
    PROJECT_COLUMNS.length
  )

  const rows: Row[] = [
    ...head.rows,
    {
      cells: PROJECT_COLUMNS.map((column) => text(column.label, STYLE.header)),
      height: 30,
    },
    ...report.projects.map((project): Row => {
      // Against accrual revenue, the same basis grossProfit uses. A margin on
      // a job that has booked no revenue yet is not 0% — it is unanswerable,
      // and a blank cell says so where a zero would lie.
      const margin =
        project.accrualRevenue > 0
          ? project.grossProfit / project.accrualRevenue
          : null

      return {
        cells: [
          text(project.salesOrderNo, STYLE.number),
          text(project.startDate, STYLE.number),
          text(project.endDate ?? "—", STYLE.number),
          text(project.clientName),
          text(project.branchName ?? "Head office"),
          text(project.name),
          text(PROJECT_STATUS_LABELS[project.status]),
          text(PAYMENT_TERMS_LABELS[project.terms]),
          text(project.siNo ?? "—", STYLE.number),
          money(project.projectAmount),
          money(project.netOfVat),
          money(project.inputVat),
          money(project.cogs),
          money(project.cogsVat),
          money(project.outputVat),
          money(project.cashCollection),
          money(project.accrualRevenue),
          money(project.grossProfit),
          margin === null
            ? blank(STYLE.number)
            : { kind: "number", value: Math.round(margin * 1000) / 10, style: STYLE.number },
        ],
      }
    }),
    {
      cells: [
        text(`${report.totals.count} projects`, STYLE.totalText),
        blank(STYLE.totalText),
        blank(STYLE.totalText),
        blank(STYLE.totalText),
        blank(STYLE.totalText),
        blank(STYLE.totalText),
        blank(STYLE.totalText),
        blank(STYLE.totalText),
        blank(STYLE.totalText),
        money(report.totals.projectAmount, STYLE.totalMoney),
        money(report.totals.netOfVat, STYLE.totalMoney),
        money(report.totals.inputVat, STYLE.totalMoney),
        money(report.totals.cogs, STYLE.totalMoney),
        money(report.totals.cogsVat, STYLE.totalMoney),
        money(report.totals.outputVat, STYLE.totalMoney),
        money(report.totals.cashCollection, STYLE.totalMoney),
        money(report.totals.accrualRevenue, STYLE.totalMoney),
        money(report.totals.grossProfit, STYLE.totalMoney),
        blank(STYLE.totalNumber),
      ],
    },
  ]

  return {
    name: "Projects",
    columns: PROJECT_COLUMNS.map((column) => column.width),
    rows,
    // Below the title block and the headings, so the column names stay put.
    freezeAtRow: head.rows.length + 1,
    merges: head.merges,
  }
}

const EXPENSE_COLUMNS: { label: string; width: number }[] = [
  { label: "S.O. No.", width: 11 },
  { label: "Client", width: 32 },
  { label: "Project", width: 34 },
  { label: "Date", width: 11 },
  { label: "Source", width: 13 },
  { label: "Description", width: 46 },
  { label: "Reference", width: 16 },
  { label: "Person", width: 24 },
  { label: "Status", width: 16 },
  { label: "Amount", width: 14 },
]

/**
 * One row per charge, with its job repeated on every line.
 *
 * Repeated on purpose. A sheet meant to be filtered cannot rely on a heading
 * three rows above still being visible — the moment somebody filters to one
 * client, a grouped layout loses the very column that says which client it is.
 */
function expensesSheet(report: ProjectsReport): Sheet {
  const head = titleBlock(
    "Cost of goods sold (COGS)",
    scopeLine(report, "Everything costed against a sales order from"),
    report.generatedAt,
    EXPENSE_COLUMNS.length
  )

  const approved = report.expenses
    .filter((line) => line.status === "Approved")
    .reduce((sum, line) => sum + line.amount, 0)
  const pending = report.expenses
    .filter((line) => line.status !== "Approved")
    .reduce((sum, line) => sum + line.amount, 0)

  const rows: Row[] = [
    ...head.rows,
    {
      cells: EXPENSE_COLUMNS.map((column) => text(column.label, STYLE.header)),
      height: 30,
    },
    ...report.expenses.map(
      (line): Row => ({
        cells: [
          text(line.salesOrderNo, STYLE.number),
          text(line.clientName),
          text(line.projectName),
          text(line.spentOn, STYLE.number),
          text(line.source, STYLE.number),
          text(line.description, STYLE.note),
          text(line.reference, STYLE.number),
          text(line.person),
          text(line.status, STYLE.number),
          money(line.amount),
        ],
      })
    ),
    {
      cells: [
        text(`${report.expenses.length} lines`, STYLE.totalText),
        blank(STYLE.totalText),
        blank(STYLE.totalText),
        blank(STYLE.totalText),
        blank(STYLE.totalText),
        text(
          // Spelled out, because the two figures do different jobs: only the
          // approved half is in COGS, and a total that quietly mixed them would
          // not reconcile with the Projects tab.
          pending > 0
            ? "Approved only — awaiting review is listed but not in COGS"
            : "All approved",
          STYLE.totalText
        ),
        blank(STYLE.totalText),
        blank(STYLE.totalText),
        blank(STYLE.totalText),
        money(approved, STYLE.totalMoney),
      ],
    },
  ]

  if (pending > 0) {
    rows.push({
      cells: [
        text("Awaiting review", STYLE.totalText),
        blank(STYLE.totalText),
        blank(STYLE.totalText),
        blank(STYLE.totalText),
        blank(STYLE.totalText),
        blank(STYLE.totalText),
        blank(STYLE.totalText),
        blank(STYLE.totalText),
        blank(STYLE.totalText),
        money(pending, STYLE.totalMoney),
      ],
    })
  }

  return {
    name: "COGS",
    columns: EXPENSE_COLUMNS.map((column) => column.width),
    rows,
    freezeAtRow: head.rows.length + 1,
    merges: head.merges,
  }
}

/**
 * A month a row: what the business made, what it cost to run, what was left.
 *
 * The same table the tracker's company sheet shows, from the same
 * summariseMonth — a second calculation here would be a second answer.
 */
function companySheet(report: ProjectsReport): Sheet {
  const columns = [
    { label: "Month", width: 16 },
    { label: "Projects", width: 10 },
    { label: "Accrual revenue", width: 16 },
    { label: "COGS", width: 15 },
    { label: "Gross profit", width: 15 },
    { label: "OPEX", width: 15 },
    { label: "Net profit", width: 15 },
    { label: "Net margin %", width: 13 },
  ]

  const head = titleBlock(
    "Company sheet",
    scopeLine(report, "How the business did, month by month, across"),
    report.generatedAt,
    columns.length
  )

  const row = (summary: (typeof report.monthSummaries)[number], strong: boolean) => {
    const label = strong ? STYLE.totalText : STYLE.text
    const number = strong ? STYLE.totalNumber : STYLE.number
    const cash = strong ? STYLE.totalMoney : STYLE.money
    const cogs =
      summary.month === null
        ? report.totals.cogs
        : (report.monthTotals.get(summary.month)?.cogs ?? 0)

    return {
      cells: [
        text(summary.month === null ? "Year" : MONTH_NAMES[summary.month], label),
        { kind: "number" as const, value: summary.projects, style: number },
        money(summary.accrualRevenue, cash),
        money(cogs, cash),
        money(summary.grossProfit, cash),
        money(summary.opex, cash),
        money(summary.netProfit, cash),
        // Null where there is no revenue to be a share of. A blank says that;
        // a zero would claim the margin was nil.
        summary.netMargin === null
          ? blank(number)
          : {
              kind: "number" as const,
              value: Math.round(summary.netMargin * 1000) / 10,
              style: number,
            },
      ],
    }
  }

  return {
    name: "Company sheet",
    columns: columns.map((column) => column.width),
    rows: [
      ...head.rows,
      {
        cells: columns.map((column) => text(column.label, STYLE.header)),
        height: 30,
      },
      ...report.monthSummaries.map((summary) => row(summary, false)),
      row(report.yearSummary, true),
    ],
    freezeAtRow: head.rows.length + 1,
    merges: head.merges,
  }
}

const OPEX_COLUMNS: { label: string; width: number }[] = [
  { label: "Month", width: 14 },
  { label: "Date", width: 12 },
  { label: "Source", width: 18 },
  { label: "Description", width: 52 },
  { label: "Person", width: 34 },
  { label: "Amount", width: 14 },
]

/**
 * What it cost to run the company, as opposed to what it cost to do the jobs.
 *
 * Its own tab rather than more rows on the COGS one: the two are added up
 * against different things — COGS comes off a project's revenue, OPEX comes off
 * the whole year's gross profit — and a single sheet mixing them is one
 * accidental SUM away from a wrong net figure.
 */
function opexSheet(report: ProjectsReport): Sheet {
  const head = titleBlock(
    "Overhead (OPEX)",
    scopeLine(report, "What it cost to run the company across"),
    report.generatedAt,
    OPEX_COLUMNS.length
  )

  const total = report.opexLines.reduce((sum, line) => sum + line.amount, 0)

  return {
    name: "OPEX",
    columns: OPEX_COLUMNS.map((column) => column.width),
    rows: [
      ...head.rows,
      {
        cells: OPEX_COLUMNS.map((column) => text(column.label, STYLE.header)),
        height: 30,
      },
      ...report.opexLines.map((line) => ({
        cells: [
          text(line.monthName, STYLE.text),
          text(line.spentOn, STYLE.number),
          text(line.source, STYLE.number),
          text(line.description, STYLE.note),
          text(line.person, STYLE.text),
          money(line.amount),
        ],
      })),
      {
        cells: [
          text(`${report.opexLines.length} lines`, STYLE.totalText),
          blank(STYLE.totalText),
          blank(STYLE.totalText),
          blank(STYLE.totalText),
          blank(STYLE.totalText),
          money(total, STYLE.totalMoney),
        ],
      },
    ],
    freezeAtRow: head.rows.length + 1,
    merges: head.merges,
  }
}

export function projectsWorkbook(report: ProjectsReport): Sheet[] {
  return [
    companySheet(report),
    projectsSheet(report),
    expensesSheet(report),
    opexSheet(report),
  ]
}

export function projectsWorkbookFileName(report: ProjectsReport) {
  const slug = report.periodLabel
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return `Aerocoole_Projects_${slug}.xlsx`
}

/** Exported for the PDF, which quotes the same rate in its VAT note. */
export const REPORT_VAT_RATE = VAT_RATE
