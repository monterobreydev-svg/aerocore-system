import "server-only"

// ---------------------------------------------------------------------------
// A PDF, one line at a time
// ---------------------------------------------------------------------------
//
// A payslip is a page of headings, ruled lines and a column of figures. That is
// a small enough subset of PDF to write directly, and writing it directly is
// what keeps a print-a-document dependency — and its transitive tree — out of a
// project whose whole point is being small on a phone.
//
// Two decisions make it this short:
//
//   *The standard fonts.* Helvetica and Courier are built into every reader, so
//   nothing is embedded and the file stays a few kilobytes rather than the
//   hundreds a subsetted font costs.
//
//   *Two ways to put things in columns.* A report flows: blocks stack down the
//   page, and a row of figures is composed as monospace text, where every glyph
//   is exactly 0.6 em and `padStart` lands where it is put. A form is ruled:
//   `{ kind: "table" }` draws the boxes and places each cell inside its own,
//   which is what a payslip is read as. That one needs real glyph widths, so
//   the Helvetica tables below exist for it.

const PAGE_WIDTH = 595 // A4 at 72dpi
const PAGE_HEIGHT = 842
const MARGIN = 48
const BOTTOM = 56

export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2

/** Courier's one and only advance width, as a fraction of the font size. */
export const MONO_ADVANCE = 0.6

/** Characters that fit across the page at a given monospace size. */
export function monoColumns(size: number) {
  return Math.floor(CONTENT_WIDTH / (size * MONO_ADVANCE))
}

export type PdfBlock =
  | { kind: "text"; text: string; font?: PdfFont; size?: number; indent?: number }
  | { kind: "rule"; light?: boolean }
  | { kind: "space"; height: number }
  | PdfTable

/**
 * A ruled table — the boxed grid a payslip or any other form is read as.
 *
 * `widths` are relative weights, not points: the table always fills the page's
 * content width, so a caller says "this column is twice that one" and never has
 * to know what the margins are. Rows carry cells left to right; a cell may span
 * several columns, which is what makes a heading band across a group of them.
 */
export type PdfTable = {
  kind: "table"
  widths: number[]
  rows: PdfTableRow[]
  /** Default size for cells that don't name one. */
  size?: number
}

export type PdfTableRow = {
  cells: PdfCell[]
  /** Points. Defaults to the row's largest text, with room around it. */
  height?: number
  /** Shade every cell — a heading band. */
  fill?: boolean
}

export type PdfCell = {
  text: string
  /** Columns this cell covers. Default 1. */
  span?: number
  align?: PdfAlign
  font?: PdfFont
  size?: number
  /** Shade this cell alone. */
  fill?: boolean
}

export type PdfAlign = "left" | "center" | "right"

export type PdfFont = "sans" | "sans-bold" | "mono" | "mono-bold"

const FONT_KEYS: Record<PdfFont, string> = {
  sans: "F1",
  "sans-bold": "F2",
  mono: "F3",
  "mono-bold": "F4",
}

const FONT_NAMES: Record<PdfFont, string> = {
  sans: "Helvetica",
  "sans-bold": "Helvetica-Bold",
  mono: "Courier",
  "mono-bold": "Courier-Bold",
}

const FONT_ORDER: PdfFont[] = ["sans", "sans-bold", "mono", "mono-bold"]

// ---------------------------------------------------------------------------
// How wide a string is
// ---------------------------------------------------------------------------
//
// Courier needs no table — every glyph is 0.6 em — which is why the flowing
// half of this renderer composes its columns with `padStart`. A ruled form
// can't: a heading is centred in its cell and a figure sits against the right
// edge of one, and neither can be done by counting characters in a proportional
// face. These are the AFM advance widths for printable ASCII in 1/1000 em,
// which is every character a form here is written in.

// prettier-ignore
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
]

// prettier-ignore
const HELVETICA_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
]

/** Lowercase 'e', near enough for the accented characters outside the table. */
const AVERAGE_WIDTH = 556

