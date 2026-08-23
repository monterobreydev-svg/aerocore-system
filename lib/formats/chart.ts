import "server-only"

import {
  drawText,
  fill,
  stroke,
  textWidth,
  type PdfBox,
  type PdfFont,
} from "@/lib/formats/pdf"

// ---------------------------------------------------------------------------
// Charts, drawn straight into the page
// ---------------------------------------------------------------------------
//
// Four forms and the pieces they share, each returning PDF operators for a box
// it has been given. There is no chart library here for the same reason there
// is no PDF library: the shapes a business report needs are rectangles, a few
// lines and some text, and the whole of this file is smaller than the smallest
// dependency that would draw them.
//
// Nothing here knows a colour. Every hue is passed in by the caller, because
// the palette belongs to the document — this module is the drawing, not the
// design system.
//
// Which form to reach for:
//
//   columns          a measure over time, one bar per period
//   stackedColumns   a total over time, split into what it is made of
//   barList          a ranking — categories on the left, length as the value
//   compositionBar   one quantity divided up, where the parts are the point
//
// Two rules the marks follow throughout. Bars get rounded ends only at the
// data end and stay square where they meet the baseline, so the axis reads as a
// hard edge. Stacked segments and neighbouring bars are separated by two points
// of paper rather than by a border, which is what keeps two similar tones
// readable as two things.

/** The gap between adjacent fills, in points. Paper, not ink. */
const SPACER = 2

/** How round a bar's data end is. */
const RADIUS = 2.5

/** kappa — the magic constant for approximating a quarter circle in bezier. */
const K = 0.5523

export type ChartInk = {
  /** Gridlines and axis rules. */
  grid: string
  /** Axis and label text. */
  muted: string
  /** Value labels and anything that has to be read exactly. */
  ink: string
  /** What an empty track is drawn in. */
  track: string
}

export type Series = { label: string; color: string }

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export function rect(
  x: number,
  y: number,
  width: number,
  height: number,
  color: string
) {
  if (width <= 0 || height <= 0) return []
  return [
    fill(color),
    `${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f`,
    "0 g",
  ]
}

/**
 * A rectangle with two of its corners rounded — the shape every bar here is.
 *
 * `round` names the edge the data ends on, so a column rounds at the top and a
 * horizontal bar rounds at the right, and both keep a square edge against the
 * baseline they are measured from.
 */
export function bar(
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  round: "top" | "right" | "none" = "none"
) {
  if (width <= 0 || height <= 0) return []

  const r = Math.min(RADIUS, width / 2, height / 2)
  if (round === "none" || r <= 0.4) return rect(x, y, width, height, color)

  const right = x + width
  const top = y + height
  const path: string[] = []

  if (round === "top") {
    path.push(
      `${x.toFixed(2)} ${y.toFixed(2)} m`,
      `${x.toFixed(2)} ${(top - r).toFixed(2)} l`,
      curve(x, top - r + r * K, x + r - r * K, top, x + r, top),
      `${(right - r).toFixed(2)} ${top.toFixed(2)} l`,
      curve(right - r + r * K, top, right, top - r + r * K, right, top - r),
      `${right.toFixed(2)} ${y.toFixed(2)} l`
    )
  } else {
    path.push(
      `${x.toFixed(2)} ${y.toFixed(2)} m`,
      `${(right - r).toFixed(2)} ${y.toFixed(2)} l`,
      curve(right - r + r * K, y, right, y + r - r * K, right, y + r),
      `${right.toFixed(2)} ${(top - r).toFixed(2)} l`,
      curve(right, top - r + r * K, right - r + r * K, top, right - r, top),
      `${x.toFixed(2)} ${top.toFixed(2)} l`
    )
  }

  return [fill(color), ...path, "h f", "0 g"]
}

function curve(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number
) {
  return `${x1.toFixed(2)} ${y1.toFixed(2)} ${x2.toFixed(2)} ${y2.toFixed(2)} ${x3.toFixed(2)} ${y3.toFixed(2)} c`
}

export function hairline(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  { weight = 0.5, dashed = false } = {}
) {
  return [
    stroke(color),
    `${weight.toFixed(2)} w`,
    dashed ? "[2 2] 0 d" : "[] 0 d",
    `${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`,
    "[] 0 d",
    "0 G",
  ]
}

