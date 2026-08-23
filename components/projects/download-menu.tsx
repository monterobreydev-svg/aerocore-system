"use client"

import { ChevronDown, Download, FileSpreadsheet, FileText } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/**
 * The two shapes the project book comes in.
 *
 * Both are built from one read on the server, so the document and the workbook
 * carry the same figures as each other and as the page they came from.
 *
 * The links carry whatever the tracker is currently filtered by — the same
 * parameter names the page reads — so what downloads is what is on screen. A
 * report that quietly widened past an applied filter would be filed as the
 * whole book and reconciled against nothing.
 *
 * Rendered as links rather than buttons: the browser navigates, the response
 * comes back as an attachment, and the file lands in its own downloads list.
 * No fetch, no blob, no spinner to get wrong.
 */
export function ProjectsDownloadMenu({
  year,
  from,
  to,
  clientId,
  query,
}: {
  year: number
  from: string
  to: string
  clientId: string
  query: string
}) {
  const params = new URLSearchParams({ year: String(year) })
  if (from) params.set("from", from)
  if (to) params.set("to", to)
  if (clientId) params.set("c", clientId)
  if (query) params.set("q", query)

  const href = (format: "pdf" | "xlsx") =>
    `/api/projects/download?format=${format}&${params.toString()}`

  const filtered = Boolean(from || to || clientId || query)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" className="h-9 shrink-0">
            <Download />
            <span className="hidden sm:inline">Download</span>
            <ChevronDown className="opacity-60" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-72">
        {/* The label is Base UI's Menu.GroupLabel, which reads its group from
            context — outside a Group it throws rather than rendering plain. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal text-muted-foreground">
            {filtered
              ? "Covers what this page is filtered to"
              : `Covers all of ${year}`}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          render={<a href={href("pdf")} target="_blank" rel="noopener" />}
        >
          <FileText />
          <span className="flex flex-col items-start gap-0.5 py-0.5">
            <span>Report</span>
            <span className="text-xs text-muted-foreground">
              PDF with charts, for reading and sending
            </span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem
          render={<a href={href("xlsx")} target="_blank" rel="noopener" />}
        >
          <FileSpreadsheet />
          <span className="flex flex-col items-start gap-0.5 py-0.5">
            <span>Workbook</span>
            <span className="text-xs text-muted-foreground">
              Projects and expenses, for accounting
            </span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
