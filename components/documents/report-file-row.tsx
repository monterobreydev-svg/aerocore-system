"use client"

import { useState } from "react"
import { Download, FileText, Loader2 } from "lucide-react"
import { getReportFileUrl } from "@/app/actions/documents"
import { MONTH_NAMES, REPORT_TYPE_FOLDER } from "@/lib/documents"
import type { ReportFile } from "@/lib/documents"

function serviceDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

/**
 * One filed report, as a row rather than a card.
 *
 * A card per file turns twenty reports into a page you scroll; a row turns them
 * into a list you scan, which is what this screen is for. The columns fold away
 * below `sm` so a phone gets the name and the date and nothing it can't read.
 *
 * The download link is fetched on the click, never rendered with the page — a
 * presigned URL for every row would expire before half of them were used, and
 * signing twenty of them to show a list is work nobody asked for.
 */
export function ReportFileRow({
  file,
  showLocation,
}: {
  file: ReportFile
  /** Search results come from everywhere, so they have to say where from. */
  showLocation?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const { location } = file

  const folderPath = [
    location.year,
    REPORT_TYPE_FOLDER[location.type],
    location.clientName,
    ...(location.branchName ? [location.branchName] : []),
    MONTH_NAMES[location.month],
  ].join(" / ")

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          const url = await getReportFileUrl(file.id)
          if (url) window.open(url, "_blank", "noopener,noreferrer")
        } finally {
          setBusy(false)
        }
      }}
      className="group flex w-full min-w-0 items-center gap-3 py-2 pr-2 pl-1 text-left outline-none transition-colors hover:bg-muted/50 disabled:opacity-60"
    >
      {busy ? (
        <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
      ) : (
        <FileText className="size-4 shrink-0 text-rose-600 dark:text-rose-400" />
      )}

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{file.fileName}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {showLocation ? folderPath : `Serial ${file.serialNo}`}
        </span>
      </span>

      <span className="hidden w-40 shrink-0 truncate text-xs text-muted-foreground sm:block">
        {file.filedBy}
      </span>
      <span className="hidden w-28 shrink-0 text-xs whitespace-nowrap text-muted-foreground sm:block">
        {serviceDate(file.servicedOn)}
      </span>

      <Download className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  )
}
