"use client"

import { useMemo, useState } from "react"
import { Download } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Pager } from "@/components/ui/pager"
import { ReportFileRow } from "@/components/documents/report-file-row"
import type { FilePage } from "@/lib/documents"

// Module-level so an empty selection keeps the same identity between renders.
const EMPTY: ReadonlySet<string> = new Set<string>()

/**
 * The files in a folder, with a tick box against each one.
 *
 * Clicking a row still downloads that one report on its own — that is the
 * common case and it stayed a single click. The boxes are for the other case:
 * the four reports a client is asking about, which used to be four separate
 * clicks and four separate files landing in Downloads. Ticked, they arrive as
 * one archive.
 *
 * Selection is per page on purpose. Carrying it across a page change would mean
 * a "6 selected" bar sitting above six reports you can no longer see, so the
 * server remounts this list when the page changes and the boxes start empty.
 */
export function DocumentFiles({
  page,
  showLocation,
  folderQuery,
  filesPerPage,
  prevHref,
  nextHref,
}: {
  page: FilePage
  /** Search results come from everywhere, so they have to say where from. */
  showLocation?: boolean
  /**
   * The current folder as a query string. The archive is named after it and
   * each file is filed relative to it, so a selection out of a search result
   * still unzips into its tree.
   */
  folderQuery: string
  filesPerPage: number
  prevHref: string
  nextHref: string
}) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(EMPTY)

  const count = selected.size
  const all = count > 0 && count === page.files.length

  const href = useMemo(() => {
    if (count === 0) return null
    const ids = page.files
      .filter((file) => selected.has(file.id))
      .map((file) => file.id)
      .join(",")
    return `/api/documents/download?${folderQuery ? `${folderQuery}&` : ""}ids=${ids}`
  }, [count, folderQuery, page.files, selected])

  function toggle(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Always shown, not only once something is ticked: a bar that appears
          out of nowhere is a bar nobody knew was there to find. */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-2.5 py-2">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={all}
            indeterminate={count > 0 && !all}
            onCheckedChange={(checked) =>
              setSelected(
                checked ? new Set(page.files.map((file) => file.id)) : EMPTY
              )
            }
            aria-label="Select every report on this page"
          />
          <span className="tabular-nums">
            {count > 0
              ? `${count} selected`
              : `Select all ${page.files.length} on this page`}
          </span>
        </label>

        <div className="flex items-center gap-1.5">
          {count > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setSelected(EMPTY)}>
              Clear
            </Button>
          )}
          {/* A disabled anchor still follows its href, so with nothing ticked
              there is no anchor to follow. */}
          {href ? (
            <Button size="sm" render={<a href={href} />}>
              <Download />
              Download {count} as ZIP
            </Button>
          ) : (
            <Button size="sm" disabled>
              <Download />
              Download ZIP
            </Button>
          )}
        </div>
      </div>

      {/* Column headings, desktop only — they name what the two right-hand
          columns are, and below `sm` those columns aren't there to name. */}
      <div className="hidden items-center gap-2 border-b pb-1.5 pl-1 text-[11px] tracking-wide text-muted-foreground uppercase sm:flex">
        <span className="size-4 shrink-0" />
        <span className="flex min-w-0 flex-1 items-center gap-3 pr-2 pl-1">
          <span className="w-4 shrink-0" />
          <span className="min-w-0 flex-1">Name</span>
          <span className="w-40 shrink-0">Filed by</span>
          <span className="w-28 shrink-0">Serviced</span>
          <span className="w-4 shrink-0" />
        </span>
      </div>

      <ul className="divide-y">
        {page.files.map((file) => (
          <li key={file.id} className="flex min-w-0 items-center gap-2 pl-1">
            <Checkbox
              checked={selected.has(file.id)}
              onCheckedChange={(checked) => toggle(file.id, !!checked)}
              aria-label={`Select ${file.fileName}`}
            />
            <ReportFileRow file={file} showLocation={showLocation} />
          </li>
        ))}
      </ul>

      <Pager
        page={page.page}
        pages={page.pages}
        total={page.total}
        noun="reports"
        pageSize={filesPerPage}
        prevHref={prevHref}
        nextHref={nextHref}
      />
    </div>
  )
}
