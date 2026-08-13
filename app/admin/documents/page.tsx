import Link from "next/link"
import { ChevronRight, ClipboardList, Folder, FolderOpen, Wrench } from "lucide-react"
import { requireManager } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import {
  MONTH_NAMES,
  REPORT_TYPE_FOLDER,
  type DocumentFolder,
  type FilePage,
} from "@/lib/documents"
import {
  countByType,
  FILES_PER_PAGE,
  listBranches,
  listClients,
  listFiles,
  listMonths,
  listTypes,
  listYears,
  searchFiles,
  type TreePath,
} from "@/lib/document-tree"
import type { ReportType } from "@/components/attendance/admin-attendance"
import { Pager } from "@/components/ui/pager"
import { DocumentSearch } from "@/components/documents/document-search"
import { ReportFileRow } from "@/components/documents/report-file-row"

// Every report a technician has filed, in the shape the office already files
// them in: year, then the kind of report, then who it was for, then where, then
// when. Nothing here is a new store — it is the attendance reports table read
// as a tree, so a report is browsable the moment the punch that carried it is
// saved.

type Params = Record<string, string | string[] | undefined>

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

// A deeper parameter without the ones above it would query a level that has no
// meaning ("August" of no year), so the path is only as deep as it is complete.
function parsePath(params: Params): TreePath {
  const year = Number(one(params.y))
  const validYear = Number.isInteger(year) && year > 2000 ? year : null

  const rawType = one(params.t)
  const type: ReportType | null =
    validYear && (rawType === "PMS" || rawType === "SERVICE") ? rawType : null

  const clientId = type ? (one(params.c) ?? null) : null
  const branchId = clientId ? (one(params.b) ?? null) : null

  const month = Number(one(params.m))
  const validMonth =
    clientId && Number.isInteger(month) && month >= 0 && month <= 11
      ? month
      : null

  return { year: validYear, type, clientId, branchId, month: validMonth }
}

function hrefFor(path: Partial<TreePath> & { page?: number; query?: string }) {
  const query = new URLSearchParams()
  if (path.query) query.set("q", path.query)
  if (path.year != null) query.set("y", String(path.year))
  if (path.type) query.set("t", path.type)
  if (path.clientId) query.set("c", path.clientId)
  if (path.branchId) query.set("b", path.branchId)
  if (path.month != null) query.set("m", String(path.month))
  if (path.page && path.page > 1) query.set("p", String(path.page))

  const search = query.toString()
  return search ? `/admin/documents?${search}` : "/admin/documents"
}

/**
 * The split between the two kinds of report, for wherever you're standing.
 *
 * Deliberately the first thing on the page: "how much PMS have we filed for
 * this client this year" is the question the tree exists to answer, and making
 * someone count folder badges to get it would be a poor joke.
 */