// ---------------------------------------------------------------------------
// Scales
// ---------------------------------------------------------------------------

/**
 * A ceiling a reader can do arithmetic against — 1, 2 or 5 times a power of ten.
 *
 * An axis that stops at 3,847 makes every gridline under it a number nobody can
 * halve in their head, which is most of what an axis is for.
 */
const STEPS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]

export function niceCeiling(value: number) {
  if (value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const scaled = value / magnitude
  // The slack matters: a period totalling 500,100 against a ladder of exactly
  // 5 would round up to a million and draw every bar at half height, on an axis
  // whose top half is empty.
  const step = STEPS.find((candidate) => scaled <= candidate * 1.0001) ?? 10
  return step * magnitude
}

/**
 * Ticks from nought to the ceiling, inclusive.
 *
 * The count drops on a small ceiling so the labels stay whole: four ticks up to
 * a ceiling of one gives 0, 0.25, 0.5, 0.75, 1, which an integer formatter
 * prints as "0, 0, 1, 1, 1" — a ladder of repeated numbers.
 */
function ticksTo(ceiling: number, count = 4) {
  const steps = ceiling < count ? Math.max(1, Math.round(ceiling)) : count
  return Array.from({ length: steps + 1 }, (_, i) => (ceiling / steps) * i)
}

/**
 * Every nth label, chosen so the row of them cannot collide.
 *
 * A period of ninety days has ninety columns and room for perhaps a dozen
 * labels. Thinning by a computed stride keeps the first one and lands the rest
 * evenly, which reads as a scale; dropping every label that overlaps its
 * neighbour reads as a bug.
 */
function stride(count: number, room: number, widest: number) {
  if (count === 0) return 1
  const fits = Math.max(1, Math.floor(room / Math.max(widest, 1)))
  return Math.max(1, Math.ceil(count / fits))
}

// ---------------------------------------------------------------------------
// Columns over time
// ---------------------------------------------------------------------------

export type ColumnPoint = { label: string; value: number }

/**
 * One bar per period, with a value axis and a mean line.
 *
 * The mean is drawn because it is the question a reader has about a row of
 * bars they cannot answer by looking: is this day high, or does this look like
 * every day? It is dashed and unlabelled on the plot, and named in the legend
 * under it, so it never competes with the data.
 */
export function columns({
  box,
  height,
  points,
  color,
  ink,
  format = (value) => String(Math.round(value)),
  axisLabel,
  mean,
}: {
  box: PdfBox
  height: number
  points: ColumnPoint[]
  color: string
  ink: ChartInk
  format?: (value: number) => string
  /** What the vertical axis counts, set above it. */
  axisLabel?: string
  /** Draw the average as a reference line. */
  mean?: boolean
}): string[] {
  const out: string[] = []
  if (points.length === 0) return out

  const axisWidth = 34
  const labelBand = 12
  const capBand = axisLabel ? 12 : 0

  const plotLeft = box.x + axisWidth
  const plotRight = box.x + box.width
  const plotBottom = box.y - height + labelBand
  const plotTop = box.y - capBand
  const plotHeight = plotTop - plotBottom

  const ceiling = niceCeiling(Math.max(...points.map((p) => p.value), 0))
  const at = (value: number) => plotBottom + (value / ceiling) * plotHeight

  if (axisLabel) {
    out.push(
      ...drawText(axisLabel, {
        x: box.x,
        y: box.y - 7,
        size: 6.5,
        font: "sans-bold",
        color: ink.muted,
      })
    )
  }

  // Gridlines first, so every mark drawn after sits over them.
  for (const tick of ticksTo(ceiling)) {
    const y = at(tick)
    out.push(...hairline(plotLeft, y, plotRight, y, ink.grid))
    out.push(
      ...drawText(format(tick), {
        x: plotLeft - 5,
        y: y - 2.2,
        size: 6.5,
        align: "right",
        color: ink.muted,
      })
    )
  }

  const slot = (plotRight - plotLeft) / points.length
  const width = Math.max(1.2, slot - SPACER)

  points.forEach((point, index) => {
    const x = plotLeft + slot * index + (slot - width) / 2
    const barHeight = point.value <= 0 ? 0 : Math.max(0.8, at(point.value) - plotBottom)
    out.push(...bar(x, plotBottom, width, barHeight, color, "top"))
  })

  if (mean) {
    const average =
      points.reduce((sum, point) => sum + point.value, 0) / points.length
    if (average > 0) {
      const y = at(average)
      const label = `avg ${format(average)}`
      const labelWidth = textWidth(label, "sans", 6.5)

      out.push(...hairline(plotLeft, y, plotRight, y, ink.ink, { dashed: true }))
      // Knocked out of the plot rather than laid over it: the label sits above
      // the line it names, and without the paper behind it a bar reaching that
      // high prints straight through the text.
      out.push(
        ...rect(plotRight - labelWidth - 4, y + 1.5, labelWidth + 4, 8, "#ffffff")
      )
      out.push(
        ...drawText(label, {
          x: plotRight - 2,
          y: y + 3.5,
          size: 6.5,
          align: "right",
          color: ink.ink,
        })
      )
    }
  }

  // The baseline is the only solid rule: it is the thing the bars are measured
  // from, and a gridline that looks the same as it invites the eye to measure
  // from the wrong place.
  out.push(
    ...hairline(plotLeft, plotBottom, plotRight, plotBottom, ink.muted, {
      weight: 0.7,
    })
  )

  const widest = Math.max(
    ...points.map((point) => textWidth(point.label, "sans", 6.5))
  )
  const step = stride(points.length, plotRight - plotLeft, widest + 6)
  points.forEach((point, index) => {
    if (index % step !== 0) return
    out.push(
      ...drawText(point.label, {
        x: plotLeft + slot * index + slot / 2,
        y: plotBottom - 8,
        size: 6.5,
        align: "center",
        color: ink.muted,
      })
    )
  })

  return out
}

// ---------------------------------------------------------------------------
// Stacked columns
// ---------------------------------------------------------------------------

export type StackGroup = { label: string; values: number[] }

/** A total per period, split into a fixed set of series. */
export function stackedColumns({
  box,
  height,
  groups,
  series,
  ink,
  format = (value) => String(Math.round(value)),
  axisLabel,
}: {
  box: PdfBox
  height: number
  groups: StackGroup[]
  series: Series[]
  ink: ChartInk
  format?: (value: number) => string
  axisLabel?: string
}): string[] {
  const out: string[] = []
  if (groups.length === 0) return out

  const axisWidth = 46
  const labelBand = 12
  const capBand = axisLabel ? 12 : 0

  const plotLeft = box.x + axisWidth
  const plotRight = box.x + box.width
  const plotBottom = box.y - height + labelBand
  const plotTop = box.y - capBand
  const plotHeight = plotTop - plotBottom

  const totals = groups.map((group) =>
    group.values.reduce((sum, value) => sum + value, 0)
  )
  const ceiling = niceCeiling(Math.max(...totals, 0))
  const scale = plotHeight / ceiling

  if (axisLabel) {
    out.push(
      ...drawText(axisLabel, {
        x: box.x,
        y: box.y - 7,
        size: 6.5,
        font: "sans-bold",
        color: ink.muted,
      })
    )
  }

  for (const tick of ticksTo(ceiling)) {
    const y = plotBottom + tick * scale
    out.push(...hairline(plotLeft, y, plotRight, y, ink.grid))
    out.push(
      ...drawText(format(tick), {
        x: plotLeft - 5,
        y: y - 2.2,
        size: 6.5,
        align: "right",
        color: ink.muted,
      })
    )
  }

  const slot = (plotRight - plotLeft) / groups.length
  const width = Math.min(58, Math.max(4, slot - 14))

  groups.forEach((group, index) => {
    const x = plotLeft + slot * index + (slot - width) / 2
    let y = plotBottom

    // Drawn bottom up so the first series sits on the baseline in every column,
    // which is what makes two columns comparable at a glance.
    group.values.forEach((value, slotIndex) => {
      if (value <= 0) return
      const segment = value * scale
      const top = slotIndex === group.values.length - 1
      out.push(
        ...bar(
          x,
          y,
          width,
          Math.max(0.8, segment - SPACER),
          series[slotIndex].color,
          top ? "top" : "none"
        )
      )
      y += segment
    })

    out.push(
      ...drawText(group.label, {
        x: x + width / 2,
        y: plotBottom - 8,
        size: 6.5,
        align: "center",
        color: ink.muted,
      })
    )
  })

  out.push(
    ...hairline(plotLeft, plotBottom, plotRight, plotBottom, ink.muted, {
      weight: 0.7,
    })
  )

  return out
}

// ---------------------------------------------------------------------------
// A ranking
// ---------------------------------------------------------------------------

export type BarRow = { label: string; value: number; display?: string }

/**
 * Categories down the left, length as the measure, the figure at the end.
 *
 * The right form for a ranking and for anything whose labels are words: names
 * set horizontally need no rotating, and a reader compares lengths from a
 * common left edge without having to hold a scale in their head.
 */
export function barList({
  box,
  rows,
  color,
  ink,
  labelWidth = 118,
  rowHeight = 15,
  valueWidth = 62,
}: {
  box: PdfBox
  rows: BarRow[]
  /** One colour, or one per row for a ramp. */
  color: string | string[]
  ink: ChartInk
  labelWidth?: number
  rowHeight?: number
  valueWidth?: number
}): string[] {
  const out: string[] = []
  if (rows.length === 0) return out

  const ceiling = Math.max(...rows.map((row) => row.value), 0) || 1
  const trackLeft = box.x + labelWidth
  const trackWidth = box.width - labelWidth - valueWidth
  const thickness = Math.min(9, rowHeight - 5)

  rows.forEach((row, index) => {
    const top = box.y - rowHeight * index
    const barY = top - (rowHeight + thickness) / 2

    // A ramp is stretched across the rows rather than cycled through them.
    // Cycling would give the seventh row the first row's colour, which on a
    // list sorted longest-first says the smallest value is the largest.
    const hue = Array.isArray(color)
      ? color[
          rows.length < 2
            ? 0
            : Math.round((index / (rows.length - 1)) * (color.length - 1))
        ]
      : color

    out.push(
      ...drawText(clip(row.label, labelWidth - 8, "sans", 8), {
        x: box.x,
        y: barY + thickness / 2 - 2.6,
        size: 8,
        color: ink.ink,
      })
    )

    // The empty track, so a short bar still reads against the length available
    // rather than floating in white space.
    out.push(...rect(trackLeft, barY, trackWidth, thickness, ink.track))
    out.push(
      ...bar(
        trackLeft,
        barY,
        Math.max(row.value > 0 ? 1.5 : 0, (row.value / ceiling) * trackWidth),
        thickness,
        hue,
        "right"
      )
    )

    out.push(
      ...drawText(row.display ?? String(row.value), {
        x: box.x + box.width,
        y: barY + thickness / 2 - 2.6,
        size: 8,
        font: "sans-bold",
        align: "right",
        color: ink.ink,
      })
    )
  })

  return out
}

/** The height a bar list will take, so a caller can reserve it. */
export function barListHeight(count: number, rowHeight = 15) {
  return count * rowHeight
}

// ---------------------------------------------------------------------------
// One quantity, divided
// ---------------------------------------------------------------------------

export type Segment = { label: string; value: number; color: string }

/**
 * A single stacked bar and its key.
 *
 * Preferred over a pie or a doughnut for the same job: the parts are compared
 * along one axis instead of by angle, the labels sit horizontally, and it
 * survives being reduced to eight points of height in a corner of a page.
 */
export function compositionBar({
  box,
  segments,
  ink,
  thickness = 11,
  format,
  keyColumns = KEY_COLUMNS,
}: {
  box: PdfBox
  segments: Segment[]
  ink: ChartInk
  thickness?: number
  /** How a value is written in the key. Percentages are added automatically. */
  format?: (value: number) => string
  keyColumns?: number
}): string[] {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0)
  if (total <= 0) return []

  const out: string[] = []
  const top = box.y - thickness
  let x = box.x

  segments.forEach((segment, index) => {
    const width = (segment.value / total) * box.width
    const drawn = Math.max(
      segment.value > 0 ? 1 : 0,
      width - (index === segments.length - 1 ? 0 : SPACER)
    )
    out.push(
      ...bar(
        x,
        top,
        drawn,
        thickness,
        segment.color,
        index === 0 ? "none" : index === segments.length - 1 ? "right" : "none"
      )
    )
    x += width
  })

  out.push(
    ...key({
      box: { x: box.x, y: top - 8, width: box.width },
      series: segments.map((segment) => ({
        label: segment.label,
        color: segment.color,
        note: `${format ? format(segment.value) : segment.value} · ${Math.round((segment.value / total) * 100)}%`,
      })),
      ink,
      columns: keyColumns,
    })
  )

  return out
}

