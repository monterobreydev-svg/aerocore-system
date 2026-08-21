"use client"

import { MONTH_NAMES } from "@/lib/documents"
import {
  amount,
  MONEY_COLUMNS,
  PAYMENT_TERMS_LABELS,
  PROJECT_STATUS_CHIP,
  PROJECT_STATUS_LABELS,
  type ProjectMonth,
  type ProjectRow,
  type ProjectTotals,
} from "@/lib/projects"
import { formatScheduleDate } from "@/lib/schedule"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// The job-by-job ledger
//
// Lives apart from the view so the company sheet — which is what this page
// opens on — doesn't carry this table's markup in the chunk that paints first.
//
// Every month is one table inside ONE horizontal scroller, not a scroller each.
// A scrollbar per month means twelve of them to drag, and a figure in March
// lands under a different heading from the same figure in April — the columns
// only mean anything if all the months move together.
// ---------------------------------------------------------------------------

/**
 * Every column, with the width it always has.
 *
 * Declared once and applied through a <colgroup> on a `table-fixed` table, so
 * a month of long project names and a month of short ones line up exactly.
 * Left to itself the browser sizes columns from their contents, which is what
 * made each month's table a slightly different shape from the last.
 */
const LEAD_COLUMNS = [
  { key: "so", label: "S.O. No.", width: 86 },
  { key: "project", label: "Project", width: 236 },
  { key: "client", label: "Client", width: 168 },
  { key: "status", label: "Status", width: 108 },
  { key: "dates", label: "Dates", width: 136 },
  { key: "terms", label: "TOP", width: 140 },
] as const

const MONEY_WIDTH = 112

/** Where a totals row's label ends and its figures begin. */
const LEAD_SPAN = LEAD_COLUMNS.length

const TABLE_WIDTH =
  LEAD_COLUMNS.reduce((sum, column) => sum + column.width, 0) +
  MONEY_COLUMNS.length * MONEY_WIDTH

// The first column stays put while the money scrolls past it — without it you
// lose track of which project a figure 1,500px to the right belongs to. It
// paints its own background so rows don't show through, and picks up the row's
// hover so the strip doesn't read as a separate element. z-1, not z-10: it only
// has to sit above its neighbouring cells, and anything higher competes with
// the sidebar and the dialog.
const STICKY_CELL = "sticky left-0 z-1 bg-card group-hover/row:bg-muted/50"

function dayLabel(value: string) {
  return formatScheduleDate(`${value}T00:00:00`)
}

function profitTone(value: number) {
  return value < 0
    ? "text-rose-700 dark:text-rose-400"
    : "text-emerald-700 dark:text-emerald-400"
}

function Columns() {
  return (
    <colgroup>
      {LEAD_COLUMNS.map((column) => (
        <col key={column.key} style={{ width: column.width }} />
      ))}
      {MONEY_COLUMNS.map((column) => (
        <col key={column.key} style={{ width: MONEY_WIDTH }} />
      ))}
    </colgroup>
  )
}

function HeaderRow() {
  return (
    <thead>
      <tr className="border-b bg-muted text-[0.625rem] tracking-wide text-muted-foreground uppercase">
        {LEAD_COLUMNS.map((column, index) => (
          <th
            key={column.key}
            scope="col"
            className={cn(
              "h-8 px-2.5 text-left font-semibold",
              index === 0 && "sticky left-0 z-1 bg-muted"
            )}
          >
            {column.label}
          </th>
        ))}
        {MONEY_COLUMNS.map((column) => (
          <th
            key={column.key}
            scope="col"
            className="h-8 px-2.5 text-right font-semibold"
            title={column.label}
          >
            {column.short}
          </th>
        ))}
      </tr>
    </thead>
  )
}

