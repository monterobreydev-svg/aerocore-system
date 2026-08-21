"use client"

import { useState } from "react"
import { ChevronDown, History, ReceiptText } from "lucide-react"
import {
  listProjectCosts,
  listProjectHistory,
  type ProjectCosts,
  type ProjectHistoryEntry,
} from "@/app/actions/projects"
import {
  amount,
  MONEY_COLUMNS,
  PAYMENT_TERMS_LABELS,
  pesoAmount,
  PROJECT_STATUS_CHIP,
  PROJECT_STATUS_LABELS,
  type ProjectRow,
} from "@/lib/projects"
import { formatDateTime } from "@/lib/format-date"
import { formatScheduleDate } from "@/lib/schedule"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Spinner } from "@/components/ui/spinner"

// The words for each logged field. The log stores the key, so the wording can
// change without rewriting rows that were already written.
const FIELD_LABELS: Record<string, string> = {
  name: "the project name",
  client: "the client",
  status: "the status",
  startDate: "the start date",
  endDate: "the end date",
  siNo: "the S.I. number",
  terms: "the terms of payment",
  projectAmount: "the project amount",
  cogs: "the COGS",
  cashCollection: "the cash collection",
  accrualRevenue: "the accrual revenue",
}

/** An empty side of a change reads as a dash, not as nothing at all. */
function historyValue(value: string | null) {
  return value && value.trim() !== "" ? value : "—"
}

function dayLabel(value: string) {
  return formatScheduleDate(`${value}T00:00:00`)
}

/** One label-and-value line of the summary. */
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right text-sm">{value}</span>
    </div>
  )
}

/**
 * Who changed what, since the project was booked.
 *
 * Fetched when the panel is opened rather than with the ledger, and re-read on
 * each open rather than cached — an edit made two taps ago should be in it.
 */
