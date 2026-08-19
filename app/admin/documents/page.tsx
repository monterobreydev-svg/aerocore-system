import Link from "next/link"
import {
  ChevronRight,
  ClipboardList,
  Download,
  Folder,
  FolderOpen,
  Wrench,
} from "lucide-react"
import { requireManager } from "@/lib/auth"
import { prisma } from "@/lib/db/prisma"
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
  MAX_ZIP_FILES,
  parseTreePath,
  searchFiles,
  searchFolders,
  type TreePath,
} from "@/lib/documents/tree"
import type { ReportType } from "@/components/attendance/admin-attendance"
import { LinkPending } from "@/components/ui/link-pending"
import { DocumentSearch } from "@/components/documents/document-search"
import { DocumentFiles } from "@/components/documents/document-files"

// Every report a technician has filed, in the shape the office already files
// them in: year, then the kind of report, then who it was for, then where, then
// when. Nothing here is a new store — it is the attendance reports table read
// as a tree, so a report is browsable the moment the punch that carried it is
// saved.

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

/** The folder, as query parameters — the half of a link both readers share. */
function pathQuery(path: Partial<TreePath>) {
  const query = new URLSearchParams()
  if (path.year != null) query.set("y", String(path.year))
  if (path.type) query.set("t", path.type)
  if (path.clientId) query.set("c", path.clientId)
  if (path.branchId) query.set("b", path.branchId)
  if (path.month != null) query.set("m", String(path.month))
  return query.toString()
}

function hrefFor(path: Partial<TreePath> & { page?: number; query?: string }) {
  const query = new URLSearchParams(pathQuery(path))
  if (path.query) query.set("q", path.query)
  if (path.page && path.page > 1) query.set("p", String(path.page))

  const search = query.toString()
  return search ? `/admin/documents?${search}` : "/admin/documents"
}

/**
 * The same folder, as one zip.
 *
 * Deliberately a plain link and not a button that fetches: the browser
 * navigates, gets an attachment back and puts the archive in its own downloads
 * list, where it survives leaving the page and can be retried when the office
 * wifi drops halfway through.
 */
function archiveHref(path: Partial<TreePath>) {
  const query = pathQuery(path)
  return query
    ? `/api/documents/download?${query}`
    : "/api/documents/download"
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
        <div key={card.label} className="rounded-xl border p-2.5 sm:p-3">
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
          <p className="mt-2 text-xl leading-none font-semibold tabular-nums sm:text-2xl">
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
//
// The whole tile used to be the link. It is now a link *and* a download, side by
// side, because the reason someone opens a client's August folder is usually to
// take August away with them — and a nested anchor inside an anchor is not a
// thing, so the two share a row rather than one containing the other.
function FolderTile({
  href,
  download,
  folder,
}: {
  href: string
  download: string
  folder: DocumentFolder
}) {
  // Over the cap the archive would be refused by the route, so the tile says so
  // here instead of after the click.
  const tooMany = folder.count > MAX_ZIP_FILES
  const icon = "size-4 shrink-0"

  return (
    <div className="flex min-w-0 items-center rounded-lg border transition-colors hover:bg-muted/50">
      <Link
        href={href}
        className="flex min-w-0 flex-1 items-center gap-2.5 py-2.5 pl-3 outline-none"
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
        {/* Opening a folder is a query change, not a route change, so no
            `loading.tsx` fires — the tile has to show its own wait. */}
        <LinkPending className="ml-1 text-muted-foreground" />
      </Link>

      {tooMany ? (
        <span
          title={`${folder.count} reports is too many for one archive — open ${folder.name} and download a folder inside it.`}
          className="mx-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground opacity-40"
        >
          <Download className={icon} />
        </span>
      ) : (
        <a
          href={download}
          aria-label={`Download ${folder.name} as a ZIP`}
          title={`Download ${folder.name} as a ZIP`}
          className="mx-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-background hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Download className={icon} />
        </a>
      )}
    </div>
  )
}

/**
 * "Folders 3" — the rule that turns two lists into a hierarchy.
 *
 * Folders come first because a folder is the more useful answer: it holds the
 * file you were looking for *and* the ones you hadn't thought of yet.
 */
function SearchHeading({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </h3>
      <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}

function Empty({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center sm:p-12">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <FolderOpen className="size-5 text-muted-foreground" />
      </div>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
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
  const path = parseTreePath((key) => one(params[key]))

  // Searching is its own mode: the tree is set aside and the whole table is
  // matched, because the report you can't find is rarely in the folder you
  // happen to be standing in.
  if (query) {
    // Both halves at once: a name can be a folder and a filing at the same
    // time, and which one somebody wants is not something to guess at.
    const [folders, results] = await Promise.all([
      searchFolders(query),
      searchFiles(query, pageNo),
    ])

    return (
      <div className="flex flex-col gap-5">
        <Header />
        <DocumentSearch query={query} />

        {folders.length === 0 && results.total === 0 ? (
          <Empty
            message={`Nothing matches "${query}". Try a serial number, part of a filename, or a client or branch name.`}
          />
        ) : (
          <>
            {folders.length > 0 && (
              <section className="flex flex-col gap-2">
                <SearchHeading label="Folders" count={folders.length} />
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {folders.map((folder) => (
                    <FolderTile
                      key={folder.key}
                      href={hrefFor(folder.path)}
                      download={archiveHref(folder.path)}
                      folder={{
                        id: folder.key,
                        name: folder.name,
                        // Where the folder sits, since a client has one of
                        // these per year and per kind of report.
                        hint: folder.trail,
                        count: folder.count,
                      }}
                    />
                  ))}
                </div>
              </section>
            )}

            {results.total > 0 && (
              <section className="flex flex-col gap-2">
                <SearchHeading label="Files" count={results.total} />
                {/* Keyed by the page it is showing, so ticked boxes don't
                    survive into a page whose reports they are no longer on. */}
                <DocumentFiles
                  key={`search-${results.page}`}
                  page={results}
                  showLocation
                  folderQuery=""
                  filesPerPage={FILES_PER_PAGE}
                  prevHref={hrefFor({ query, page: results.page - 1 })}
                  nextHref={hrefFor({ query, page: results.page + 1 })}
                />
              </section>
            )}
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
  // The path a tile leads to rather than the link itself, because a tile is now
  // two links to the same folder — one that opens it, one that zips it.
  let childOf: (folder: DocumentFolder) => Partial<TreePath> = () => ({})

  if (path.year == null) {
    folders = await listYears()
    childOf = (folder) => ({ year: Number(folder.id) })
  } else if (!path.type) {
    folders = await listTypes(path)
    childOf = (folder) => ({ year: path.year, type: folder.id as ReportType })
  } else if (!path.clientId) {
    folders = await listClients(path)
    childOf = (folder) => ({ ...path, clientId: folder.id })
  } else if (path.month == null) {
    const branches = path.branchId ? [] : await listBranches(path)

    if (branches.length > 0) {
      folders = branches
      childOf = (folder) => ({ ...path, branchId: folder.id })
    } else {
      folders = await listMonths(path)
      childOf = (folder) => ({ ...path, month: Number(folder.id) })
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
          <DocumentFiles
            key={`${pathQuery(path)}-${files.page}`}
            page={files}
            folderQuery={pathQuery(path)}
            filesPerPage={FILES_PER_PAGE}
            prevHref={hrefFor({ ...path, page: files.page - 1 })}
            nextHref={hrefFor({ ...path, page: files.page + 1 })}
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
              href={hrefFor(childOf(folder))}
              download={archiveHref(childOf(folder))}
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
