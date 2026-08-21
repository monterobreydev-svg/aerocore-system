import "server-only"

import {
  CONTENT_WIDTH,
  MARGIN,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  drawText,
  renderPdf,
  wrapText,
  type PdfBlock,
  type PdfBox,
} from "@/lib/formats/pdf"
import {
  barList,
  barListHeight,
  clip,
  columns,
  compositionBar,
  compositionBarHeight,
  hairline,
  key,
  keyHeight,
  rect,
  stackedColumns,
  type ChartInk,
  type Series,
} from "@/lib/formats/chart"
import type { ReportData, Slice } from "@/lib/reports"

// ---------------------------------------------------------------------------
// The operations report, as a document
// ---------------------------------------------------------------------------
//
// The same period the reports page shows, laid out to be read away from the
// screen — in a meeting, on a phone, by somebody who was not the one holding
// the filters. So it carries its own provenance on every page: whose company it
// is, what dates it covers, when it was generated and by whom. A figure without
// those four things is a figure nobody can act on six weeks later.
//
// Every section is a heading, a sentence or two saying what the numbers say,
// the picture, and then the figures. The sentences are composed from the same
// object the charts are drawn from, so the two can never disagree; they are
// deliberately plain, and deliberately hedged where the data is thin — "too
// little to call a trend" is more useful than a confident direction inferred
// from three days.
//
// The tables that are a *record* rather than a finding — every day's hours —
// are moved to an appendix at the back. A section that opens with ninety rows
// of figures is one nobody reads to the end of.

// ---------------------------------------------------------------------------
// The palette
// ---------------------------------------------------------------------------
//
// The same values the reports page draws with, as hexes rather than as CSS
// custom properties: four categorical slots assigned by entity and never by
// rank, and two five-step ordinal ramps for the quantities that are one thing
// divided up. They were computed and put through the validator there — worst
// adjacent CVD ΔE 19.4 against a target of 8, every slot inside the lightness
// band and over 3:1 on its surface — and paper is the white surface they were
// validated against, so they transfer exactly.
//
// Screen and print agreeing matters more here than it usually does: somebody
// reads the period on the page, downloads it, and puts the two side by side.

const VIZ = {
  attendance: "#0092b7",
  payroll: "#dc631e",
  scheduling: "#7935c6",
  claims: "#0e9254",
} as const

/** A lifecycle, so one hue in graded steps rather than five unrelated colours. */
const STATUS_RAMP = ["#6213ab", "#7a3dc5", "#9260da", "#aa83ea", "#bfa4f0"]

/** The cyan ramp, darkest first — for anything split by kind rather than state. */
const CYAN_RAMP = ["#005b7b", "#00769b", "#0092b7", "#19adcc", "#6cc2da"]

const PAPER = {
  /** The letterhead, and the same navy as the application's navigation rail. */
  navy: "#132134",
  navyLift: "#1d3049",
  /** Legible on the navy, and the brand's own hue. */
  navyText: "#a9bed2",
  accent: "#3aa9cd",

  ink: "#0e141e",
  muted: "#626d78",
  hair: "#d9e1e7",
  grid: "#e6ecf1",
  tint: "#f2f6fa",
  track: "#eaf0f5",

  warnInk: "#9a4a06",
  warnTint: "#fdf4e7",
  warnRule: "#e08c2c",
} as const

const INK: ChartInk = {
  grid: PAPER.grid,
  muted: PAPER.muted,
  ink: PAPER.ink,
  track: PAPER.track,
}

const COMPANY = "Aerocoole Airconditioning Services"
const DOCUMENT = "Operations Report"

// ---------------------------------------------------------------------------
// Measurements
// ---------------------------------------------------------------------------

/** The navy band on page one. */
const LETTERHEAD = 104

/** The running header on every page after it. */
const RUNNING_HEAD = 34

/** The footer, on all of them. */
const FOOTER = 32

/**
 * Prose is set narrower than the page.
 *
 * A line of 8.5pt type across the full 499pt column is well over ninety
 * characters, and the eye loses the start of the next line on the way back.
 * Everything measured — charts, tables, the letterhead — still uses the full
 * width; only the reading does not.
 */
const PROSE_WIDTH = 432

const BODY = 8.6

// ---------------------------------------------------------------------------
// Words and numbers
// ---------------------------------------------------------------------------

/**
 * Whole pesos, labelled PHP.
 *
 * Not "₱": the standard PDF fonts are WinAnsi and WinAnsi has no slot for the
 * peso sign, so embedding one would mean embedding a font — a hundred kilobytes
 * on a document a field office downloads over mobile data, to save three
 * characters.
 */
function peso(value: number) {
  return `PHP ${Math.round(value).toLocaleString("en-PH")}`
}

function amount(value: number) {
  return Math.round(value).toLocaleString("en-PH")
}

