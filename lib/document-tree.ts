import "server-only"

import type { Prisma } from "@/app/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import {
  MONTH_NAMES,
  REPORT_TYPE_FOLDER,
  type DocumentFolder,
  type FilePage,
  type ReportFile,
} from "@/lib/documents"
import type { ReportType } from "@/components/attendance/admin-attendance"

// ---------------------------------------------------------------------------
// The filing cabinet, one drawer at a time
// ---------------------------------------------------------------------------
//
// The tree the Documents tab shows is not stored anywhere: it is the reports
// table read from five angles.
//
//   year → PMS | Service Report → client → branch? → month → files
//
// Every level is a separate query filtered by the levels above it, so opening
// the page costs one small query no matter how many thousands of reports exist
// below it. The alternative — shipping the whole tree and expanding it in the
// browser — is the payload AGENTS.md rules out, and it grows every single day
// the company operates.

/**
 * Files per page. The folder levels above are a handful of tiles each; this is
 * the only level that grows without limit, so it is the only one that pages.
 */
export const FILES_PER_PAGE = 20

/** Ceiling on the rows read to work out which months have something in them. */
const MONTH_SCAN_LIMIT = 2000

export type TreePath = {
  year: number | null
  type: ReportType | null
  clientId: string | null
  /** "none" is the folder of reports filed against a client with no branch. */
  branchId: string | null
  month: number | null
}

const NO_BRANCH = "none"

function yearWindow(year: number) {
  return { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) }
}

function monthWindow(year: number, month: number) {
  return { gte: new Date(year, month, 1), lt: new Date(year, month + 1, 1) }
}

/**
 * Reports under a path, as a `where` clause.
 *
 * Filed under the day of the punch rather than the day of the upload: a shift
 * that ends at 02:00 belongs to the day it started, and on the 1st of a month
 * that is the difference between a report filing itself in the right drawer and
 * the wrong one.
 */
function scopeOf(path: TreePath): Prisma.AttendanceReportWhereInput {
  const where: Prisma.AttendanceReportWhereInput = {}

  if (path.year !== null) {
    where.attendance = {
      date:
        path.month !== null
          ? monthWindow(path.year, path.month)
          : yearWindow(path.year),
    }
  }
  if (path.type) where.type = path.type
  if (path.clientId) where.clientId = path.clientId
  if (path.branchId) {
    where.branchId = path.branchId === NO_BRANCH ? null : path.branchId
  }

  return where
}

/**
 * Which years have anything in them.
 *
 * Read from the oldest and newest report rather than by grouping: two indexed
 * lookups and a count per year beats scanning the table, and a company that has
 * been running for a decade still only has ten folders here.
 */
export async function listYears(): Promise<DocumentFolder[]> {
  const [oldest, newest] = await Promise.all([
    prisma.attendanceReport.findFirst({
      orderBy: { attendance: { date: "asc" } },
      select: { attendance: { select: { date: true } } },
    }),
    prisma.attendanceReport.findFirst({
      orderBy: { attendance: { date: "desc" } },
      select: { attendance: { select: { date: true } } },
    }),
  ])
  if (!oldest || !newest) return []

  const from = oldest.attendance.date.getFullYear()
  const to = newest.attendance.date.getFullYear()

  const years = Array.from({ length: to - from + 1 }, (_, i) => to - i)
  const counts = await Promise.all(
    years.map((year) =>
      prisma.attendanceReport.count({
        where: { attendance: { date: yearWindow(year) } },
      })
    )
  )

  return years
    .map((year, index) => ({
      id: String(year),
      name: String(year),
      count: counts[index],
    }))
    .filter((folder) => folder.count > 0)
}

/** PMS and Service Report, with what each holds in this year. */
export async function listTypes(path: TreePath): Promise<DocumentFolder[]> {
  const types: ReportType[] = ["PMS", "SERVICE"]
  const counts = await Promise.all(
    types.map((type) =>
      prisma.attendanceReport.count({ where: scopeOf({ ...path, type }) })
    )
  )

  return types
    .map((type, index) => ({
      id: type,
      name: REPORT_TYPE_FOLDER[type],
      count: counts[index],
    }))
    .filter((folder) => folder.count > 0)
}

