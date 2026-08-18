"use client"

import { useId, useState } from "react"
import { Table2, TrendingUp } from "lucide-react"

import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Charts, drawn rather than imported
// ---------------------------------------------------------------------------
//
// Six forms, because six jobs: a trend over time (area), part-to-whole for one
// period (a single composition bar), part-to-whole across periods (stacked
// rows), magnitude (bar rows), rank (a leaderboard), and a cyclical profile
// (weekday columns). Anything that is one number is drawn as one number.
//
// Inline SVG and CSS rather than a charting library: the alternative is a
// hundred-odd kilobytes of JavaScript to draw rectangles. The marks follow the
// house rules — thin marks, a hairline grid one shade off the surface, a 2px
// surface gap between adjacent fills, labels only where they actually fit, and
// a table view behind every block.

/**
 * The four categorical slots, in fixed order, assigned by entity and never by
 * rank. Cyan is the app's own brand token to the digit; the other three are
 * stepped to sit with it.
 *
 * Validated as a set rather than eyeballed — worst adjacent CVD ΔE 19.4 against
 * a target of 8, every slot inside the lightness band and over 3:1 on its
 * surface, in both modes. See the note above PALETTE in reports-view.tsx.
 */
export const SERIES = [
  "var(--viz-1)",
  "var(--viz-2)",
  "var(--viz-3)",
  "var(--viz-4)",
] as const

const GRID = "var(--viz-grid)"
const MUTED = "var(--viz-muted)"

export function peso(value: number) {
  return `₱${Math.round(value).toLocaleString("en-PH")}`
}

export function hours(value: number) {
  return `${value.toLocaleString()} h`
}

function niceCeiling(value: number) {
  if (value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const step = [1, 2, 2.5, 5, 10].find((s) => value <= s * magnitude) ?? 10
  return step * magnitude
}

export type StackSeries = { key: string; label: string; color: string }

// ---------------------------------------------------------------------------
// The block — a unit of the report, not a card
// ---------------------------------------------------------------------------
//
// Deliberately without a border, a background or a shadow. Ten identical
// rounded boxes in a grid is the house style of every generated dashboard, and
// it flattens the page: everything looks equally important because everything
// is wearing the same frame. Here the sheet is the only container, and blocks
// are separated by space and a rule.

export function Block({
  title,
  caption,
  columns,
  rows,
  empty,
  children,
  className,
}: {
  title?: string
  caption?: string
  columns: string[]
  rows: (string | number)[][]
  empty?: string
  children: React.ReactNode
  className?: string
}) {
  const [asTable, setAsTable] = useState(false)
  const isEmpty = rows.length === 0

  return (
    <div className={cn("flex min-w-0 flex-col", className)}>
      {(title || !isEmpty) && (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h4 className="text-sm font-medium">{title}</h4>}
            {caption && (
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {caption}
              </p>
            )}
          </div>
          {!isEmpty && (
            <button
              type="button"
              onClick={() => setAsTable((current) => !current)}
              aria-pressed={asTable}
              title={asTable ? "Show the chart" : "Show the numbers"}
              className={cn(
                "-mr-1 flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors",
                asTable
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground/60 hover:bg-muted hover:text-foreground"
              )}
            >
              {asTable ? (
                <TrendingUp className="size-3.5" />
              ) : (
                <Table2 className="size-3.5" />
              )}
              <span className="sr-only">
                {asTable ? "Show the chart" : "Show the numbers"}
              </span>
            </button>
          )}
        </div>
      )}

      <div className={cn("min-w-0", title || caption ? "mt-4" : "")}>
        {isEmpty ? (
          <p className="py-6 text-sm text-muted-foreground">
            {empty ?? "Nothing in this period."}
          </p>
        ) : asTable ? (
          <TableView columns={columns} rows={rows} />
        ) : (
          children
        )}
      </div>
    </div>
  )
}

