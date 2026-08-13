import type { AttendanceReportType } from "@/app/generated/prisma/client"

// ---------------------------------------------------------------------------
// How a filed report is named and where it files itself
// ---------------------------------------------------------------------------
//
// A report arrives from a phone called whatever the scanner app called it —
// "Scan_20260811_0003.pdf", "IMG_4471.pdf", "document (1).pdf" — and the office
// then has to find it again by the serial a client quotes over the phone. So
// the name it was given is discarded on arrival and rebuilt from the three
// facts that identify it:
//
//   SERIAL_ACRONYM_BRANCH.pdf      e.g.  PMS-1042_ACS_MAKATI.pdf
//
// The same three facts decide where it lands, so the bucket and the Documents
// tab are the same tree seen from two sides:
//
//   2026 / PMS / AEON CREDIT SERVICE / MAKATI / 08 August / PMS-1042_ACS_MAKATI.pdf
//
// Every name here is composed on the server from database rows, never from what
// the browser sent, so a tampered upload can't file itself under someone else.

// The shapes the browser is handed. They live in this module rather than with
// the queries that build them because `lib/document-tree.ts` is server-only and
// pulls in Prisma: a client component importing a type from there would be one
// careless `import type` → `import` away from dragging the database client into
// a phone's bundle.

export type DocumentFolder = {
  /** Query-string value that opens it. */
  id: string
  name: string
  count: number
  /** Second line: a branch's address, or why the folder exists. */
  hint?: string
}

/** The folder a report sits in — what a search result has to say to be useful. */
export type ReportLocation = {
  year: number
  month: number
  type: AttendanceReportType
  clientId: string
  clientName: string
  branchId: string | null
  branchName: string | null
}

export type ReportFile = {
  id: string
  fileName: string
  serialNo: string
  /** The day the work was done, not the day the file was uploaded. */
  servicedOn: string
  filedBy: string
  location: ReportLocation
}

/** A page of files, and enough to say which page it is. */
export type FilePage = {
  files: ReportFile[]
  total: number
  page: number
  pages: number
}

/** Folder names for the two kinds of report, as they read on screen. */
export const REPORT_TYPE_FOLDER: Record<AttendanceReportType, string> = {
  PMS: "PMS",
  SERVICE: "Service Report",
}

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const

/**
 * "08 August" — numbered so a plain alphabetical listing of the bucket still
 * comes out in calendar order. April before August is nobody's idea of a
 * filing system.
 */
export function monthFolder(month: number) {
  return `${String(month + 1).padStart(2, "0")} ${MONTH_NAMES[month]}`
}

// Words that say what a company *is* rather than which company it is. Dropping
// them is the difference between ACS and ACSPI for the same client, and every
// Philippine client name ends in two or three of them.
const NOISE = new Set([
  "INC",
  "INCORPORATED",
  "CORP",
  "CORPORATION",
  "CO",
  "COMPANY",
  "LTD",
  "LIMITED",
  "PHILIPPINES",
  "PHILIPPINE",
  "PHILS",
  "PHIL",
  "PH",
  "OF",
  "AND",
  "THE",
  "FOR",
  "GROUP",
])

/**
 * "AEON CREDIT SERVICE (Philippines) INC." → "ACS".
 *
 * First letters of the words that carry the identity. Capped at six, because
 * past that it stops being an abbreviation and starts being the name again.
 * Two clients can derive to the same letters — the serial in front of it is
 * what makes a filename unique, not this.
 */
export function clientAcronym(name: string) {
  const words = name
    .normalize("NFKD")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)

  const meaningful = words.filter((word) => !NOISE.has(word))
  // Everything was noise ("The Company Ltd") — fall back to the raw words
  // rather than returning nothing to name a file with.
  const source = meaningful.length > 0 ? meaningful : words

  const letters = source.map((word) => word[0]).join("").slice(0, 6)
  return letters || "CLIENT"
}

/**
 * One field of a filename: readable, and safe on any filesystem or in a URL.
 * Spaces become hyphens rather than disappearing, so "SAN PASCUAL" stays two
 * words to the eye.
 */
export function fileSegment(value: string, fallback = "UNNAMED") {
  const cleaned = value
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
  return cleaned || fallback
}

function extensionOf(filename: string) {
  if (!filename.includes(".")) return "pdf"
  const raw = filename.split(".").pop()!
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "pdf"
}

/**
 * The name a filed report is stored and downloaded under, whatever the phone
 * called it. Branch is included only when the client has one — most don't, and
 * a trailing separator with nothing after it looks like a bug.
 */
export function reportFileName({
  serialNo,
  clientName,
  branchName,
  sourceName,
}: {
  serialNo: string
  clientName: string
  branchName: string | null
  /** The uploaded file, read only for its extension. */
  sourceName: string
}) {
  const parts = [
    fileSegment(serialNo, "NO-SERIAL"),
    clientAcronym(clientName),
    ...(branchName ? [fileSegment(branchName)] : []),
  ]

  return `${parts.join("_")}.${extensionOf(sourceName)}`
}