/**
 * How many across the key is set.
 *
 * Fixed rather than fitted, because the height a composition takes has to be
 * known before it is drawn — a key that decides its own columns decides its own
 * height, and whatever follows it on the page is laid out over the difference.
 */
const KEY_COLUMNS = 3

/** The height `compositionBar` takes, key included. */
export function compositionBarHeight(
  count: number,
  thickness = 11,
  keyColumns = KEY_COLUMNS
) {
  return thickness + 8 + keyHeight(count, keyColumns)
}

// ---------------------------------------------------------------------------
// The key
// ---------------------------------------------------------------------------

export type KeyEntry = { label: string; color: string; note?: string }

/** Swatch, name and optional figure, wrapped across the width it is given. */
export function key({
  box,
  series,
  ink,
  columns: columnCount,
}: {
  box: PdfBox
  series: KeyEntry[]
  ink: ChartInk
  /** Fixed columns. Left out, they are sized to the longest entry. */
  columns?: number
}): string[] {
  if (series.length === 0) return []

  const widest = Math.max(
    ...series.map(
      (entry) =>
        textWidth(entry.label, "sans", 7.5) +
        (entry.note ? textWidth(` ${entry.note}`, "sans-bold", 7.5) : 0)
    )
  )
  const perRow =
    columnCount ??
    Math.max(1, Math.min(series.length, Math.floor(box.width / (widest + 26))))
  const columnWidth = box.width / perRow

  const out: string[] = []
  series.forEach((entry, index) => {
    const x = box.x + columnWidth * (index % perRow)
    const y = box.y - 10 * Math.floor(index / perRow)

    out.push(...rect(x, y - 5.5, 6, 6, entry.color))
    out.push(
      ...drawText(entry.label, {
        x: x + 9.5,
        y: y - 5,
        size: 7.5,
        color: ink.muted,
      })
    )
    if (entry.note) {
      out.push(
        ...drawText(entry.note, {
          x: x + 9.5 + textWidth(`${entry.label} `, "sans", 7.5),
          y: y - 5,
          size: 7.5,
          font: "sans-bold",
          color: ink.ink,
        })
      )
    }
  })

  return out
}

