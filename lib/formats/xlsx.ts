import { zipStream, type ZipEntry } from "@/lib/formats/zip"

// ---------------------------------------------------------------------------
// A spreadsheet, written by hand
// ---------------------------------------------------------------------------
//
// An .xlsx file is a ZIP of XML parts, and this codebase already has a ZIP
// writer — so a real spreadsheet costs a few hundred lines here rather than a
// megabyte of SheetJS in node_modules. CSV was the other option and it carries
// none of what was asked for: no column widths, no bold headings, no peso
// formatting, no frozen header row.
//
// Deliberately the smallest workbook Excel will open:
//
//   [Content_Types].xml       what each part is
//   _rels/.rels               points at the workbook
//   xl/workbook.xml           one sheet
//   xl/_rels/workbook.xml.rels
//   xl/styles.xml             the handful of formats used below
//   xl/worksheets/sheet1.xml  the cells
//
// Strings are written inline (`t="inlineStr"`) rather than through a shared
// string table: slightly larger on disk, one less part to keep consistent, and
// a payroll run is a few dozen rows.

/** XML text, with the five characters that would otherwise end the document. */
function xml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

/**
 * The style each cell wears. These index into the `cellXfs` list in `styles()`
 * below — the two have to stay in step.
 */
export const STYLE = {
  plain: 0,
  /** The company name at the top of the sheet. */
  title: 1,
  /** The lines under it: what this is, and when it was made. */
  caption: 2,
  /** Column headings: bold, reversed out, wrapped, centred. */
  header: 3,
  text: 4,
  /** Whole numbers — days, hours. */
  number: 5,
  /** Money: two decimals, thousands separated. */
  money: 6,
  /** The totals row: bold, ruled above. */
  totalText: 7,
  totalNumber: 8,
  totalMoney: 9,
  /** Free text that can run long — wraps inside its column, top-aligned. */
  note: 10,
} as const

export type Cell =
  | { kind: "text"; value: string; style?: number }
  | { kind: "number"; value: number; style?: number }
  | { kind: "blank"; style?: number }

export type Row = {
  cells: Cell[]
  /** Points. Left to Excel's default when absent. */
  height?: number
}

export type Sheet = {
  name: string
  /** Character widths, one per column, in order. */
  columns: number[]
  rows: Row[]
  /** Rows above this stay put when the sheet scrolls. 1-based. */
  freezeAtRow?: number
  /** "A1:E1" ranges to merge, for the title block. */
  merges?: string[]
}

/** 0 -> "A", 25 -> "Z", 26 -> "AA". */
export function columnName(index: number) {
  let name = ""
  let n = index
  while (n >= 0) {
    name = String.fromCharCode((n % 26) + 65) + name
    n = Math.floor(n / 26) - 1
  }
  return name
}

const CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
  "</Types>"

const ROOT_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  "</Relationships>"

const WORKBOOK_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  "</Relationships>"

function workbook(sheetName: string) {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets><sheet name="' +
    xml(sheetName) +
    '" sheetId="1" r:id="rId1"/></sheets>' +
    "</workbook>"
  )
}

/**
 * Fonts, fills, borders, and the cell formats that combine them.
 *
 * Format 164 is the money one: two decimals, thousands separated, and a
 * bracketed negative — a deduction should look different from an earning at a
 * glance rather than on a second read.
 */