/** Values as a plain table — the twin every block can be read as instead. */
function TableView({
  columns,
  rows,
}: {
  columns: string[]
  rows: (string | number)[][]
}) {
  return (
    <div className="max-h-72 overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-card">
          <tr className="border-b">
            {columns.map((column, index) => (
              <th
                key={column}
                className={cn(
                  "py-1.5 text-xs font-medium text-muted-foreground",
                  index === 0 ? "text-left" : "text-right"
                )}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={String(row[0])}>
              {row.map((cell, index) => (
                <td
                  key={index}
                  className={cn(
                    "py-1.5",
                    index === 0 ? "text-left" : "text-right tabular-nums"
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** The always-present key for any block drawing more than one series. */
export function Legend({ series }: { series: StackSeries[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {series.map((entry) => (
        <li
          key={entry.key}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          {/* Legends mirror the mark: a rect for a filled bar. */}
          <span
            className="size-2.5 shrink-0 rounded-[3px]"
            style={{ background: entry.color }}
          />
          {entry.label}
        </li>
      ))}
    </ul>
  )
}

// ---------------------------------------------------------------------------
// Part-to-whole — one bar, laid out along the width of the page
// ---------------------------------------------------------------------------
//
// Flex grow rather than percentage widths, so the 2px gaps come out of the
// layout instead of pushing the total past 100%. A segment is labelled inside
// itself only when the label actually fits — a clipped "₱1,2…" is worse than no
// label, and the value is in the tooltip and the table either way.

export function CompositionBar({
  series,
  values,
  format,
  height = 34,
}: {
  series: StackSeries[]
  values: number[]
  format: (value: number) => string
  height?: number
}) {
  const [hover, setHover] = useState<number | null>(null)
  const total = values.reduce((a, b) => a + b, 0)
  const visible = values
    .map((value, slot) => ({ value, slot }))
    .filter((entry) => entry.value > 0)

  return (
    <div className="relative">
      <div className="flex w-full gap-0.5" style={{ height }}>
        {visible.map((entry, index) => {
          const share = entry.value / total
          return (
            <div
              key={series[entry.slot].key}
              onMouseEnter={() => setHover(entry.slot)}
              onMouseLeave={() => setHover(null)}
              className={cn(
                "flex items-center justify-center overflow-hidden transition-opacity",
                index === 0 && "rounded-l-md",
                index === visible.length - 1 && "rounded-r-md",
                hover !== null && hover !== entry.slot && "opacity-45"
              )}
              style={{
                flexGrow: entry.value,
                flexBasis: 0,
                background: series[entry.slot].color,
              }}
            >
              {/* Roughly seven characters need about 12% of a full-width bar. */}
              {share > 0.12 && (
                <span className="truncate px-1.5 text-[11px] font-medium text-white tabular-nums">
                  {Math.round(share * 100)}%
                </span>
              )}
            </div>
          )
        })}
      </div>

      {hover !== null && (
        <div className="pointer-events-none absolute -top-1 left-0 z-10 -translate-y-full rounded-lg border bg-popover px-2 py-1 text-xs whitespace-nowrap shadow-md">
          <span className="font-semibold tabular-nums">
            {format(values[hover])}
          </span>{" "}
          <span className="text-muted-foreground">{series[hover].label}</span>
        </div>
      )}
    </div>
  )
}

/**
 * The same bar, once per period, with its label on the left and its total on
 * the right. Horizontal because cutoff labels are words and a date range — they
 * need the long axis, which a column chart spends on the value instead.
 */
export function StackedRows({
  series,
  rows,
  format,
}: {
  series: StackSeries[]
  rows: { label: string; values: number[] }[]
  format: (value: number) => string
}) {
  const [hover, setHover] = useState<{ row: number; slot: number } | null>(null)
  const totals = rows.map((row) => row.values.reduce((a, b) => a + b, 0))
  const ceiling = Math.max(...totals, 1)

  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row, rowIndex) => (
        <li key={row.label} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="min-w-0 truncate text-muted-foreground">
              {row.label}
            </span>
            <span className="shrink-0 font-medium tabular-nums">
              {format(totals[rowIndex])}
            </span>
          </div>

          {/* Every row is drawn against the largest total, so a short cutoff
              reads as short rather than being stretched to the full width. */}
          <div
            className="flex h-3 gap-0.5"
            style={{ width: `${Math.max((totals[rowIndex] / ceiling) * 100, 2)}%` }}
            onMouseLeave={() => setHover(null)}
          >
            {row.values.map((value, slot) =>
              value <= 0 ? null : (
                <div
                  key={series[slot].key}
                  onMouseEnter={() => setHover({ row: rowIndex, slot })}
                  className={cn(
                    "h-full transition-opacity first:rounded-l-full last:rounded-r-full",
                    hover &&
                      (hover.row !== rowIndex || hover.slot !== slot) &&
                      "opacity-45"
                  )}
                  style={{
                    flexGrow: value,
                    flexBasis: 0,
                    background: series[slot].color,
                  }}
                />
              )
            )}
          </div>

          {/* The readout line is always in the layout, empty or not. Showing it
              only on hover pushes every row below it down by its own height the
              moment the pointer lands — the list walks away from the cursor. */}
          <p className="h-4 text-[11px] text-muted-foreground">
            {hover?.row === rowIndex && (
              <>
                <span
                  className="mr-1.5 inline-block h-0.5 w-3 rounded-full align-middle"
                  style={{ background: series[hover.slot].color }}
                />
                <span className="font-medium text-foreground tabular-nums">
                  {format(row.values[hover.slot])}
                </span>{" "}
                {series[hover.slot].label}
              </>
            )}
          </p>
        </li>
      ))}
    </ul>
  )
}

// ---------------------------------------------------------------------------
// Magnitude — bar rows, one hue
// ---------------------------------------------------------------------------
//
// One hue per block, because the job is "which is biggest", not "which is
// which" — colouring each bar differently would double-encode length as hue and
// spend the only free channel on information the bar already carries. The hue
// differs *between* blocks, following the section it belongs to.

export function BarRows({
  rows,
  color = "var(--viz-1)",
  format = (value: number) => value.toLocaleString(),
}: {
  rows: { label: string; value: number }[]
  color?: string
  format?: (value: number) => string
}) {
  const max = Math.max(...rows.map((row) => row.value), 1)
  const total = rows.reduce((sum, row) => sum + row.value, 0)

  return (
    <ul className="flex flex-col gap-1">
      {rows.map((row) => (
        <li
          key={row.label}
          className="group -mx-2 grid grid-cols-[minmax(0,6.5rem)_1fr_auto] items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/60"
          title={
            total > 0
              ? `${row.label}: ${format(row.value)} · ${Math.round((row.value / total) * 100)}% of ${format(total)}`
              : row.label
          }
        >
          <span className="min-w-0 truncate text-xs text-muted-foreground group-hover:text-foreground">
            {row.label}
          </span>
          <span className="h-2 w-full overflow-hidden rounded-full bg-[var(--viz-track)]">
            <span
              className="block h-full rounded-r-full transition-[width] duration-300"
              style={{
                width: `${Math.max((row.value / max) * 100, 2)}%`,
                background: color,
              }}
            />
          </span>
          <span className="shrink-0 text-xs font-medium tabular-nums">
            {format(row.value)}
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * Rank — the same magnitudes, but where the position in the list is the point.
 * The numeral does the work a y-axis would, so the bar can recede to a hairline.
 */
export function Leaderboard({
  rows,
  color = "var(--viz-1)",
  format = (value: number) => value.toLocaleString(),
}: {
  rows: { label: string; value: number }[]
  color?: string
  format?: (value: number) => string
}) {
  const max = Math.max(...rows.map((row) => row.value), 1)

  return (
    <ol className="flex flex-col">
      {rows.map((row, index) => (
        <li
          key={row.label}
          className="flex items-center gap-3 border-b border-dotted py-2 last:border-0"
        >
          <span className="w-4 shrink-0 text-xs text-muted-foreground/70 tabular-nums">
            {index + 1}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="truncate text-xs">{row.label}</span>
            <span
              className="h-1 rounded-full"
              style={{
                width: `${Math.max((row.value / max) * 100, 3)}%`,
                background: color,
              }}
            />
          </div>
          <span className="shrink-0 text-xs font-medium tabular-nums">
            {format(row.value)}
          </span>
        </li>
      ))}
    </ol>
  )
}

/**
 * A cyclical profile — the same seven columns every time, so the shape of a
 * week is comparable at a glance between one period and the next.
 */
export function WeekdayProfile({
  values,
  color = "var(--viz-1)",
}: {
  /** Sunday first, matching getDay(). */
  values: number[]
  color?: string
}) {
  const max = Math.max(...values, 1)
  const labels = ["S", "M", "T", "W", "T", "F", "S"]

  return (
    <ul className="flex items-end gap-1.5" style={{ height: 92 }}>
      {values.map((value, index) => (
        <li
          key={index}
          className="group flex h-full min-w-0 flex-1 flex-col justify-end gap-1.5"
          title={`${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][index]}: ${value} hours`}
        >
          <span
            className="w-full rounded-t-[3px] transition-opacity group-hover:opacity-75"
            style={{
              height: `${Math.max((value / max) * 100, 1.5)}%`,
              // Weekends recede: the same hue mixed toward the surface, so the
              // working week reads as the subject and Saturday/Sunday as
              // context. Mixed rather than faded with `opacity`, which is an
              // inline style and would beat the hover class above it.
              background:
                index === 0 || index === 6
                  ? `color-mix(in oklab, ${color} 35%, var(--viz-surface))`
                  : color,
            }}
          />
          <span className="text-center text-[10px] text-muted-foreground">
            {labels[index]}
          </span>
        </li>
      ))}
    </ul>
  )
}

// ---------------------------------------------------------------------------
// Magnitude, when the labels are long — a dot plot
// ---------------------------------------------------------------------------
//
// The same job as bar rows, drawn as a stem and a dot instead. It earns its
// place where the values are close together: a row of near-equal bars is a
// featureless block, while the dots stay separate marks the eye can rank.

export function DotPlot({
  rows,
  color = "var(--viz-1)",
  format = (value: number) => value.toLocaleString(),
}: {
  rows: { label: string; value: number }[]
  color?: string
  format?: (value: number) => string
}) {
  const max = Math.max(...rows.map((row) => row.value), 1)

  return (
    <ul className="flex flex-col">
      {rows.map((row) => (
        <li
          key={row.label}
          className="group grid grid-cols-[minmax(0,6rem)_1fr_auto] items-center gap-3 py-1.5"
        >
          <span className="min-w-0 truncate text-xs text-muted-foreground group-hover:text-foreground">
            {row.label}
          </span>
          <span className="relative flex h-4 items-center">
            {/* The stem recedes to a hairline; the dot carries the value. */}
            <span
              className="h-px bg-[var(--viz-track)]"
              style={{ width: `${Math.max((row.value / max) * 100, 1)}%` }}
            />
            <span
              className="size-2.5 shrink-0 rounded-full transition-transform group-hover:scale-125"
              style={{ background: color }}
            />
          </span>
          <span className="shrink-0 text-xs font-medium tabular-nums">
            {format(row.value)}
          </span>
        </li>
      ))}
    </ul>
  )
}

// ---------------------------------------------------------------------------
// One ratio against its limit — a meter
// ---------------------------------------------------------------------------
//
// Not a chart and not a pie: a single proportion, drawn on the same track its
// own scale uses. The number is the point, so the number is large.

export function Meter({
  value,
  total,
  label,
  color = "var(--viz-1)",
}: {
  value: number
  total: number
  label: string
  color?: string
}) {
  const share = total > 0 ? value / total : 0

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <span className="text-3xl leading-none font-semibold">
          {Math.round(share * 100)}%
        </span>
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {label}
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-[var(--viz-track)]"
        role="meter"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={label}
      >
        <span
          className="block h-full rounded-full transition-[width] duration-500"
          style={{ width: `${Math.max(share * 100, 1)}%`, background: color }}
        />
      </div>
      <p className="text-[11px] text-muted-foreground tabular-nums">
        {value.toLocaleString()} of {total.toLocaleString()}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Opposed outcomes — a diverging bar
// ---------------------------------------------------------------------------
//
// Two poles either side of one axis, because approved and rejected are not two
// categories of the same thing — they are opposite answers to the same
// question, and a stacked bar would hide that by laying them end to end.
// Both sides carry a written label, so the meaning never rests on colour.

export function DivergingBar({
  left,
  right,
  format,
}: {
  left: { label: string; value: number; color: string }
  right: { label: string; value: number; color: string }
  format: (value: number) => string
}) {
  const max = Math.max(left.value, right.value, 1)

  return (
    <div className="flex flex-col gap-2">
      {[left, right].map((side, index) => {
        const isLeft = index === 0
        return (
          <div key={side.label} className="flex items-center gap-2 text-xs">
            <span className="w-20 shrink-0 truncate text-right text-muted-foreground">
              {isLeft ? side.label : ""}
            </span>
            <span className="relative flex h-5 flex-1 items-center">
              {/* The centre rule is the axis both sides are measured from. */}
              <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border" />
              <span
                className={cn(
                  "absolute h-3",
                  isLeft
                    ? "right-1/2 rounded-l-full"
                    : "left-1/2 rounded-r-full"
                )}
                style={{
                  width: `${(side.value / max) * 50}%`,
                  background: side.color,
                }}
              />
            </span>
            <span className="w-20 shrink-0 truncate text-muted-foreground">
              {isLeft ? "" : side.label}
            </span>
          </div>
        )
      })}
      <div className="flex items-center gap-2 text-xs">
        <span className="w-20 shrink-0 text-right font-medium tabular-nums">
          {format(left.value)}
        </span>
        <span className="flex-1" />
        <span className="w-20 shrink-0 font-medium tabular-nums">
          {format(right.value)}
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// A period at a glance — the calendar heatmap
// ---------------------------------------------------------------------------
//
// One cell per day, a column per week. The trend above it says whether hours
// went up; this says *which days* — and, more usefully, which days are blank.
// A gap is invisible on a line chart, which draws straight through a zero, and
// obvious here as an empty square.
//
// Sequential, so one hue in graded steps. More is darker; the ramp's middle
// step is the app's brand colour.

const HEAT_RAMP = [
  "var(--viz-h1)",
  "var(--viz-h2)",
  "var(--viz-h3)",
  "var(--viz-h4)",
  "var(--viz-h5)",
]

export function CalendarHeatmap({
  points,
  format = (value: number) => `${value} hours`,
}: {
  points: { date: string; hours: number; punches: number }[]
  format?: (value: number) => string
}) {
  const max = Math.max(...points.map((point) => point.hours), 1)

  // Lead the grid with blanks so the first column starts on a Sunday and every
  // row is the same weekday all the way across.
  const lead = new Date(`${points[0].date}T00:00:00`).getDay()
  const cells: ({ date: string; hours: number; punches: number } | null)[] = [
    ...Array<null>(lead).fill(null),
    ...points,
  ]

  const step = (value: number) => {
    if (value <= 0) return null
    // Five steps, so the darkest is reserved for the heaviest days rather than
    // being handed out to anything above average.
    return HEAT_RAMP[Math.min(4, Math.floor((value / max) * 5 - 0.0001))]
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto pb-1">
        <div className="flex gap-1">
          {/* Three of seven, which is the convention: enough to orient, not so
              many that the labels outweigh the data. */}
          <div className="grid grid-rows-7 gap-[3px] pr-1 text-[9px] text-muted-foreground">
            {["", "M", "", "W", "", "F", ""].map((label, index) => (
              <span key={index} className="flex h-3 items-center leading-none">
                {label}
              </span>
            ))}
          </div>

          <div className="grid grid-flow-col grid-rows-7 gap-[3px]">
            {cells.map((cell, index) =>
              cell === null ? (
                <span key={`pad-${index}`} className="size-3" />
              ) : (
                <span
                  key={cell.date}
                  title={`${cell.date} · ${format(cell.hours)}${cell.punches > 0 ? ` · ${cell.punches} punch${cell.punches === 1 ? "" : "es"}` : ""}`}
                  className="size-3 rounded-[3px] ring-1 ring-inset ring-black/[0.04] transition-transform hover:scale-125"
                  style={{
                    background: step(cell.hours) ?? "var(--viz-track)",
                  }}
                />
              )
            )}
          </div>
        </div>
      </div>

      {/* A sequential scale always ships its key. */}
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span>None</span>
        <span className="size-3 rounded-[3px] bg-[var(--viz-track)]" />
        {HEAT_RAMP.map((shade) => (
          <span
            key={shade}
            className="size-3 rounded-[3px]"
            style={{ background: shade }}
          />
        ))}
        <span>{max} h</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Trend over time — a single area
// ---------------------------------------------------------------------------
//
// One series, so no legend: the heading names it. Hovering reads the day out,
// because a month of daily marks is far too many to label.

/** Weekends are shaded up to this many days; past it the stripes are noise. */
const WEEKEND_BAND_LIMIT = 62

function weekdayOf(date: string) {
  return new Date(`${date}T00:00:00`).getDay()
}

/** "Mon, 3 Aug" — only ever rendered on hover, never during SSR. */
function longDay(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-PH", {
    weekday: "short",
    day: "numeric",
    month: "short",
  })
}

export function AreaTrend({
  points,
  height = 200,
  color = "var(--viz-1)",
}: {
  points: { date: string; hours: number; punches: number }[]
  height?: number
  color?: string
}) {
  const gradientId = useId()
  const [hover, setHover] = useState<number | null>(null)

  const width = 720
  const padding = { top: 12, right: 10, bottom: 22, left: 30 }
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom

  const ceiling = niceCeiling(Math.max(...points.map((p) => p.hours), 1))
  const single = points.length === 1
  const stepX = points.length > 1 ? plotWidth / (points.length - 1) : plotWidth

  // Rounded, because these end up in the HTML as text. A year-long range is
  // ~360 points across two paths, and "95.69999999999999" instead of "95.7"
  // is eleven kilobytes of nothing on a phone paying for every one of them.
  const round = (value: number) => Math.round(value * 100) / 100
  const x = (index: number) => round(padding.left + index * stepX)
  const y = (value: number) =>
    round(padding.top + plotHeight - (value / ceiling) * plotHeight)

  // A one-day range still deserves a mark, so it draws as a flat segment across
  // the plot rather than as a path with a single point, which renders nothing.
  const line = single
    ? `M${padding.left},${y(points[0].hours)} L${padding.left + plotWidth},${y(points[0].hours)}`
    : points
        .map((point, index) => `${index === 0 ? "M" : "L"}${x(index)},${y(point.hours)}`)
        .join(" ")
  const baseline = padding.top + plotHeight
  const area = `${line} L${round(padding.left + (single ? plotWidth : (points.length - 1) * stepX))},${baseline} L${padding.left},${baseline} Z`

  // Deduplicated by label: on a period where nobody worked the ceiling is 1, and
  // the midpoint tick rounds to the same "1" as the top — an axis reading
  // "0, 1, 1" makes the reader distrust the chart.
  const ticks = [0, 0.5, 1]
    .map((fraction) => ({
      label: String(Math.round(ceiling * fraction)),
      y: padding.top + plotHeight - fraction * plotHeight,
    }))
    .filter(
      (tick, index, all) =>
        all.findIndex((other) => other.label === tick.label) === index
    )

  const active = hover === null ? null : points[hover]

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ height }}
        role="img"
        aria-label="Hours on the clock per day. Use the arrow keys to read each day."
        tabIndex={0}
        className="w-full rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onMouseLeave={() => setHover(null)}
        onBlur={() => setHover(null)}
        // The same readout on keyboard as on hover, so the chart isn't a
        // pointer-only feature. (The table view is the other way to every
        // number here, for anyone who'd rather not walk 30 days one at a time.)
        onKeyDown={(event) => {
          const delta =
            event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0
          if (delta === 0) return
          event.preventDefault()
          setHover((current) => {
            const next = (current ?? -1) + delta
            return Math.min(Math.max(next, 0), points.length - 1)
          })
        }}
      >
        {/* Weekends, so a dip on Sunday reads as a Sunday rather than as a
            problem. Recessive enough to sit under the grid. */}
        {points.length <= WEEKEND_BAND_LIMIT &&
          points.map((point, index) => {
            const day = weekdayOf(point.date)
            if (day !== 0 && day !== 6) return null
            const left = Math.max(padding.left, x(index) - stepX / 2)
            const right = Math.min(padding.left + plotWidth, x(index) + stepX / 2)
            return (
              <rect
                key={point.date}
                x={round(left)}
                y={padding.top}
                width={round(Math.max(right - left, 1))}
                height={plotHeight}
                fill="var(--viz-track)"
              />
            )
          })}

        {/* Hairline grid, solid, one shade off the surface. */}
        {ticks.map((tick) => (
          <g key={tick.y}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={tick.y}
              y2={tick.y}
              stroke={GRID}
              strokeWidth={1}
            />
            <text
              x={padding.left - 6}
              y={tick.y + 3}
              textAnchor="end"
              fontSize={9}
              fill={MUTED}
              className="tabular-nums"
            >
              {tick.label}
            </text>
          </g>
        ))}

        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.24} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        <path d={area} fill={`url(#${gradientId})`} />
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {active && hover !== null && (
          <>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={padding.top}
              y2={baseline}
              stroke={GRID}
              strokeWidth={1}
            />
            {/* A 2px surface ring, so the marker reads on top of the line. */}
            <circle
              cx={x(hover)}
              cy={y(active.hours)}
              r={4.5}
              fill={color}
              stroke="var(--viz-surface)"
              strokeWidth={2}
            />
          </>
        )}

        {/* One nearest-point surface rather than a rect per day: the pointer
            only has to be *closest* to a day, never on it — which is the only
            workable model once a year's worth of points are 2px apart — and it
            keeps ~360 elements out of the markup on a long range. */}
        <rect
          x={padding.left}
          y={padding.top}
          width={plotWidth}
          height={plotHeight}
          fill="transparent"
          onMouseMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect()
            if (box.width === 0) return
            const ratio = (event.clientX - box.left) / box.width
            const index = Math.round(ratio * (points.length - 1))
            setHover(Math.min(Math.max(index, 0), points.length - 1))
          }}
        />

        {/* Only the ends are labelled — a number on every point is chaos. */}
        <text x={padding.left} y={height - 6} fontSize={9} fill={MUTED}>
          {points[0]?.date.slice(5)}
        </text>
        {!single && (
          <text
            x={width - padding.right}
            y={height - 6}
            fontSize={9}
            fill={MUTED}
            textAnchor="end"
          >
            {points[points.length - 1]?.date.slice(5)}
          </text>
        )}
      </svg>

      {/* The readout follows the crosshair rather than sitting in a corner, so
          the eye never has to travel to find the value it just pointed at. */}
      {active && hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border bg-popover px-2 py-1.5 text-xs whitespace-nowrap shadow-md"
          style={{
            left: `clamp(4rem, ${round((x(hover) / width) * 100)}%, calc(100% - 4rem))`,
          }}
        >
          {/* Value leads, label follows — the reader has the day and wants the
              number. */}
          <p className="font-semibold tabular-nums">{active.hours} hours</p>
          <p className="text-muted-foreground">
            {longDay(active.date)} · {active.punches}{" "}
            {active.punches === 1 ? "punch" : "punches"}
          </p>
        </div>
      )}
    </div>
  )
}
