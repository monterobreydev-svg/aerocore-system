import "server-only"

import {
  CONTENT_WIDTH,
  MARGIN,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  drawText,
  wrapText,
  type PdfBlock,
  type PdfBox,
} from "@/lib/formats/pdf"
import {
  barList,
  barListHeight,
  hairline,
  rect,
  type ChartInk,
} from "@/lib/formats/chart"

// ---------------------------------------------------------------------------
// The dress every document in this system wears
// ---------------------------------------------------------------------------
//
// The palette, the letterhead, the running head, the footer, and the handful of
// blocks a section is built from. Extracted from the operations report when the
// projects report was added: two documents from one system that did not look
// like each other would undo most of what the formatting is for, and the way
// that happens is by copying four hundred lines of chrome and letting the
// copies drift.
//
// Nothing here knows what is being reported on. A caller hands over what the
// document is called and what period it covers; everything else is the same
// paper whatever is printed on it.

export const COMPANY = "Aerocoole Airconditioning Services"

/** What the document is called, in the accent line and the running head. */
export type PaperHead = {
  /** "Operations Report", "Project Report". */
  document: string
  /** "1–22 August 2026", "2026". */
  periodLabel: string
  /** The quiet line under the period — a count, a roster size. */
  periodNote: string
}

export type PaperMeta = {
  /** Whose name goes on it. */
  generatedBy: string
  /** Their role, so a reader knows what the signature is worth. */
  role: string
  generatedAt: Date
}

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------
//
// The same values the pages draw with, as hexes rather than CSS custom
// properties: four categorical slots assigned by entity and never by rank, and
// two five-step ordinal ramps for quantities that are one thing divided up.
// They were computed and validated against white, and paper is white, so they
// transfer exactly.

export const VIZ = {
  attendance: "#0092b7",
  payroll: "#dc631e",
  scheduling: "#7935c6",
  claims: "#0e9254",
} as const

/** A lifecycle: one hue in graded steps rather than five unrelated colours. */
export const STATUS_RAMP = ["#6213ab", "#7a3dc5", "#9260da", "#aa83ea", "#bfa4f0"]

/** Darkest first — for anything split by kind rather than by state. */
export const CYAN_RAMP = ["#005b7b", "#00769b", "#0092b7", "#19adcc", "#6cc2da"]

/** Money in, money out: the two directions a figure can point. */
export const MONEY_RAMP = ["#0e9254", "#dc631e"]

export const PAPER = {
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

  /** The amber a caveat is set in — a warning that is not an error. */
  warnInk: "#9a4a06",
  warnTint: "#fdf4e7",
  warnRule: "#e08c2c",
} as const

export const INK: ChartInk = {
  grid: PAPER.grid,
  muted: PAPER.muted,
  ink: PAPER.ink,
  track: PAPER.track,
}

// ---------------------------------------------------------------------------
// Measurements
// ---------------------------------------------------------------------------

/** The navy band on page one. */
export const LETTERHEAD = 104
/** The running header on every page after it. */
export const RUNNING_HEAD = 34
/** The footer, on all of them. */
export const FOOTER = 32

/**
 * Prose runs the full column, like everything else on the page.
 *
 * It used to stop short, on the reasoning that a full-width line of this type
 * runs past ninety characters. The measure was the right instinct and the wrong
 * number — the narrowing bought no readability and only left paragraphs ending
 * short of the section rule above them, which reads as a fault rather than a
 * decision.
 */
export const PROSE_WIDTH = CONTENT_WIDTH
export const BODY = 8.6

export function upper(text: string) {
  return text.toUpperCase()
}

export function stamp(at: Date) {
  return at.toLocaleString("en-PH", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

// ---------------------------------------------------------------------------
// Page furniture
// ---------------------------------------------------------------------------

export function letterhead(head: PaperHead) {
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
    ...drawText(upper(head.document), {
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
    ...drawText(head.periodLabel, {
      x: PAGE_WIDTH - MARGIN,
      y: top - 60,
      font: "sans-bold",
      size: 12,
      align: "right",
      color: "#ffffff",
    }),
    ...drawText(head.periodNote, {
      x: PAGE_WIDTH - MARGIN,
      y: top - 74,
      size: 7.5,
      align: "right",
      color: PAPER.navyText,
    }),
  ]
}

/** Pages two onward: who this is and what period, in one quiet line. */
export function runningHead(head: PaperHead) {
  const y = PAGE_HEIGHT - MARGIN + 6

  return [
    ...drawText(COMPANY, {
      x: MARGIN,
      y,
      font: "sans-bold",
      size: 7.5,
      color: PAPER.ink,
    }),
    ...drawText(`${head.document} · ${head.periodLabel}`, {
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
export function footer(meta: PaperMeta, page: number, total: number) {
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

export function heading(
  index: number,
  title: string,
  accent: string
): PdfBlock[] {
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
    // A breath between the rule and the first line under it.
    { kind: "space", height: 2 },
  ]
}

/** A smaller heading inside a section. */
export function subheading(text: string): PdfBlock[] {
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
export function prose(text: string, width = PROSE_WIDTH): PdfBlock[] {
  return wrapText(text, "sans", BODY, width).map((line) => ({
    kind: "text" as const,
    text: line,
    size: BODY,
    color: PAPER.ink,
    leading: 1.62,
  }))
}

/** A note in the margin voice — smaller, greyer, for a caveat under a chart. */
export function caption(text: string): PdfBlock[] {
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
export function figure(
  height: number,
  render: (box: PdfBox) => string[]
): PdfBlock {
  return { kind: "draw", height, render }
}

/** A ruled table in the document's own dress: open, shaded head, no box. */
export function table(
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

/** One row of a ranking: a label, a magnitude, and what to print for it. */
export type RankRow = { label: string; value: number; display: string }

/** A ranking, drawn as bars. */
export function ranking(
  rows: RankRow[],
  color: string | string[],
  /** Wider where the labels are company names rather than one word. */
  labelWidth = 118
): PdfBlock {
  return figure(barListHeight(rows.length) + 4, (box) =>
    barList({ box, rows, color, ink: INK, labelWidth, valueWidth: 68 })
  )
}

/** Wider label column, for company names. */
export const NAME_COLUMN = 158