/** The nine money cells of a project row or a totals row, in one order. */
function MoneyCells({
  figures,
  strong = false,
}: {
  figures: ProjectTotals | ProjectRow
  strong?: boolean
}) {
  return (
    <>
      {MONEY_COLUMNS.map((column) => (
        <td
          key={column.key}
          className={cn(
            "px-2.5 py-1.5 text-right tabular-nums",
            strong && "font-semibold",
            column.key === "grossProfit" && profitTone(figures.grossProfit)
          )}
        >
          {amount(figures[column.key])}
        </td>
      ))}
    </>
  )
}

function ProjectRowCells({
  project,
  onOpen,
}: {
  project: ProjectRow
  onOpen: (project: ProjectRow) => void
}) {
  return (
    <tr
      onClick={() => onOpen(project)}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter") onOpen(project)
      }}
      className="group/row cursor-pointer border-b transition-colors last:border-b-0 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
    >
      <td className={cn(STICKY_CELL, "px-2.5 py-1.5 font-mono text-[0.6875rem]")}>
        {project.salesOrderNo}
      </td>

      <td className="px-2.5 py-1.5">
        {/* Fixed width plus truncate: a 90-character description can't widen
            the column and shove the money off the far side of the table. The
            whole name is one hover (or one tap on the row) away. */}
        <p className="truncate font-medium" title={project.name}>
          {project.name}
        </p>
        {project.siNo && (
          <p className="truncate text-[0.6875rem] text-muted-foreground">
            S.I. {project.siNo}
          </p>
        )}
      </td>

      <td className="px-2.5 py-1.5">
        <p className="truncate" title={project.clientName}>
          {project.clientName}
        </p>
      </td>

      <td className="px-2.5 py-1.5">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-1.5 py-0.5 text-[0.6875rem] font-medium whitespace-nowrap",
            PROJECT_STATUS_CHIP[project.status]
          )}
        >
          {PROJECT_STATUS_LABELS[project.status]}
        </span>
      </td>

      <td className="px-2.5 py-1.5 text-[0.6875rem] tabular-nums">
        <p>{dayLabel(project.startDate)}</p>
        <p className="text-muted-foreground">
          {project.endDate ? dayLabel(project.endDate) : "open-ended"}
        </p>
      </td>

      <td className="px-2.5 py-1.5">
        <p
          className="truncate text-[0.6875rem] text-muted-foreground"
          title={PAYMENT_TERMS_LABELS[project.terms]}
        >
          {PAYMENT_TERMS_LABELS[project.terms]}
        </p>
      </td>

      <MoneyCells figures={project} />
    </tr>
  )
}