export function textWidth(text: string, font: PdfFont, size: number) {
  if (font === "mono" || font === "mono-bold") {
    return text.length * size * MONO_ADVANCE
  }

  const table = font === "sans-bold" ? HELVETICA_BOLD : HELVETICA
  let mille = 0
  for (const char of text) {
    const code = char.codePointAt(0)!
    mille += code >= 32 && code <= 126 ? table[code - 32] : AVERAGE_WIDTH
  }
  return (mille * size) / 1000
}

/**
 * The text as lines that fit the page, broken between words.
 *
 * A `text` block is one line and nothing measures it, so a sentence longer than
 * the page runs off the right edge and out of the document — invisible in the
 * source, invisible until somebody prints it. Anything written as prose rather
 * than composed into columns goes through here first.
 */
export function wrapText(
  text: string,
  font: PdfFont,
  size: number,
  width = CONTENT_WIDTH
) {
  const lines: string[] = []
  let line = ""

  for (const word of text.split(" ")) {
    const candidate = line ? `${line} ${word}` : word
    if (line && textWidth(candidate, font, size) > width) {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
  }

  if (line) lines.push(line)
  return lines
}

/**
 * As much of the text as fits, ending in an ellipsis when something was cut.
 *
 * A cell that silently overflows writes across its neighbour's figure, which on
 * a payslip is worse than a truncated job title.
 */
function fitted(text: string, font: PdfFont, size: number, room: number) {
  if (textWidth(text, font, size) <= room) return text

  let cut = text
  while (cut.length > 1 && textWidth(`${cut}…`, font, size) > room) {
    cut = cut.slice(0, -1)
  }
  return `${cut}…`
}

// ---------------------------------------------------------------------------
// Ruled tables
// ---------------------------------------------------------------------------

/** Space either side of a cell's text. */
const CELL_PADDING = 5

/** A row is this many times its type size, so the text sits in a band. */
const ROW_LEADING = 1.95

const GRID_GREY = "0.45"
const FILL_GREY = "0.90"

function rowHeight(row: PdfTableRow, size: number) {
  if (row.height) return row.height
  const largest = row.cells.reduce(
    (max, cell) => Math.max(max, cell.size ?? size),
    size
  )
  return Math.round(largest * ROW_LEADING)
}

function line(x1: number, y1: number, x2: number, y2: number) {
  return `${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`
}

/**
 * As many rows of the table as the page has room for.
 *
 * Splitting between rows rather than refusing to split at all: a table of
 * adjustments has no fixed length, and a form that silently drops its last
 * three lines because they crossed a page boundary is worse than one that
 * continues overleaf.
 */
function drawTable(table: PdfTable, from: number, top: number) {
  const size = table.size ?? 9
  const weight = table.widths.reduce((sum, value) => sum + value, 0)

  // Left edge of every column, plus the right edge of the last.
  const edges = [MARGIN]
  for (const width of table.widths) {
    edges.push(edges[edges.length - 1] + (CONTENT_WIDTH * width) / weight)
  }
  const right = edges[edges.length - 1]

  const fills: string[] = []
  const strokes: string[] = []
  const text: string[] = []

  let y = top
  let index = from

  while (index < table.rows.length) {
    const row = table.rows[index]
    const height = rowHeight(row, size)
    if (y - height < BOTTOM) break

    const bottom = y - height
    // Cap height is about 0.72 em; centring on that rather than on the full
    // size is what stops every band looking like its text sits low.
    const baseline = bottom + (height - size * 0.72) / 2

    let column = 0
    for (const cell of row.cells) {
      const span = cell.span ?? 1
      const start = edges[Math.min(column, edges.length - 1)]
      const stop = edges[Math.min(column + span, edges.length - 1)]
      const font = cell.font ?? "sans"
      const cellSize = cell.size ?? size

      if (cell.fill ?? row.fill) {
        fills.push(
          `${FILL_GREY} g ${start.toFixed(2)} ${bottom.toFixed(2)} ${(stop - start).toFixed(2)} ${height.toFixed(2)} re f`
        )
      }

      // Every internal boundary, drawn per row so a spanned cell has no line
      // running through it.
      if (column > 0) strokes.push(line(start, bottom, start, y))

      if (cell.text) {
        const shown = fitted(
          cell.text,
          font,
          cellSize,
          stop - start - CELL_PADDING * 2
        )
        const width = textWidth(shown, font, cellSize)
        const x =
          cell.align === "right"
            ? stop - CELL_PADDING - width
            : cell.align === "center"
              ? start + (stop - start - width) / 2
              : start + CELL_PADDING

        text.push(
          `BT /${FONT_KEYS[font]} ${cellSize} Tf 1 0 0 1 ${x.toFixed(2)} ${baseline.toFixed(2)} Tm (${literal(shown)}) Tj ET`
        )
      }

      column += span
    }

    strokes.push(line(MARGIN, bottom, right, bottom))
    y = bottom
    index++
  }

  // Nothing was drawn, so nothing to box.
  if (index === from) return { parts: [], y: top, next: from }

  strokes.push(line(MARGIN, top, right, top))
  strokes.push(line(MARGIN, y, MARGIN, top))
  strokes.push(line(right, y, right, top))

  return {
    // Fills first or they cover the grid; the grid before the text for the
    // same reason.
    parts: [
      ...fills,
      `${GRID_GREY} G 0.6 w`,
      ...strokes,
      "0 g",
      ...text,
    ],
    y,
    next: index,
  }
}

/**
 * A string as a PDF literal.
 *
 * The three characters that end or nest a literal have to be escaped, and
 * anything outside WinAnsi has no glyph in the standard fonts — including the
 * peso sign, which is why every amount in a payslip here is labelled "PHP" and
 * printed as a bare number. Unmappable characters become "?" rather than
 * silently producing a blank or a broken stream.
 */
/**
 * The punctuation WinAnsi keeps in 0x80–0x9F, where Latin-1 has control codes.
 *
 * Small but not optional: every cutoff on this system is labelled "Aug 1 – 15",
 * and without the en dash that reads "Aug 1 ? 15" on every payslip the company
 * ever issues.
 */
const WIN_ANSI_PUNCTUATION: Record<string, number> = {
  "€": 0x80, // €
  "‚": 0x82,
  "„": 0x84,
  "…": 0x85, // …
  "‘": 0x91, // ‘
  "’": 0x92, // ’
  "“": 0x93, // “
  "”": 0x94, // ”
  "•": 0x95, // •
  "–": 0x96, // –
  "—": 0x97, // —
}

function literal(text: string) {
  let out = ""
  for (const char of text) {
    const code = char.codePointAt(0)!
    const mapped = WIN_ANSI_PUNCTUATION[char]

    if (char === "(" || char === ")" || char === "\\") out += `\\${char}`
    else if (code >= 32 && code <= 126) out += char
    else if (mapped !== undefined) out += `\\${mapped.toString(8).padStart(3, "0")}`
    else if (code >= 160 && code <= 255)
      out += `\\${code.toString(8).padStart(3, "0")}`
    // The peso sign is the one that matters and WinAnsi has no slot for it,
    // which is why every amount in a payslip is labelled PHP instead.
    else out += "?"
  }
  return out
}

/**
 * Where the last page stopped: a block, and how far into it.
 *
 * `row` is only ever non-zero for a table that ran off the bottom of a page —
 * everything else is consumed whole or not at all.
 */
type Cursor = { index: number; row: number }

function contentStream(
  blocks: PdfBlock[],
  startAt: Cursor
): { stream: string; next: Cursor } {
  const parts: string[] = []
  let y = PAGE_HEIGHT - MARGIN
  let index = startAt.index
  let row = startAt.row

  while (index < blocks.length) {
    const block = blocks[index]

    if (block.kind === "table") {
      const drawn = drawTable(block, row, y)
      parts.push(...drawn.parts)
      y = drawn.y

      // Nothing more of this table fits; the rest of it opens the next page.
      if (drawn.next < block.rows.length) {
        row = drawn.next
        break
      }

      row = 0
      index++
      continue
    }

    if (block.kind === "space") {
      y -= block.height
      index++
      continue
    }

    if (block.kind === "rule") {
      // A rule needs no room of its own — it sits on the gap already left by
      // the space around it — but it must not be the thing that runs off the
      // bottom of a page either.
      if (y < BOTTOM) break
      parts.push(
        `${block.light ? "0.85" : "0.6"} G 0.5 w ${MARGIN} ${y.toFixed(2)} m ${(PAGE_WIDTH - MARGIN).toFixed(2)} ${y.toFixed(2)} l S`
      )
      y -= 6
      index++
      continue
    }

    const size = block.size ?? 10
    const font = block.font ?? "sans"
    const leading = size * 1.45

    y -= leading
    if (y < BOTTOM) {
      y += leading
      break
    }

    const x = MARGIN + (block.indent ?? 0)
    parts.push(
      `BT /${FONT_KEYS[font]} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${literal(block.text)}) Tj ET`
    )
    index++
  }

  // A block too tall for a fresh page would otherwise loop forever: nothing
  // fits, nothing is consumed, and the next page starts where this one did.
  if (index === startAt.index && row === startAt.row && index < blocks.length) {
    index++
    row = 0
  }

  return { stream: parts.join("\n"), next: { index, row } }
}

/**
 * The blocks as a PDF, paginated top to bottom.
 *
 * Returns bytes rather than writing anywhere — the caller decides whether that
 * becomes a download, an attachment or a file.
 */
export function renderPdf(blocks: PdfBlock[]): Uint8Array<ArrayBuffer> {
  const streams: string[] = []
  let at: Cursor = { index: 0, row: 0 }

  do {
    const { stream, next } = contentStream(blocks, at)
    streams.push(stream)
    at = next
  } while (at.index < blocks.length)

  // Object numbering: 1 catalog, 2 pages, then a page and a stream per sheet,
  // then the four fonts. Worked out up front because a cross-reference table is
  // byte offsets and every object has to know what the ones after it are called.
  const pageCount = streams.length
  const firstPage = 3
  const firstFont = firstPage + pageCount * 2

  const objects: string[] = []

  objects.push(`<< /Type /Catalog /Pages 2 0 R >>`)
  objects.push(
    `<< /Type /Pages /Kids [${streams
      .map((_, i) => `${firstPage + i * 2} 0 R`)
      .join(" ")}] /Count ${pageCount} >>`
  )

  const resources = `<< /Font << ${FONT_ORDER.map(
    (font, i) => `/${FONT_KEYS[font]} ${firstFont + i} 0 R`
  ).join(" ")} >> >>`

  streams.forEach((stream, i) => {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources ${resources} /Contents ${firstPage + i * 2 + 1} 0 R >>`
    )
    objects.push(
      `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`
    )
  })

  for (const font of FONT_ORDER) {
    objects.push(
      `<< /Type /Font /Subtype /Type1 /BaseFont /${FONT_NAMES[font]} /Encoding /WinAnsiEncoding >>`
    )
  }

  // latin1 throughout: every byte written is already in that range after
  // `literal`, and it keeps one byte one character so the offsets below are the
  // offsets a reader will actually seek to.
  let body = "%PDF-1.4\n"
  const offsets: number[] = []

  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(body, "latin1"))
    body += `${i + 1} 0 obj\n${object}\nendobj\n`
  })

  const xrefAt = Buffer.byteLength(body, "latin1")
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) {
    xref += `${String(offset).padStart(10, "0")} 00000 n \n`
  }

  body += `${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`

  // Copied into a plain ArrayBuffer rather than handed over as the Buffer's
  // own view: Node pools Buffer memory, so the underlying buffer is shared and
  // typed as such, which a Response body will not accept.
  const encoded = Buffer.from(body, "latin1")
  const bytes = new Uint8Array(new ArrayBuffer(encoded.byteLength))
  bytes.set(encoded)
  return bytes
}