/** Axis figures, where "482k" says as much as "482,316" in a third the room. */
function compact(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`
  return String(Math.round(value))
}

function plural(count: number, one: string, many = `${one}s`) {
  return count === 1 ? one : many
}

function upper(text: string) {
  return text.toUpperCase()
}

/** "1 Aug", for an axis tick. */
function shortDay(key: string) {
  const date = new Date(`${key}T00:00:00`)
  return date.toLocaleDateString("en-PH", { day: "numeric", month: "short" })
}

function longDay(key: string) {
  const date = new Date(`${key}T00:00:00`)
  return date.toLocaleDateString("en-PH", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })
}

function weekday(key: string) {
  return new Date(`${key}T00:00:00`).toLocaleDateString("en-PH", {
    weekday: "short",
  })
}

// ---------------------------------------------------------------------------
// The furniture
// ---------------------------------------------------------------------------

export type ReportMeta = {
  /** Whose name goes on it. */
  generatedBy: string
  /** Their role, so a reader knows what the signature is worth. */
  role: string
  generatedAt: Date
}

function stamp(at: Date) {
  return at.toLocaleString("en-PH", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

/**
 * The letterhead: a full-bleed navy band with the company's name in it.
 *
 * Drawn as page furniture rather than as a block in the flow so it can run to
 * the paper's edge — a band that stops at the margin reads as a box somebody
 * put on the page, and a masthead should read as the page itself.
 */
function letterhead(data: ReportData) {
  const top = PAGE_HEIGHT
  const bottom = PAGE_HEIGHT - LETTERHEAD

  return [
    ...rect(0, bottom, PAGE_WIDTH, LETTERHEAD, PAPER.navy),

    // A lighter wedge under the right-hand corner. The band is a large flat
    // area and one shade of relief across it is the difference between a
    // printed letterhead and a filled rectangle.
    ...rect(PAGE_WIDTH - 190, bottom, 190, LETTERHEAD, PAPER.navyLift),
    ...rect(PAGE_WIDTH - 190, bottom, 2, LETTERHEAD, PAPER.accent),

    // The rule the whole document hangs off.
    ...rect(0, bottom - 3, PAGE_WIDTH, 3, PAPER.accent),

    ...drawText("Aerocoole", {
      x: MARGIN,
      y: top - 46,
      font: "sans-bold",
      size: 21,
      color: "#ffffff",
    }),
    ...drawText("Airconditioning Services", {
      x: MARGIN,
      y: top - 61,
      size: 9.5,
      color: PAPER.navyText,
    }),
    ...hairline(MARGIN, top - 72, MARGIN + 132, top - 72, PAPER.accent, {
      weight: 1.2,
    }),
    ...drawText(upper(DOCUMENT), {
      x: MARGIN,
      y: top - 86,
      font: "sans-bold",
      size: 8,
      color: PAPER.accent,
    }),

    ...drawText(upper("Period covered"), {
      x: PAGE_WIDTH - MARGIN,
      y: top - 44,
      size: 6.5,
      align: "right",
      color: PAPER.navyText,
    }),
    ...drawText(data.range.label, {
      x: PAGE_WIDTH - MARGIN,
      y: top - 60,
      font: "sans-bold",
      size: 12,
      align: "right",
      color: "#ffffff",
    }),
    ...drawText(
      `${data.range.days} ${plural(data.range.days, "day")} · ${data.headline.staff} on the payroll`,
      {
        x: PAGE_WIDTH - MARGIN,
        y: top - 74,
        size: 7.5,
        align: "right",
        color: PAPER.navyText,
      }
    ),
  ]
}

/** Pages two onward: who this is and what period, in one quiet line. */
function runningHead(data: ReportData) {
  const y = PAGE_HEIGHT - MARGIN + 6

  return [
    ...drawText(COMPANY, {
      x: MARGIN,
      y,
      font: "sans-bold",
      size: 7.5,
      color: PAPER.ink,
    }),
    ...drawText(`${DOCUMENT} · ${data.range.label}`, {
      x: PAGE_WIDTH - MARGIN,
      y,
      size: 7.5,
      align: "right",
      color: PAPER.muted,
    }),
    ...hairline(MARGIN, y - 6, PAGE_WIDTH - MARGIN, y - 6, PAPER.hair),
  ]
}

/**
 * The footer, on every page.
 *
 * It carries the generation stamp rather than leaving it on page one, because a
 * page of a report is photocopied, forwarded and pinned to a wall on its own,
 * and a figure whose date and author stayed behind on the cover is a figure
 * somebody will quote out of date.
 */
function footer(data: ReportData, meta: ReportMeta, page: number, total: number) {
  const y = MARGIN - 8

  return [
    ...hairline(MARGIN, y + 16, PAGE_WIDTH - MARGIN, y + 16, PAPER.hair),
    ...drawText(
      `Generated ${stamp(meta.generatedAt)} by ${meta.generatedBy} · ${meta.role}`,
      { x: MARGIN, y, size: 6.8, color: PAPER.muted }
    ),
    ...drawText(`Page ${page} of ${total}`, {
      x: PAGE_WIDTH - MARGIN,
      y,
      font: "sans-bold",
      size: 6.8,
      align: "right",
      color: PAPER.muted,
    }),
  ]
}

// ---------------------------------------------------------------------------
// The blocks a section is built from
// ---------------------------------------------------------------------------

/** A section heading: its number, its name, and the rule in its own colour. */
function heading(index: number, title: string, accent: string): PdfBlock[] {
  return [
    { kind: "space", height: 20 },
    {
      kind: "draw",
      height: 26,
      render: (box) => [
        ...rect(box.x, box.y - 15, 15, 15, accent),
        ...drawText(String(index), {
          x: box.x + 7.5,
          y: box.y - 11,
          font: "sans-bold",
          size: 8.5,
          align: "center",
          color: "#ffffff",
        }),
        ...drawText(title, {
          x: box.x + 22,
          y: box.y - 11.5,
          font: "sans-bold",
          size: 12,
          color: PAPER.ink,
        }),
        ...rect(box.x, box.y - 21, box.width, 1.4, accent),
      ],
    },
    { kind: "space", height: 2 },
  ]
}

/** A smaller heading inside a section. */
function subheading(text: string): PdfBlock[] {
  return [
    { kind: "space", height: 10 },
    {
      kind: "text",
      text: upper(text),
      font: "sans-bold",
      size: 7.4,
      color: PAPER.muted,
      leading: 1.7,
    },
  ]
}

/** A paragraph, measured against the type rather than guessed at by character. */
function prose(text: string, width = PROSE_WIDTH): PdfBlock[] {
  return wrapText(text, "sans", BODY, width).map((line) => ({
    kind: "text" as const,
    text: line,
    size: BODY,
    color: PAPER.ink,
    leading: 1.62,
  }))
}

/** A note in the margin voice — smaller, greyer, for a caveat under a chart. */
function caption(text: string): PdfBlock[] {
  return [
    { kind: "space", height: 3 },
    ...wrapText(text, "sans", 7.2, PROSE_WIDTH).map((line) => ({
      kind: "text" as const,
      text: line,
      size: 7.2,
      color: PAPER.muted,
      leading: 1.5,
    })),
  ]
}

/** A chart, given the height it asked for. */
function figure(height: number, render: (box: PdfBox) => string[]): PdfBlock {
  return { kind: "draw", height, render }
}

/**
 * A tinted panel with lines of text in it — used for the things that are not
 * findings: what needs attention, and how the figures were arrived at.
 */
function panel({
  title,
  lines,
  tint,
  rule,
  ink,
}: {
  title: string
  lines: string[]
  tint: string
  rule: string
  ink: string
}): PdfBlock {
  const PAD = 14
  const HANG = 9

  // Each entry keeps its own hanging indent, so a line that wraps stays visibly
  // part of the entry above it rather than reading as another item.
  const wrapped = lines.flatMap((line) =>
    wrapText(line, "sans", 7.8, CONTENT_WIDTH - PAD * 2 - HANG).map(
      (text, index) => ({ text, first: index === 0 })
    )
  )
  const height = 26 + wrapped.length * 11.5 + 8

  return {
    kind: "draw",
    height,
    render: (box) => {
      const top = box.y
      const out = [
        ...rect(box.x, top - height, box.width, height, tint),
        ...rect(box.x, top - height, 2.5, height, rule),
        ...drawText(upper(title), {
          x: box.x + PAD,
          y: top - 16,
          font: "sans-bold",
          size: 7.4,
          color: ink,
        }),
      ]

      wrapped.forEach((line, index) => {
        const y = top - 30 - index * 11.5
        if (line.first) {
          out.push(...rect(box.x + PAD, y + 1.5, 2.5, 2.5, rule))
        }
        out.push(
          ...drawText(line.text, {
            x: box.x + PAD + HANG,
            y,
            size: 7.8,
            color: PAPER.ink,
          })
        )
      })

      return out
    },
  }
}

// ---------------------------------------------------------------------------
// The headline figures
// ---------------------------------------------------------------------------

type Card = { label: string; value: string; note: string; accent: string }

/**
 * The eight figures the whole period comes down to, as a grid of panels.
 *
 * Four to a row, each tabbed with the colour of the section it belongs to, so
 * the eye can carry "orange is money" from this grid down through the rest of
 * the document.
 */
function cards(rows: Card[][]): PdfBlock {
  const gap = 9
  const cardHeight = 50
  const height = rows.length * cardHeight + (rows.length - 1) * gap

  return {
    kind: "draw",
    height,
    render: (box) => {
      const out: string[] = []

      rows.forEach((row, rowIndex) => {
        const width = (box.width - gap * (row.length - 1)) / row.length
        const top = box.y - rowIndex * (cardHeight + gap)

        row.forEach((card, index) => {
          const x = box.x + index * (width + gap)
          const bottom = top - cardHeight

          out.push(...rect(x, bottom, width, cardHeight, PAPER.tint))
          // The tab across the top rather than a rail down the side: it reads
          // as a label on the panel instead of a decoration beside it.
          out.push(...rect(x, top - 2.5, width, 2.5, card.accent))

          out.push(
            ...drawText(clip(upper(card.label), width - 20, "sans", 6.3), {
              x: x + 10,
              y: top - 16,
              font: "sans-bold",
              size: 6.3,
              color: PAPER.muted,
            })
          )
          out.push(
            ...drawText(clip(card.value, width - 18, "sans-bold", 13.5), {
              x: x + 10,
              y: top - 32,
              font: "sans-bold",
              size: 13.5,
              color: PAPER.ink,
            })
          )
          out.push(
            ...drawText(clip(card.note, width - 18, "sans", 6.6), {
              x: x + 10,
              y: top - 43,
              size: 6.6,
              color: PAPER.muted,
            })
          )
        })
      })

      return out
    },
  }
}

// ---------------------------------------------------------------------------
// The findings, in sentences
// ---------------------------------------------------------------------------

function peakDay(data: ReportData) {
  const worked = data.hoursByDay.filter((day) => day.hours > 0)
  if (worked.length === 0) return null
  return worked.reduce((best, day) => (day.hours > best.hours ? day : best))
}

function trendSentence(data: ReportData) {
  const worked = data.hoursByDay.filter((day) => day.hours > 0)
  if (worked.length === 0) return "No hours were recorded against any day of it."
  if (worked.length < 6) {
    return "There are too few working days in this period to read a trend from; the daily figures stand as recorded."
  }

  const half = Math.floor(worked.length / 2)
  const first = worked.slice(0, half).reduce((s, d) => s + d.hours, 0) / half
  const second =
    worked.slice(half).reduce((s, d) => s + d.hours, 0) / (worked.length - half)
  const change = first === 0 ? 0 : Math.round(((second - first) / first) * 100)

  if (Math.abs(change) < 8) {
    return `Hours held roughly level across the period — the second half averaged ${Math.round(second)} hours a working day against ${Math.round(first)} in the first, a difference too small to read as a direction.`
  }
  return `Hours ${change > 0 ? "rose" : "fell"} across the period: the second half averaged ${Math.round(second)} hours a working day against ${Math.round(first)} in the first, ${change > 0 ? "up" : "down"} ${Math.abs(change)}%.`
}

function comparisonSentence(data: ReportData) {
  if (!data.compare) return null
  const before = data.compare

  const versus = (label: string, now: number, then: number) => {
    if (then === 0 && now === 0) return null
    if (then === 0) return `${label} rose from none`
    const change = Math.round(((now - then) / then) * 100)
    if (change === 0) return `${label} held level`
    return `${label} ${change > 0 ? "rose" : "fell"} ${Math.abs(change)}%`
  }

  const parts = [
    versus("hours on the clock", data.headline.hoursWorked, before.hoursWorked),
    versus("jobs scheduled", data.headline.jobs, before.jobs),
    versus("reports filed", data.headline.reportsFiled, before.reportsFiled),
  ].filter(Boolean) as string[]

  if (parts.length === 0) return null

  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`

  return `Against ${before.label}, the window of the same length immediately before this one, ${list}. Payroll is deliberately left out of that comparison: pay is earned per cutoff, and two windows of equal length rarely contain the same number of them.`
}

