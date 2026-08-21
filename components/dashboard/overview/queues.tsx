import Link from "next/link"
import { FileText, Receipt } from "lucide-react"

import type { Overview } from "@/lib/dashboard"
import { cn } from "@/lib/utils"
import { Panel, PanelHead } from "@/components/dashboard/overview/parts"
import { pesos } from "@/components/dashboard/overview/payroll"

// ---------------------------------------------------------------------------
// The queues
// ---------------------------------------------------------------------------
//
// Two lists of things other people have handed in: claims waiting on a decision
// and reports filed against a client.
//
// Both send their top few rows and the count of the whole queue, so neither
// panel grows with the size of the company — see QUEUE_PREVIEW in
// lib/dashboard. The figure at the top is the queue; the rows under it are just
// enough to recognise what is in it without opening the page.

/** One handed-in thing: what it is, who it came from, how long it has sat. */
function Row({
  href,
  primary,
  secondary,
  trailing,
  urgent,
}: {
  href: string
  primary: string
  secondary: string
  trailing: string
  urgent?: boolean
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-baseline justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-muted/60 sm:px-5"
      >
        <span className="min-w-0">
          <span className="block truncate text-[0.8125rem]">{primary}</span>
          <span className="block truncate text-[0.6875rem] text-muted-foreground tabular-nums">
            {secondary}
          </span>
        </span>
        <span
          className={cn(
            "shrink-0 text-[0.6875rem] tabular-nums",
            urgent
              ? "font-medium text-amber-600 dark:text-amber-400"
              : "text-muted-foreground"
          )}
        >
          {trailing}
        </span>
      </Link>
    </li>
  )
}

/** The count and its unit, sitting on the panel's own hairline. */
function Total({
  value,
  unit,
  aside,
}: {
  value: number
  unit: string
  aside?: React.ReactNode
}) {
  return (
    <div className="flex items-baseline gap-2 px-4 pt-4 pb-3 sm:px-5">
      <span className="text-2xl leading-none font-semibold tracking-tight tabular-nums">
        {value}
      </span>
      <span className="min-w-0 truncate text-xs text-muted-foreground tabular-nums">
        {unit}
      </span>
      {aside && <span className="ml-auto shrink-0">{aside}</span>}
    </div>
  )
}

export function Claims({ claims }: { claims: NonNullable<Overview["claims"]> }) {
  return (
    <Panel>
      <PanelHead
        icon={Receipt}
        title="Claims waiting"
        meta={
          claims.waiting === 0
            ? "Nothing in the queue"
            : `${pesos(claims.amount)} across the queue`
        }
        href="/admin/reimbursements"
        action="Review"
      />

      <Total
        value={claims.waiting}
        unit={`claim${claims.waiting === 1 ? "" : "s"} awaiting review`}
        aside={
          claims.oldestDays !== null && claims.oldestDays >= 3 ? (
            <span className="rounded-full bg-amber-500/12 px-2 py-0.5 text-[0.625rem] font-medium text-amber-700 tabular-nums dark:text-amber-400">
              oldest {claims.oldestDays}d
            </span>
          ) : undefined
        }
      />

      {claims.rows.length > 0 && (
        <ul className="divide-y border-t">
          {claims.rows.map((row) => (
            <Row
              key={row.id}
              href="/admin/reimbursements"
              primary={row.employeeName}
              secondary={`${row.referenceNo} · ${pesos(row.amount)}${row.late ? " · filed late" : ""}`}
              trailing={row.waitingDays === 0 ? "today" : `${row.waitingDays}d`}
              urgent={row.waitingDays >= 3}
            />
          ))}
        </ul>
      )}
    </Panel>
  )
}

export function Documents({
  documents,
}: {
  documents: Overview["documents"]
}) {
  return (
    <Panel>
      <PanelHead
        icon={FileText}
        title="Filed reports"
        meta={`${documents.week} in the last seven days`}
        href="/admin/documents"
        action="All filings"
      />

      <Total value={documents.today} unit="filed today" />

      {documents.rows.length > 0 && (
        <ul className="divide-y border-t">
          {documents.rows.map((row) => (
            <Row
              key={row.id}
              href="/admin/documents"
              primary={row.clientName}
              secondary={`${row.type} · ${row.serialNo}`}
              trailing={new Date(row.filedAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            />
          ))}
        </ul>
      )}
    </Panel>
  )
}