export function keyHeight(count: number, perRow = count) {
  return 10 * Math.ceil(count / Math.max(1, perRow)) + 2
}

/** As much of the text as fits, with an ellipsis where it was cut. */
export function clip(text: string, room: number, font: PdfFont, size: number) {
  if (textWidth(text, font, size) <= room) return text
  let cut = text
  while (cut.length > 1 && textWidth(`${cut}…`, font, size) > room) {
    cut = cut.slice(0, -1)
  }
  return `${cut}…`
}

// ---------------------------------------------------------------------------
// One quantity, divided — as a ring
// ---------------------------------------------------------------------------
//
// compositionBar above is still the right default, and the reasons given there
// still hold: parts compared along one axis, horizontal labels, survives being
// eight points tall.
//
// This is for the other case — a headline split into a few large parts, given a
// third of a page in a document somebody reads rather than scans. A ring is
// what a reader expects of "where the money went" at that size, the hole in the
// middle carries the total, and with four or five segments the angles are far
// enough apart to compare honestly. Past about six it stops being readable and
// compositionBar is the better answer again.

/** Where the ring's own total is written. */
export type DonutCentre = { value: string; label: string }

function polar(cx: number, cy: number, radius: number, radians: number) {
  return [cx + radius * Math.cos(radians), cy + radius * Math.sin(radians)]
}