function attentionLines(data: ReportData) {
  const { flags } = data
  const lines: string[] = []

  if (flags.openPunches > 0) {
    lines.push(
      `${flags.openPunches} ${plural(flags.openPunches, "punch", "punches")} never closed. They contribute nothing to the hours above until the office closes them.`
    )
  }
  if (flags.autoClosed > 0) {
    lines.push(
      `${flags.autoClosed} ${plural(flags.autoClosed, "punch", "punches")} closed automatically at the end of the shift. An automatically closed punch carries no time-out photograph or position, so those hours may be worth confirming.`
    )
  }
  if (flags.unapprovedOvertime > 0) {
    lines.push(
      `${flags.unapprovedOvertime} overtime ${plural(flags.unapprovedOvertime, "request is", "requests are")} still awaiting a decision. Unanswered hours are worked hours that pay nothing.`
    )
  }
  if (flags.pendingClaims > 0) {
    lines.push(
      `${flags.pendingClaims} ${plural(flags.pendingClaims, "claim is", "claims are")} awaiting review.`
    )
  }
  if (flags.cancelledJobs > 0) {
    lines.push(
      `${flags.cancelledJobs} ${plural(flags.cancelledJobs, "job was", "jobs were")} cancelled inside the period.`
    )
  }

  return lines
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

/** A ruled table in the document's own dress: open, shaded head, no box. */
function table(
  widths: number[],
  head: string[],
  rows: { cells: (string | number)[]; strong?: boolean }[],
  aligns: ("left" | "right" | "center")[]
): PdfBlock {
  return {
    kind: "table",
    widths,
    size: 8,
    open: true,
    repeatHead: true,
    grid: PAPER.hair,
    shade: PAPER.tint,
    rows: [
      {
        fill: true,
        height: 20,
        cells: head.map((text, index) => ({
          text: upper(text),
          font: "sans-bold" as const,
          size: 6.8,
          align: aligns[index],
          color: PAPER.muted,
        })),
      },
      ...rows.map((row) => ({
        height: 17,
        cells: row.cells.map((text, index) => ({
          text: String(text),
          align: aligns[index],
          font: (row.strong ? "sans-bold" : "sans") as "sans" | "sans-bold",
          size: 8,
          color: PAPER.ink,
        })),
        ...(row.strong ? { fill: true } : {}),
      })),
    ],
  }
}

/** A ranking, drawn as bars. */
function ranking(
  rows: Slice[],
  color: string | string[],
  display: (row: Slice) => string,
  /** Wider where the labels are company names rather than one word. */
  labelWidth = 118
): PdfBlock {
  return figure(barListHeight(rows.length) + 4, (box) =>
    barList({
      box,
      rows: rows.map((row) => ({
        label: row.label,
        value: row.value,
        display: display(row),
      })),
      color,
      ink: INK,
      labelWidth,
      valueWidth: 68,
    })
  )
}

/** Room enough for a client's full registered name. */
const NAME_COLUMN = 158

/**
 * Past this, the day-by-day appendix is dropped for a line saying why.
 *
 * A year's range is 366 rows — nine pages of table behind five pages of report,
 * on a document somebody downloads over mobile data. The chart in section 2
 * already carries the shape, and the day log holds the detail.
 */
const APPENDIX_MAX_DAYS = 92

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

export function reportBlocks(data: ReportData, meta: ReportMeta): PdfBlock[] {
  const { headline, claims } = data
  const blocks: PdfBlock[] = []

  // ---- the cover block ----------------------------------------------------

  blocks.push({ kind: "space", height: 6 })
  blocks.push({
    kind: "draw",
    height: 44,
    render: (box) => {
      const columnWidth = box.width / 3
      const entries: [string, string][] = [
        ["Prepared for", COMPANY],
        ["Prepared by", `${meta.generatedBy} · ${meta.role}`],
        ["Generated", stamp(meta.generatedAt)],
      ]

      return [
        ...hairline(box.x, box.y, box.x + box.width, box.y, PAPER.hair),
        ...entries.flatMap(([label, value], index) => [
          ...drawText(upper(label), {
            x: box.x + columnWidth * index,
            y: box.y - 15,
            font: "sans-bold",
            size: 6.3,
            color: PAPER.muted,
          }),
          ...drawText(clip(value, columnWidth - 12, "sans", 8.4), {
            x: box.x + columnWidth * index,
            y: box.y - 28,
            size: 8.4,
            color: PAPER.ink,
          }),
        ]),
        ...hairline(
          box.x,
          box.y - 38,
          box.x + box.width,
          box.y - 38,
          PAPER.hair
        ),
      ]
    },
  })

  // ---- the headline figures ----------------------------------------------

  blocks.push({ kind: "space", height: 14 })
  blocks.push(
    cards([
      [
        {
          label: "Hours on the clock",
          value: headline.hoursWorked.toLocaleString("en-PH"),
          note: `${headline.daysWorked} recorded ${plural(headline.daysWorked, "day")}`,
          accent: VIZ.attendance,
        },
        {
          label: "Approved overtime",
          value: `${headline.overtimeHours.toLocaleString("en-PH")} h`,
          note:
            headline.hoursWorked > 0
              ? `${Math.round((headline.overtimeHours / headline.hoursWorked) * 100)}% of hours worked`
              : "none recorded",
          accent: VIZ.attendance,
        },
        {
          label: "Gross payroll",
          value: peso(headline.grossPay),
          note: `${peso(headline.netPay)} net`,
          accent: VIZ.payroll,
        },
        {
          label: "Staff on the payroll",
          value: String(headline.staff),
          note: `over ${data.range.days} ${plural(data.range.days, "day")}`,
          accent: VIZ.payroll,
        },
      ],
      [
        {
          label: "Jobs scheduled",
          value: String(headline.jobs),
          note: `${headline.jobsCompleted} completed`,
          accent: VIZ.scheduling,
        },
        {
          label: "Completion rate",
          value:
            headline.jobs > 0
              ? `${Math.round((headline.jobsCompleted / headline.jobs) * 100)}%`
              : "—",
          note: "of jobs booked in the period",
          accent: VIZ.scheduling,
        },
        {
          label: "Reports filed",
          value: String(headline.reportsFiled),
          note: "from the field",
          accent: VIZ.attendance,
        },
        {
          label: "Expense claims",
          value: peso(headline.claimsAmount),
          note: `${headline.claims} ${plural(headline.claims, "claim")} submitted`,
          accent: VIZ.claims,
        },
      ],
    ])
  )

  // ---- 1. summary ---------------------------------------------------------

  const summary = comparisonSentence(data)
  blocks.push({
    kind: "keep",
    blocks: [
      ...heading(1, "In summary", VIZ.attendance),
      ...prose(
        `Across ${data.range.label}, staff worked ${headline.daysWorked} recorded ${plural(headline.daysWorked, "day")} totalling ${headline.hoursWorked.toLocaleString("en-PH")} hours on the clock, of which ${headline.overtimeHours} hours were approved overtime. Payroll for the period came to ${peso(headline.grossPay)} gross and ${peso(headline.netPay)} net of contributions and adjustments. ${headline.jobs} jobs were scheduled, ${headline.jobsCompleted} of them completed, and the crew filed ${headline.reportsFiled} reports from the field. ${headline.claims} expense ${plural(headline.claims, "claim")} ${plural(headline.claims, "was", "were")} submitted, worth ${peso(headline.claimsAmount)}.`
      ),
    ],
  })

  if (summary) {
    blocks.push({ kind: "space", height: 7 })
    blocks.push(...prose(summary))
  }

  const attention = attentionLines(data)
  if (attention.length > 0) {
    blocks.push({ kind: "space", height: 12 })
    blocks.push(
      panel({
        title: "Worth attention",
        lines: attention,
        tint: PAPER.warnTint,
        rule: PAPER.warnRule,
        ink: PAPER.warnInk,
      })
    )
  }

  // ---- 2. hours on the clock ---------------------------------------------

  const worked = data.hoursByDay.filter((day) => day.punches > 0)
  const peak = peakDay(data)

  blocks.push({
    kind: "keep",
    blocks: [
      ...heading(2, "Hours on the clock", VIZ.attendance),
      ...prose(
        `Hours recorded against each day of the period. Only closed punches count — a punch still open contributes nothing until the office closes it. ${trendSentence(data)}`
      ),
    ],
  })

  // Keyed off the peak rather than off the punch count: a period can hold
  // punches that were never closed, which is days recorded and no hours to
  // plot. 136 points of empty grid says less than the sentence above it does.
  if (peak) {
    blocks.push({
      kind: "keep",
      blocks: [
        { kind: "space", height: 8 },
        figure(136, (box) =>
          columns({
            box,
            height: 136,
            points: data.hoursByDay.map((day) => ({
              label: shortDay(day.date),
              value: day.hours,
            })),
            color: VIZ.attendance,
            ink: INK,
            axisLabel: "Hours on the clock, per day",
            mean: true,
          })
        ),
        ...caption(
          `The busiest day was ${longDay(peak.date)}, at ${peak.hours} hours across ${peak.punches} ${plural(peak.punches, "punch", "punches")}.${
            data.range.days <= APPENDIX_MAX_DAYS
              ? " Every day of the period is listed in Appendix A."
              : ""
          }`
        ),
      ],
    })
  }

  if (peak) {
    const busiest = [...worked].sort((a, b) => b.hours - a.hours).slice(0, 5)
    blocks.push({
      kind: "keep",
      blocks: [
        ...subheading("The five busiest days"),
        { kind: "space", height: 4 },
        ranking(
          busiest.map((day) => ({
            key: day.date,
            label: `${weekday(day.date)} ${shortDay(day.date)}`,
            value: day.hours,
          })),
          VIZ.attendance,
          (row) => `${row.value} h`
        ),
      ],
    })
  }

  // ---- 3. payroll ---------------------------------------------------------

  const PAYROLL_SERIES: Series[] = [
    { label: "Basic", color: CYAN_RAMP[1] },
    { label: "Overtime", color: VIZ.payroll },
    { label: "Night differential", color: VIZ.scheduling },
    { label: "Holiday & rest day", color: VIZ.claims },
  ]

  const cutoffs = data.payrollByCutoff.map((cutoff) => ({
    label: cutoff.label,
    values: [
      cutoff.basic,
      cutoff.overtime,
      cutoff.night,
      cutoff.holiday + cutoff.restDay,
    ],
  }))

  const payrollTotals = PAYROLL_SERIES.map((_, slot) =>
    cutoffs.reduce((sum, cutoff) => sum + cutoff.values[slot], 0)
  )
  const payrollTotal = payrollTotals.reduce((sum, value) => sum + value, 0)
  const basicShare =
    payrollTotal > 0 ? Math.round((payrollTotals[0] / payrollTotal) * 100) : 0

  const payrollChartHeight = 150

  blocks.push({
    kind: "keep",
    blocks: [
      ...heading(3, "What payroll was made of", VIZ.payroll),
      ...prose(
        payrollTotal === 0
          ? "No payroll was computed for this period. Pay is earned per cutoff, so a window that closes before a cutoff does will show nothing here even where hours were worked."
          : `Each cutoff in the period, split into what earned it: basic pay for ordinary hours, approved overtime, night hours between 22:00 and 06:00 — paid at the hourly rate plus a further 10% — and the premiums for holidays and rest days. Basic pay accounted for ${basicShare}% of the total, with the remaining ${100 - basicShare}% coming from premiums. A cutoff running noticeably above the others usually means either overtime or a holiday fell inside it.`
      ),
    ],
  })

  if (payrollTotal > 0) blocks.push({
    kind: "keep",
    blocks: [
      { kind: "space", height: 10 },
      figure(payrollChartHeight + keyHeight(PAYROLL_SERIES.length, 4) + 6, (box) => [
        ...stackedColumns({
          box,
          height: payrollChartHeight,
          groups: cutoffs,
          series: PAYROLL_SERIES,
          ink: INK,
          format: compact,
          axisLabel: "Gross pay per cutoff, PHP",
        }),
        ...key({
          box: {
            x: box.x,
            y: box.y - payrollChartHeight - 4,
            width: box.width,
          },
          series: PAYROLL_SERIES.map((series, slot) => ({
            label: series.label,
            color: series.color,
            note: peso(payrollTotals[slot]),
          })),
          ink: INK,
          columns: 4,
        }),
      ]),
      ...caption(
        "The holiday and rest-day premiums share a slot. They are the same kind of money — extra paid for working a day nobody was meant to — and separating them here would mean a fifth colour that no longer separates cleanly from the other four."
      ),
    ],
  })

  if (cutoffs.length > 0) {
    blocks.push({ kind: "space", height: 12 })
    blocks.push(
      table(
        [2.6, 1, 1, 1, 1.2, 1.1],
        ["Cutoff", "Basic", "Overtime", "Night", "Holiday & rest", "Total"],
        [
          ...cutoffs.map((cutoff) => ({
            cells: [
              cutoff.label,
              amount(cutoff.values[0]),
              amount(cutoff.values[1]),
              amount(cutoff.values[2]),
              amount(cutoff.values[3]),
              amount(cutoff.values.reduce((sum, value) => sum + value, 0)),
            ],
          })),
          {
            strong: true,
            cells: [
              "Total, PHP",
              amount(payrollTotals[0]),
              amount(payrollTotals[1]),
              amount(payrollTotals[2]),
              amount(payrollTotals[3]),
              amount(payrollTotal),
            ],
          },
        ],
        ["left", "right", "right", "right", "right", "right"]
      )
    )
  }

  // ---- 4. scheduled work --------------------------------------------------

  const STATUS_ORDER = [
    "COMPLETED",
    "PENDING",
    "NEED_TO_RETURN",
    "RESCHEDULED",
    "CANCELLED",
  ]

  const statusSegments = STATUS_ORDER.map((statusKey, index) => {
    const slice = data.scheduleStatus.find((row) => row.key === statusKey)
    return slice
      ? { label: slice.label, value: slice.value, color: STATUS_RAMP[index] }
      : null
  }).filter(Boolean) as { label: string; value: number; color: string }[]

  const completed =
    headline.jobs > 0
      ? Math.round((headline.jobsCompleted / headline.jobs) * 100)
      : 0

  blocks.push({
    kind: "keep",
    blocks: [
      ...heading(4, "Scheduled work", VIZ.scheduling),
      ...prose(
        headline.jobs === 0
          ? "No jobs were scheduled in this period."
          : `Of ${headline.jobs} jobs scheduled in the period, ${headline.jobsCompleted} were completed — ${completed}%. The remainder are either still pending, marked for a return visit, rescheduled, or cancelled. The bar below is the whole period divided by outcome, in lifecycle order rather than by size, so the same colour means the same thing in every report.`
      ),
    ],
  })

  blocks.push({
    kind: "keep",
    blocks: [
      ...(statusSegments.length > 0
        ? [
            { kind: "space" as const, height: 12 },
            figure(compositionBarHeight(statusSegments.length), (box) =>
              compositionBar({
                box,
                segments: statusSegments,
                ink: INK,
                format: (value) => String(value),
              })
            ),
          ]
        : []),
    ],
  })

  if (data.workTypes.length > 0) {
    const totalTypes = data.workTypes.reduce((sum, row) => sum + row.value, 0)
    blocks.push({
      kind: "keep",
      blocks: [
        ...subheading("The work carried out, by kind"),
        ...prose(
          "A single job can carry more than one work type, so these total higher than the job count above. Read them as how often each kind of work was involved, not as a share of jobs."
        ),
        { kind: "space", height: 8 },
        ranking(
          data.workTypes,
          CYAN_RAMP,
          (row) =>
            `${row.value} · ${Math.round((row.value / totalTypes) * 100)}%`
        ),
      ],
    })
  }

  if (data.topClients.length > 0) {
    blocks.push({
      kind: "keep",
      blocks: [
        ...subheading("Busiest clients"),
        ...prose(
          "By jobs scheduled. This counts visits rather than revenue — a client with many short calls ranks above one with a single long installation."
        ),
        { kind: "space", height: 8 },
        ranking(
          data.topClients,
          VIZ.scheduling,
          (row) => `${row.value} ${plural(row.value, "job")}`,
          NAME_COLUMN
        ),
      ],
    })
  }

  // ---- 5. reports filed ---------------------------------------------------

  blocks.push({
    kind: "keep",
    blocks: [
      ...heading(5, "Reports filed from the field", VIZ.attendance),
      ...prose(
        `Every PMS and service report the crew filed against a time-out inside this period. Each is stored under the client, branch and month it belongs to and can be found or downloaded from the Documents tab. ${
          headline.reportsFiled === 0
            ? "None were filed in this period."
            : `${headline.reportsFiled} were filed in total.`
        }`
      ),
      ...(data.reportTypes.length > 0
        ? [
            { kind: "space" as const, height: 10 },
            ranking(
              data.reportTypes,
              CYAN_RAMP,
              (row) => `${row.value} filed`
            ),
          ]
        : []),
    ],
  })

  // ---- 6. expense claims --------------------------------------------------

  blocks.push(...heading(6, "Expense claims", VIZ.claims))

  if (claims.count === 0) {
    blocks.push(
      ...prose("No liquidations were submitted in this period.")
    )
  } else {
    const awaiting = claims.byStatus.find((s) => s.key === "PENDING_REVIEW")
    const approved = claims.byStatus.find((s) => s.key === "APPROVED")
    const rejected = claims.byStatus.find((s) => s.key === "REJECTED")

    blocks.push(
      ...prose(
        `${claims.count} ${plural(claims.count, "liquidation was", "liquidations were")} submitted in the period, worth ${peso(claims.total)} in total: ${peso(approved?.amount ?? 0)} approved, ${peso(rejected?.amount ?? 0)} refused, and ${peso(awaiting?.amount ?? 0)} still awaiting review — money the company has not yet decided on, so a figure that grows from one period to the next is worth chasing. ${
          claims.turnaroundDays === null
            ? "Nothing filed in this period has been decided yet, so there is no turnaround to report."
            : `Claims that have been decided took ${claims.turnaroundDays} ${plural(claims.turnaroundDays, "day")} on average from filing to decision.`
        } ${
          claims.lateCount === 0
            ? "Every claim was filed inside the window."
            : `${claims.lateCount} of them ${plural(claims.lateCount, "was", "were")} filed late, which is recorded against the claim at submission and does not change afterwards.`
        } The largest single claim was ${peso(claims.largest)}.`
      )
    )

    blocks.push({ kind: "space", height: 12 })
    blocks.push({
      kind: "keep",
      blocks: [
        ...subheading("Where the money stands"),
        { kind: "space", height: 4 },
        ranking(
          claims.byStatus.map((status) => ({
            key: status.key,
            label: `${status.label} (${status.count})`,
            value: status.amount,
          })),
          CYAN_RAMP,
          (row) => peso(row.value)
        ),
      ],
    })

    if (claims.topClaimants.length > 0) {
      blocks.push({
        kind: "keep",
        blocks: [
          ...subheading("Filed by"),
          ...prose(
            "The value of what each person submitted, whatever was decided about it."
          ),
          { kind: "space", height: 8 },
          ranking(claims.topClaimants, VIZ.claims, (row) => peso(row.value)),
        ],
      })
    }

    if (claims.byClient.length > 0) {
      blocks.push({
        kind: "keep",
        blocks: [
          ...subheading("Charged to clients"),
          ...prose(
            "One receipt can cover more than one job, so these are the per-client shares recorded against each line rather than whole claims counted twice. They will not always add up to the total above, because a line tied to no client is charged to nobody."
          ),
          { kind: "space", height: 8 },
          ranking(claims.byClient, VIZ.claims, (row) => peso(row.value), NAME_COLUMN),
        ],
      })
    }
  }

  // ---- appendix -----------------------------------------------------------

  if (worked.length > 0 && data.range.days > APPENDIX_MAX_DAYS) {
    blocks.push(...heading(7, "Appendix A · Daily attendance", VIZ.attendance))
    blocks.push(
      ...prose(
        `The day-by-day record is printed for periods of up to ${APPENDIX_MAX_DAYS} days. This one covers ${data.range.days}, which would run to a table longer than the report it belongs to — the chart in section 2 carries the same figures, and the day log holds the detail.`
      )
    )
  } else if (worked.length > 0) {
    blocks.push(...heading(7, "Appendix A · Daily attendance", VIZ.attendance))
    blocks.push(
      ...prose(
        "Every day of the period on which a punch was recorded, as it stands at the moment of generation. Hours are whole hours from closed punches only."
      )
    )
    blocks.push({ kind: "space", height: 10 })
    blocks.push(
      table(
        [2, 1.2, 1, 1],
        ["Date", "Day", "Hours", "Punches"],
        [
          ...worked.map((day) => ({
            cells: [shortDay(day.date), weekday(day.date), day.hours, day.punches],
          })),
          {
            strong: true,
            cells: [
              "Total",
              `${worked.length} ${plural(worked.length, "day")}`,
              worked.reduce((sum, day) => sum + day.hours, 0),
              worked.reduce((sum, day) => sum + day.punches, 0),
            ],
          },
        ],
        ["left", "left", "right", "right"]
      )
    )
  }

  // ---- how the figures were arrived at ------------------------------------

  blocks.push({ kind: "space", height: 18 })
  blocks.push(
    panel({
      title: "How these figures were arrived at",
      lines: [
        "Figures are computed from recorded attendance at the moment this report was generated. Payroll is not a snapshot: a punch corrected after this date will change the figures on a report generated again for the same period.",
        "Paid hours are whole hours capped at eight a day. Overtime pays only what was approved and actually worked. An open punch contributes no hours until it is closed.",
        `Generated ${stamp(meta.generatedAt)} by ${meta.generatedBy}, ${meta.role}, from the ${COMPANY} operations system.`,
      ],
      tint: PAPER.tint,
      rule: PAPER.muted,
      ink: PAPER.muted,
    })
  )

  return blocks
}

export function reportPdf(data: ReportData, meta: ReportMeta) {
  return renderPdf(reportBlocks(data, meta), {
    firstPageInset: LETTERHEAD - MARGIN + 16,
    pageInset: RUNNING_HEAD,
    footerInset: FOOTER,
    decorate: (page, total) => [
      ...(page === 1 ? letterhead(data) : runningHead(data)),
      ...footer(data, meta, page, total),
    ],
  })
}

export function reportFileName(data: ReportData) {
  const segment = (value: string) =>
    value
      .normalize("NFKD")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
  return `Aerocoole_Operations_Report_${segment(data.range.label)}.pdf`
}
