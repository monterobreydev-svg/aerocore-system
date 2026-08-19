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
//   *Monospace for anything in columns.* Right-aligning proportional text needs
//   a per-glyph width table; in Courier every glyph is exactly 0.6 em, so a row
//   composed with `padStart`/`padEnd` lands where it is put. The tables here are
//   built as text, not as a layout.

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

type PdfFont = "sans" | "sans-bold" | "mono" | "mono-bold"

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

function contentStream(
  blocks: PdfBlock[],
  startAt: number
): { stream: string; next: number } {
  const parts: string[] = []
  let y = PAGE_HEIGHT - MARGIN
  let index = startAt

  while (index < blocks.length) {
    const block = blocks[index]

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
  // fits, nothing is consumed, and the next page starts at the same index.
  if (index === startAt && index < blocks.length) index++

  return { stream: parts.join("\n"), next: index }
}

/**
 * The blocks as a PDF, paginated top to bottom.
 *
 * Returns bytes rather than writing anywhere — the caller decides whether that
 * becomes a download, an attachment or a file.
 */
export function renderPdf(blocks: PdfBlock[]): Uint8Array<ArrayBuffer> {
  const streams: string[] = []
  let at = 0

  do {
    const { stream, next } = contentStream(blocks, at)
    streams.push(stream)
    at = next
  } while (at < blocks.length)

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