/**
 * One arc of a ring, as a filled path between two radii.
 *
 * Bezier curves cannot describe a circle exactly, so the arc is cut into spans
 * of at most a quarter turn and each is approximated with the standard kappa
 * constant — the same trick the rounded bar corners above use, and accurate to
 * well under a printer's dot at these sizes.
 */
function ringSlice(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  from: number,
  to: number,
  color: string
) {
  const span = to - from
  if (span <= 0) return []

  const steps = Math.max(1, Math.ceil(span / (Math.PI / 2)))
  const step = span / steps
  // Kappa is defined for a quarter turn; any shorter span scales it the same way.
  const lift = (K * step) / (Math.PI / 2)

  const path: string[] = []
  const [sx, sy] = polar(cx, cy, outer, from)
  path.push(`${sx.toFixed(2)} ${sy.toFixed(2)} m`)

  for (let i = 0; i < steps; i += 1) {
    const a = from + step * i
    const b = a + step
    const [x1, y1] = polar(cx, cy, outer, a)
    const [x2, y2] = polar(cx, cy, outer, b)
    path.push(
      curve(
        x1 - outer * lift * Math.sin(a),
        y1 + outer * lift * Math.cos(a),
        x2 + outer * lift * Math.sin(b),
        y2 - outer * lift * Math.cos(b),
        x2,
        y2
      )
    )
  }

  const [ix, iy] = polar(cx, cy, inner, to)
  path.push(`${ix.toFixed(2)} ${iy.toFixed(2)} l`)

  for (let i = steps; i > 0; i -= 1) {
    const a = from + step * i
    const b = a - step
    const [x1, y1] = polar(cx, cy, inner, a)
    const [x2, y2] = polar(cx, cy, inner, b)
    path.push(
      curve(
        x1 + inner * lift * Math.sin(a),
        y1 - inner * lift * Math.cos(a),
        x2 - inner * lift * Math.sin(b),
        y2 + inner * lift * Math.cos(b),
        x2,
        y2
      )
    )
  }

  return [fill(color), ...path, "h f", "0 g"]
}