/** One month: its own card, its own heading, its own total. */
function MonthSection({
  month,
  year,
  onOpen,
}: {
  month: ProjectMonth
  year: number
  onOpen: (project: ProjectRow) => void
}) {
  const name = MONTH_NAMES[month.month]

  return (
    // overflow-CLIP, not overflow-hidden: `hidden` makes a box a scroll
    // container, and a sticky cell sticks to its nearest scrolling ancestor —
    // which would be this card rather than the one scroller outside, quietly
    // turning the frozen first column back into an ordinary one. `clip` rounds
    // the corners without creating that box.
    <section className="overflow-clip rounded-xl border bg-card shadow-xs">
      {/* The card is as wide as the table, so the heading's contents are held
          against the left edge of the scroller — otherwise the month you are
          reading scrolls out of sight the moment you go looking for its VAT. */}
      {/* Just the month and how much is in it. The figures live in the total
          row at the foot of the table, under the columns they belong to —
          repeating two of them up here only invited the question of why those
          two and not the other seven. */}
      <header className="border-b bg-card">
        <div className="sticky left-0 flex w-fit items-center gap-2.5 px-3 py-2">
          <div className="flex size-8 shrink-0 flex-col items-center justify-center rounded-lg bg-sky-600/10 text-sky-700 dark:text-sky-400">
            <span className="text-[0.5625rem] leading-none font-semibold tracking-wide uppercase">
              {name.slice(0, 3)}
            </span>
            <span className="mt-0.5 text-[0.5625rem] leading-none opacity-70">
              {String(year).slice(2)}
            </span>
          </div>
          <div>
            <h3 className="text-sm leading-tight font-semibold">
              {name} {year}
            </h3>
            <p className="text-[0.6875rem] text-muted-foreground tabular-nums">
              {month.totals.count} project{month.totals.count === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      </header>

      <table className="w-full table-fixed border-collapse text-[0.8125rem]">
        <Columns />
        <HeaderRow />

        <tbody>
          {month.projects.map((project) => (
            <ProjectRowCells
              key={project.id}
              project={project}
              onOpen={onOpen}
            />
          ))}
        </tbody>

        {/* Solid rather than translucent: the totals strip reads as the end of
            the month, and a wash of muted/50 over the card is too faint to. */}
        <tfoot className="bg-muted">
          <tr>
            {/* The cell itself must NOT be sticky. It spans six columns, so
                pinning it to the left edge parks 870px of opaque background
                over the figures scrolling underneath — which is exactly what
                buried the totals. Only its label travels; the cell stays in
                the flow where it belongs. */}
            <td colSpan={LEAD_SPAN} className="px-2.5 py-2">
              <span className="sticky left-2.5 block w-fit text-xs font-semibold">
                {name} total
              </span>
            </td>
            <MoneyCells figures={month.totals} strong />
          </tr>
        </tfoot>
      </table>
    </section>
  )
}

/**
 * The year's own total, in the same columns as the months above it.
 *
 * A card of tiles would have been easier, but then the year's Output VAT would
 * sit somewhere other than every month's Output VAT, and checking one against
 * the other becomes a hunt. Same table, same widths, one row.
 */
function YearTotal({ totals, year }: { totals: ProjectTotals; year: number }) {
  return (
    // Ringed rather than tinted: a background tint would have to be repeated
    // exactly on the frozen first cell to keep the strip looking like one row,
    // and any mismatch shows as a seam the moment the table is scrolled.
    <section className="overflow-clip rounded-xl border bg-card shadow-xs ring-1 ring-sky-600/25">
      <table className="w-full table-fixed border-collapse text-[0.8125rem]">
        <Columns />
        <tbody>
          <tr>
            {/* Same rule as the monthly total: the label travels, the cell
                doesn't — a six-column sticky cell would cover the year's own
                figures the moment anyone scrolled to read them. */}
            <td colSpan={LEAD_SPAN} className="px-2.5 py-2">
              <span className="sticky left-2.5 block w-fit whitespace-nowrap">
                <span className="text-xs font-semibold text-sky-700 dark:text-sky-400">
                  {year} total
                </span>
                <span className="ml-2 text-[0.6875rem] text-muted-foreground tabular-nums">
                  {totals.count} project{totals.count === 1 ? "" : "s"}
                </span>
              </span>
            </td>
            <MoneyCells figures={totals} strong />
          </tr>
        </tbody>
      </table>
    </section>
  )
}

export function ProjectsLedger({
  months,
  year,
  yearTotals,
  onOpen,
}: {
  months: ProjectMonth[]
  year: number
  yearTotals: ProjectTotals
  onOpen: (project: ProjectRow) => void
}) {
  return (
    // min-w-0 is what keeps this box from widening the whole page: a flex or
    // grid child refuses to shrink below its content unless told to, so the
    // 1,800px of table pushed the body sideways instead of scrolling in here —
    // which dragged the frozen column out from under the sidebar with it.
    <div className="min-w-0 overflow-x-auto pb-1">
      {/* One width for every month, so all of them scroll as one and a figure
          in March sits under the same heading as the same figure in April. */}
      <div
        className="flex flex-col gap-4"
        style={{ minWidth: TABLE_WIDTH }}
      >
        {months.map((month) => (
          <MonthSection
            key={month.month}
            month={month}
            year={year}
            onOpen={onOpen}
          />
        ))}

        <YearTotal totals={yearTotals} year={year} />
      </div>
    </div>
  )
}