function styles() {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00;(#,##0.00)"/></numFmts>',
    '<fonts count="5">',
    '<font><sz val="11"/><name val="Calibri"/></font>',
    '<font><b/><sz val="16"/><name val="Calibri"/></font>',
    '<font><sz val="10"/><color rgb="FF595959"/><name val="Calibri"/></font>',
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>',
    '<font><b/><sz val="11"/><name val="Calibri"/></font>',
    "</fonts>",
    '<fills count="3">',
    '<fill><patternFill patternType="none"/></fill>',
    '<fill><patternFill patternType="gray125"/></fill>',
    // The brand teal, so the sheet is recognisably the same system's output.
    '<fill><patternFill patternType="solid"><fgColor rgb="FF0F6C86"/><bgColor indexed="64"/></patternFill></fill>',
    "</fills>",
    '<borders count="3">',
    "<border><left/><right/><top/><bottom/><diagonal/></border>",
    '<border><left style="thin"><color rgb="FFD9D9D9"/></left><right style="thin"><color rgb="FFD9D9D9"/></right><top style="thin"><color rgb="FFD9D9D9"/></top><bottom style="thin"><color rgb="FFD9D9D9"/></bottom><diagonal/></border>',
    '<border><left/><right/><top style="double"><color rgb="FF7F7F7F"/></top><bottom/><diagonal/></border>',
    "</borders>",
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>',
    '<cellXfs count="11">',
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>',
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>',
    '<xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>',
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>',
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>',
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>',
    '<xf numFmtId="0" fontId="4" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1"/>',
    '<xf numFmtId="0" fontId="4" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>',
    '<xf numFmtId="164" fontId="4" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>',
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top" wrapText="1"/></xf>',
    "</cellXfs>",
    "</styleSheet>",
  ].join("")
}

function sheetXml(sheet: Sheet) {
  const cols = sheet.columns
    .map(
      (width, index) =>
        '<col min="' +
        (index + 1) +
        '" max="' +
        (index + 1) +
        '" width="' +
        width +
        '" customWidth="1"/>'
    )
    .join("")

  const rows = sheet.rows
    .map((row, rowIndex) => {
      const reference = rowIndex + 1
      const cells = row.cells
        .map((cell, columnIndex) => {
          const at = columnName(columnIndex) + reference
          const style = cell.style ? ' s="' + cell.style + '"' : ""
          if (cell.kind === "number") {
            return '<c r="' + at + '"' + style + "><v>" + cell.value + "</v></c>"
          }
          if (cell.kind === "text") {
            return (
              '<c r="' +
              at +
              '"' +
              style +
              ' t="inlineStr"><is><t xml:space="preserve">' +
              xml(cell.value) +
              "</t></is></c>"
            )
          }
          return '<c r="' + at + '"' + style + "/>"
        })
        .join("")
      const height = row.height
        ? ' ht="' + row.height + '" customHeight="1"'
        : ""
      return '<row r="' + reference + '"' + height + ">" + cells + "</row>"
    })
    .join("")

  // Freezing below the headings keeps the column names on screen while the
  // staff list scrolls — the difference between a usable sheet and one where
  // you count columns with a finger.
  const at = sheet.freezeAtRow
  const view = at
    ? '<sheetViews><sheetView workbookViewId="0" showGridLines="0">' +
      '<pane ySplit="' +
      at +
      '" topLeftCell="A' +
      (at + 1) +
      '" activePane="bottomLeft" state="frozen"/>' +
      '<selection pane="bottomLeft" activeCell="A' +
      (at + 1) +
      '" sqref="A' +
      (at + 1) +
      '"/></sheetView></sheetViews>'
    : '<sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews>'

  const merges = sheet.merges?.length
    ? '<mergeCells count="' +
      sheet.merges.length +
      '">' +
      sheet.merges.map((range) => '<mergeCell ref="' + range + '"/>').join("") +
      "</mergeCells>"
    : ""

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    view +
    "<cols>" +
    cols +
    "</cols>" +
    "<sheetData>" +
    rows +
    "</sheetData>" +
    merges +
    '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>' +
    '<pageSetup orientation="landscape" paperSize="9"/>' +
    "</worksheet>"
  )
}

/** The workbook as a stream, ready to be a Response body. */
export function xlsxStream(sheet: Sheet) {
  const encoder = new TextEncoder()
  const parts: ZipEntry[] = [
    { name: "[Content_Types].xml", bytes: encoder.encode(CONTENT_TYPES) },
    { name: "_rels/.rels", bytes: encoder.encode(ROOT_RELS) },
    { name: "xl/workbook.xml", bytes: encoder.encode(workbook(sheet.name)) },
    { name: "xl/_rels/workbook.xml.rels", bytes: encoder.encode(WORKBOOK_RELS) },
    { name: "xl/styles.xml", bytes: encoder.encode(styles()) },
    { name: "xl/worksheets/sheet1.xml", bytes: encoder.encode(sheetXml(sheet)) },
  ]

  async function* source() {
    for (const part of parts) yield part
  }

  return zipStream(source())
}