function ProjectHistory({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<ProjectHistoryEntry[] | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) return

    setLoading(true)
    try {
      setEntries(await listProjectHistory(projectId))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Collapsible
      open={open}
      onOpenChange={handleOpenChange}
      className="group/history rounded-xl border p-3"
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between text-sm font-medium outline-none">
        <span className="flex items-center gap-2.5">
          <History className="size-4 text-muted-foreground" />
          Edit history
        </span>
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[panel-open]/history:rotate-180" />
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-3">
        {loading && entries === null ? (
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <Spinner className="size-3.5" />
            Loading…
          </span>
        ) : entries && entries.length > 0 ? (
          <div className="flex max-h-64 flex-col gap-3 overflow-y-auto pr-1">
            {entries.map((entry) => (
              <div key={entry.id} className="flex gap-2.5 text-sm">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-sky-500" />
                <div className="min-w-0">
                  <p>
                    <span className="font-medium">{entry.editedByName}</span>{" "}
                    changed{" "}
                    <span className="font-medium">
                      {FIELD_LABELS[entry.field] ?? entry.field}
                    </span>{" "}
                    from{" "}
                    <Badge variant="outline">
                      {historyValue(entry.oldValue)}
                    </Badge>{" "}
                    to{" "}
                    <Badge variant="outline">
                      {historyValue(entry.newValue)}
                    </Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(entry.createdAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Nothing has been changed since this project was added.
          </p>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

/**
 * What the COGS is made of.
 *
 * The ledger shows one number; this is every expense behind it, so "why did
 * this job cost that" is answerable without leaving the record. Fetched when
 * the panel is opened, like the history — a long job's expenses grow forever
 * and have no business riding along with the ledger.
 *
 * Anything still in the review queue is listed but kept out of the total, and
 * said so out loud: an approver seeing a figure that includes claims they
 * haven't decided yet would be reading a number that is about to change.
 */
function ProjectCostBreakdown({
  salesOrderNo,
  cogs,
}: {
  salesOrderNo: string
  cogs: number
}) {
  const [open, setOpen] = useState(false)
  const [costs, setCosts] = useState<ProjectCosts | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) return

    setLoading(true)
    try {
      setCosts(await listProjectCosts(salesOrderNo))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Collapsible
      open={open}
      onOpenChange={handleOpenChange}
      className="group/costs rounded-xl border p-3"
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 text-sm font-medium outline-none">
        <span className="flex items-center gap-2.5">
          <ReceiptText className="size-4 text-muted-foreground" />
          What it cost
        </span>
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold tabular-nums">
            {pesoAmount(cogs)}
          </span>
          <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[panel-open]/costs:rotate-180" />
        </span>
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-3">
        {loading && costs === null ? (
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <Spinner className="size-3.5" />
            Loading…
          </span>
        ) : costs && costs.lines.length > 0 ? (
          <div className="flex flex-col gap-2">
            <div className="flex max-h-56 flex-col divide-y overflow-y-auto pr-1">
              {costs.lines.map((line) => (
                <div
                  key={line.id}
                  className={cn(
                    "flex items-baseline justify-between gap-3 py-1.5",
                    !line.approved && "opacity-60"
                  )}
                >
                  <span className="min-w-0">
                    <span className="text-sm">{line.description}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {dayLabel(line.spentOn)} · {line.employeeName} ·{" "}
                      {line.referenceNo}
                      {!line.approved && " · awaiting review"}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm tabular-nums">
                    {amount(line.amount)}
                  </span>
                </div>
              ))}
            </div>

            {costs.pending > 0 && (
              <p className="rounded-lg bg-amber-500/10 px-2.5 py-2 text-xs text-amber-700 dark:text-amber-400">
                {pesoAmount(costs.pending)} more is filed against this job but
                not yet approved, so it isn&apos;t in the COGS above.
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Nothing has been liquidated against {salesOrderNo} yet. COGS fills
            in as the crew files expenses against this S.O. number.
          </p>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

/**
 * A project, read-only.
 *
 * Opening a row should answer "what is this" before offering to change it —
 * the same way a schedule opens. It also makes Edit and Delete deliberate
 * actions rather than something you fall into by tapping the wrong row.
 */
export function ProjectDetails({ project }: { project: ProjectRow }) {
  const typed = MONEY_COLUMNS.filter((column) => !column.derived)
  // COGS is derived too, but it has a panel of its own further down that shows
  // the receipts behind it — printing the same figure twice on one screen only
  // invites the question of which one is right.
  const derived = MONEY_COLUMNS.filter(
    (column) => column.derived && column.key !== "cogs"
  )

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base leading-tight font-semibold">
            {project.name}
          </h3>
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
              PROJECT_STATUS_CHIP[project.status]
            )}
          >
            {PROJECT_STATUS_LABELS[project.status]}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {project.clientName}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl border p-3">
          <p className="text-[0.6875rem] font-medium tracking-wide text-muted-foreground uppercase">
            The job
          </p>
          <div className="mt-1 flex flex-col divide-y">
            <Row label="Starts" value={dayLabel(project.startDate)} />
            <Row
              label="Ends"
              value={
                project.endDate ? (
                  dayLabel(project.endDate)
                ) : (
                  <span className="text-muted-foreground">Open-ended</span>
                )
              }
            />
            <Row label="Terms" value={PAYMENT_TERMS_LABELS[project.terms]} />
            <Row
              label="S.I. No."
              value={
                project.siNo ?? (
                  <span className="text-muted-foreground">Not invoiced</span>
                )
              }
            />
          </div>
        </section>

        <section className="rounded-xl border p-3">
          <p className="text-[0.6875rem] font-medium tracking-wide text-muted-foreground uppercase">
            As entered
          </p>
          <div className="mt-1 flex flex-col divide-y">
            {typed.map((column) => (
              <Row
                key={column.key}
                label={column.label}
                value={
                  <span className="tabular-nums">
                    {pesoAmount(project[column.key])}
                  </span>
                }
              />
            ))}
          </div>
        </section>
      </div>

      {/* The derived half, laid out as figures rather than a form — there is
          nothing to edit here, on this screen or any other. */}
      <section className="rounded-xl border bg-muted/30 p-3">
        <p className="text-[0.6875rem] font-medium tracking-wide text-muted-foreground uppercase">
          Worked out from those
        </p>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-5">
          {derived.map((column) => (
            <div key={column.key}>
              <p
                className={cn(
                  "text-sm leading-none font-semibold tabular-nums",
                  column.key === "grossProfit" &&
                    (project.grossProfit < 0
                      ? "text-rose-700 dark:text-rose-400"
                      : "text-emerald-700 dark:text-emerald-400")
                )}
              >
                {amount(project[column.key])}
              </p>
              <p className="mt-1 truncate text-[0.625rem] tracking-wide text-muted-foreground uppercase">
                {column.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      <ProjectCostBreakdown
        salesOrderNo={project.salesOrderNo}
        cogs={project.cogs}
      />

      <ProjectHistory projectId={project.id} />
    </div>
  )
}