export function donut({
  box,
  segments,
  ink,
  diameter = 116,
  thickness = 26,
  centre,
  format,
}: {
  box: PdfBox
  segments: Segment[]
  ink: ChartInk
  diameter?: number
  /** How wide the ring is. The hole is what is left. */
  thickness?: number
  /** The total, written in the hole. */
  centre?: DonutCentre
  format?: (value: number) => string
}): string[] {
  const drawable = segments.filter((segment) => segment.value > 0)
  const total = drawable.reduce((sum, segment) => sum + segment.value, 0)
  if (total <= 0) return []

  const outer = diameter / 2
  const inner = Math.max(4, outer - thickness)
  const cx = box.x + outer
  const cy = box.y - outer

  const out: string[] = []

  // From twelve o'clock, clockwise — the direction a reader's eye starts and
  // travels, and the one every other ring they have seen uses.
  let angle = Math.PI / 2
  for (const segment of drawable) {
    const sweep = (segment.value / total) * Math.PI * 2
    out.push(
      ...ringSlice(cx, cy, outer, inner, angle - sweep, angle, segment.color)
    )
    angle -= sweep
  }

  if (centre) {
    out.push(
      ...drawText(centre.value, {
        x: cx,
        y: cy + 1,
        font: "sans-bold",
        size: 12,
        align: "center",
        color: ink.ink,
      }),
      ...drawText(centre.label, {
        x: cx,
        y: cy - 10,
        size: 6.5,
        align: "center",
        color: ink.muted,
      })
    )
  }

  // The key sits beside the ring rather than under it: a ring is as tall as it
  // is wide and leaves a column of empty page to its right that the labels
  // exactly fill.
  const keyLeft = box.x + diameter + 18
  const keyWidth = box.width - diameter - 18
  if (keyWidth > 60) {
    out.push(
      ...key({
        box: { x: keyLeft, y: box.y - 6, width: keyWidth },
        series: drawable.map((segment) => ({
          label: segment.label,
          color: segment.color,
          note: `${format ? format(segment.value) : Math.round(segment.value)}  ${Math.round(
            (segment.value / total) * 100
          )}%`,
        })),
        ink,
        columns: 1,
      })
    )
  }

  return out
}

export function donutHeight(diameter = 116) {
  return diameter + 6
}