export async function listClients(path: TreePath): Promise<DocumentFolder[]> {
  const groups = await prisma.attendanceReport.groupBy({
    by: ["clientId"],
    where: scopeOf(path),
    _count: { _all: true },
  })
  if (groups.length === 0) return []

  const clients = await prisma.client.findMany({
    where: { id: { in: groups.map((group) => group.clientId) } },
    select: { id: true, name: true },
  })
  const names = new Map(clients.map((client) => [client.id, client.name]))

  return groups
    .map((group) => ({
      id: group.clientId,
      name: names.get(group.clientId) ?? "Unknown client",
      count: group._count._all,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * The branches with reports in them, plus — when a client has filed anything
 * without one — a folder for those. A client with no branches at all returns
 * nothing, and the caller shows months instead.
 */
export async function listBranches(path: TreePath): Promise<DocumentFolder[]> {
  const groups = await prisma.attendanceReport.groupBy({
    by: ["branchId"],
    where: scopeOf(path),
    _count: { _all: true },
  })

  const withBranch = groups.filter((group) => group.branchId !== null)
  const branchless = groups.find((group) => group.branchId === null)

  // Every report here is against the client itself, so there is no branch level
  // to show — the caller drops straight to months, as the office files it.
  if (withBranch.length === 0) return []

  const branches = await prisma.branch.findMany({
    where: { id: { in: withBranch.map((group) => group.branchId!) } },
    select: { id: true, name: true, address: true },
  })
  const byId = new Map(branches.map((branch) => [branch.id, branch]))

  const folders: DocumentFolder[] = withBranch
    .map((group) => ({
      id: group.branchId!,
      name: byId.get(group.branchId!)?.name ?? "Unknown branch",
      hint: byId.get(group.branchId!)?.address,
      count: group._count._all,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  // A client that mostly has branches can still have a report filed against
  // the head office. It gets its own folder rather than disappearing.
  if (branchless) {
    folders.push({
      id: NO_BRANCH,
      name: "No branch",
      hint: "Filed against the client directly",
      count: branchless._count._all,
    })
  }

  return folders
}

/**
 * The months with something in them.
 *
 * Bucketed here rather than in SQL: the scope is already one client (and often
 * one branch) inside one year, which is tens of rows, and reading their dates
 * is cheaper than the raw query it would take to group by month portably.
 */
export async function listMonths(path: TreePath): Promise<DocumentFolder[]> {
  const rows = await prisma.attendanceReport.findMany({
    where: scopeOf(path),
    select: { attendance: { select: { date: true } } },
    take: MONTH_SCAN_LIMIT,
  })

  const counts = new Map<number, number>()
  for (const row of rows) {
    const month = row.attendance.date.getMonth()
    counts.set(month, (counts.get(month) ?? 0) + 1)
  }

  return [...counts.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([month, count]) => ({
      id: String(month),
      name: MONTH_NAMES[month],
      count,
    }))
}

/**
 * How the current scope splits between the two kinds of report.
 *
 * Counted with the *type* filter deliberately dropped, so the card reads the
 * same standing inside the PMS folder as outside it. Scoped to it instead, one
 * of the two numbers would always be zero, which tells nobody anything.
 */
export async function countByType(path: TreePath) {
  const scope = { ...path, type: null }

  const [pms, service] = await Promise.all([
    prisma.attendanceReport.count({ where: scopeOf({ ...scope, type: "PMS" }) }),
    prisma.attendanceReport.count({
      where: scopeOf({ ...scope, type: "SERVICE" }),
    }),
  ])

  return { pms, service, total: pms + service }
}

const FILE_SELECT = {
  id: true,
  fileName: true,
  serialNo: true,
  type: true,
  clientId: true,
  branchId: true,
  client: { select: { name: true } },
  branch: { select: { name: true } },
  attendance: {
    select: {
      date: true,
      employee: { select: { firstName: true, lastName: true } },
    },
  },
} satisfies Prisma.AttendanceReportSelect

type FileRecord = Prisma.AttendanceReportGetPayload<{
  select: typeof FILE_SELECT
}>

function toReportFile(row: FileRecord): ReportFile {
  const date = row.attendance.date

  return {
    id: row.id,
    fileName: row.fileName,
    serialNo: row.serialNo,
    servicedOn: date.toISOString(),
    filedBy: `${row.attendance.employee.firstName} ${row.attendance.employee.lastName}`,
    // Where it sits, so a search result can say where it came from and offer
    // the way back to that folder.
    location: {
      year: date.getFullYear(),
      month: date.getMonth(),
      type: row.type,
      clientId: row.clientId,
      clientName: row.client.name,
      branchId: row.branchId,
      branchName: row.branch?.name ?? null,
    },
  }
}

// One page and the count it is a page of, in two queries.
async function fetchFiles(
  where: Prisma.AttendanceReportWhereInput,
  page: number
): Promise<FilePage> {
  const total = await prisma.attendanceReport.count({ where })
  const pages = Math.max(1, Math.ceil(total / FILES_PER_PAGE))
  const at = Math.min(Math.max(1, Math.trunc(page)), pages)

  const rows = await prisma.attendanceReport.findMany({
    where,
    select: FILE_SELECT,
    orderBy: [{ attendance: { date: "desc" } }, { serialNo: "asc" }],
    skip: (at - 1) * FILES_PER_PAGE,
    take: FILES_PER_PAGE,
  })

  return { files: rows.map(toReportFile), total, page: at, pages }
}

export function listFiles(path: TreePath, page = 1) {
  return fetchFiles(scopeOf(path), page)
}

/**
 * Everything matching a typed query, across every folder.
 *
 * Matches the filename, the serial, the client and the branch in one pass, so
 * "searching for a folder" and "searching for a file" are the same box: typing
 * a client's name finds their reports, and each hit carries the path it lives
 * at so the folder is one click away. Deliberately unscoped — a search that
 * only looked inside the folder you happen to be standing in would miss the
 * report you are looking for, which is the entire reason you typed.
 */
export function searchFiles(query: string, page = 1) {
  const term = query.trim()
  if (!term) return fetchFiles({ id: "" }, 1)

  const contains = { contains: term, mode: "insensitive" as const }

  return fetchFiles(
    {
      OR: [
        { fileName: contains },
        { serialNo: contains },
        { client: { name: contains } },
        { branch: { name: contains } },
      ],
    },
    page
  )
}