function SummaryCards({
  counts,
  scope,
}: {
  counts: { pms: number; service: number; total: number }
  scope: string
}) {
  const cards = [
    {
      label: "PMS reports",
      value: counts.pms,
      icon: ClipboardList,
      tone: "bg-sky-600/10 text-sky-700 dark:text-sky-400",
    },
    {
      label: "Service reports",
      value: counts.service,
      icon: Wrench,
      tone: "bg-violet-600/10 text-violet-700 dark:text-violet-400",
    },
    {
      label: "All reports",
      value: counts.total,
      icon: FolderOpen,
      tone: "bg-foreground/5 text-muted-foreground",
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {cards.map((card) => (
        <div key={card.label} className="rounded-xl border p-3">
          <div className="flex items-center gap-2">
            <span
              className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${card.tone}`}
            >
              <card.icon className="size-3.5" />
            </span>
            <p className="min-w-0 truncate text-xs text-muted-foreground">
              {card.label}
            </p>
          </div>
          <p className="mt-2 text-2xl leading-none font-semibold tabular-nums">
            {card.value.toLocaleString()}
          </p>
          <p className="mt-1 truncate text-[11px] text-muted-foreground">
            {scope}
          </p>
        </div>
      ))}
    </div>
  )
}

// A folder looks like a folder: an icon, a name, a count. No shadow, no chrome,
// nothing that competes with the file list it leads to.
function FolderTile({ href, folder }: { href: string; folder: DocumentFolder }) {
  return (
    <Link
      href={href}
      className="flex min-w-0 items-center gap-2.5 rounded-lg border px-3 py-2.5 outline-none transition-colors hover:bg-muted/50"
    >
      <Folder className="size-4.5 shrink-0 fill-sky-600/15 text-sky-600 dark:text-sky-400" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{folder.name}</span>
        {folder.hint && (
          <span className="block truncate text-[11px] text-muted-foreground">
            {folder.hint}
          </span>
        )}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
        {folder.count}
      </span>
    </Link>
  )
}

function Empty({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <FolderOpen className="size-5 text-muted-foreground" />
      </div>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
    </div>
  )
}

function FileList({
  page,
  showLocation,
  hrefForPage,
}: {
  page: FilePage
  showLocation?: boolean
  hrefForPage: (n: number) => string
}) {
  return (
    <div className="flex flex-col gap-3">
      {/* Column headings, desktop only — they name what the two right-hand
          columns are, and below `sm` those columns aren't there to name. */}
      <div className="hidden items-center gap-3 border-b px-1 pb-1.5 text-[11px] tracking-wide text-muted-foreground uppercase sm:flex">
        <span className="w-4 shrink-0" />
        <span className="min-w-0 flex-1">Name</span>
        <span className="w-40 shrink-0">Filed by</span>
        <span className="w-28 shrink-0">Serviced</span>
        <span className="w-4 shrink-0" />
      </div>

      <ul className="divide-y">
        {page.files.map((file) => (
          <li key={file.id}>
            <ReportFileRow file={file} showLocation={showLocation} />
          </li>
        ))}
      </ul>

      {/* Two strings, not the builder that made them: `Pager` is a client
          component and a function can't cross that boundary. */}
      <Pager
        page={page.page}
        pages={page.pages}
        total={page.total}
        noun="reports"
        pageSize={FILES_PER_PAGE}
        prevHref={hrefForPage(page.page - 1)}
        nextHref={hrefForPage(page.page + 1)}
      />
    </div>
  )
}

export default async function AdminDocumentsPage({
  searchParams,
}: PageProps<"/admin/documents">) {
  await requireManager()
  const params = await searchParams

  const query = (one(params.q) ?? "").trim()
  const pageNo = Math.max(1, Math.trunc(Number(one(params.p))) || 1)
  const path = parsePath(params)

  // Searching is its own mode: the tree is set aside and the whole table is
  // matched, because the report you can't find is rarely in the folder you
  // happen to be standing in.
  if (query) {
    const results = await searchFiles(query, pageNo)

    return (
      <div className="flex flex-col gap-5">
        <Header />
        <DocumentSearch query={query} />

        {results.total === 0 ? (
          <Empty
            message={`Nothing matches "${query}". Try a serial number, part of a filename, or the client's name.`}
          />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {results.total} {results.total === 1 ? "report" : "reports"}{" "}
              matching{" "}
              <span className="font-medium text-foreground">{query}</span>
            </p>
            <FileList
              page={results}
              showLocation
              hrefForPage={(n) => hrefFor({ query, page: n })}
            />
          </>
        )}
      </div>
    )
  }

  const [client, branch, counts] = await Promise.all([
    path.clientId
      ? prisma.client.findUnique({
          where: { id: path.clientId },
          select: { name: true },
        })
      : null,
    path.branchId && path.branchId !== "none"
      ? prisma.branch.findUnique({
          where: { id: path.branchId },
          select: { name: true },
        })
      : null,
    countByType(path),
  ])

  const crumbs: { label: string; href: string }[] = [
    { label: "Documents", href: hrefFor({}) },
  ]
  if (path.year != null) {
    crumbs.push({ label: String(path.year), href: hrefFor({ year: path.year }) })
  }
  if (path.type) {
    crumbs.push({
      label: REPORT_TYPE_FOLDER[path.type],
      href: hrefFor({ year: path.year, type: path.type }),
    })
  }
  if (path.clientId) {
    crumbs.push({
      label: client?.name ?? "Unknown client",
      href: hrefFor({ ...path, branchId: null, month: null }),
    })
  }
  if (path.branchId) {
    crumbs.push({
      label: path.branchId === "none" ? "No branch" : (branch?.name ?? "Branch"),
      href: hrefFor({ ...path, month: null }),
    })
  }
  if (path.month != null) {
    crumbs.push({ label: MONTH_NAMES[path.month], href: hrefFor(path) })
  }

  // What the counts are counting, said in the card so three bare numbers can't
  // be mistaken for company-wide totals when they aren't.
  const scopeLabel =
    crumbs.length === 1
      ? "All time"
      : crumbs
          .slice(1)
          .map((crumb) => crumb.label)
          .join(" · ")

  // One level, one query. Which level is decided by how complete the path is,
  // and the branch level is skipped entirely for a client that files everything
  // against itself — most of them.
  let folders: DocumentFolder[] = []
  let files: FilePage | null = null
  let childOf: (folder: DocumentFolder) => string = () => hrefFor({})

  if (path.year == null) {
    folders = await listYears()
    childOf = (folder) => hrefFor({ year: Number(folder.id) })
  } else if (!path.type) {
    folders = await listTypes(path)
    childOf = (folder) =>
      hrefFor({ year: path.year, type: folder.id as ReportType })
  } else if (!path.clientId) {
    folders = await listClients(path)
    childOf = (folder) => hrefFor({ ...path, clientId: folder.id })
  } else if (path.month == null) {
    const branches = path.branchId ? [] : await listBranches(path)

    if (branches.length > 0) {
      folders = branches
      childOf = (folder) => hrefFor({ ...path, branchId: folder.id })
    } else {
      folders = await listMonths(path)
      childOf = (folder) => hrefFor({ ...path, month: Number(folder.id) })
    }
  } else {
    files = await listFiles(path, pageNo)
  }

  return (
    <div className="flex flex-col gap-5">
      <Header />
      <DocumentSearch query="" />
      <SummaryCards counts={counts} scope={scopeLabel} />

      {/* The path, and the way back up it. Wraps rather than scrolls: on a
          phone the client name alone can be wider than the screen. */}
      <nav
        aria-label="Folder path"
        className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm"
      >
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1
          return (
            <span key={crumb.href} className="flex min-w-0 items-center gap-1">
              {index > 0 && (
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
              )}
              {last ? (
                <span className="truncate font-medium">{crumb.label}</span>
              ) : (
                <Link
                  href={crumb.href}
                  className="truncate text-muted-foreground outline-none hover:text-foreground hover:underline"
                >
                  {crumb.label}
                </Link>
              )}
            </span>
          )
        })}
      </nav>

      {files ? (
        files.total === 0 ? (
          <Empty message="No reports were filed here." />
        ) : (
          <FileList
            page={files}
            hrefForPage={(n) => hrefFor({ ...path, page: n })}
          />
        )
      ) : folders.length === 0 ? (
        <Empty
          message={
            path.year == null
              ? "No reports have been filed yet. They arrive here as soon as a technician times out with one attached."
              : "This folder is empty."
          }
        />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {folders.map((folder) => (
            <FolderTile
              key={folder.id}
              href={childOf(folder)}
              folder={folder}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Header() {
  return (
    <div>
      <h2 className="text-lg font-semibold">Documents</h2>
      <p className="text-sm text-muted-foreground">
        Every PMS and service report filed from the field, in the order the
        office looks for them.
      </p>
    </div>
  )
}
