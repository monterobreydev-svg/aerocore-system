"use client"

import { useEffect, useState } from "react"
import { FileText, History, ReceiptText, Trash2 } from "lucide-react"
import {
  deleteCompanyExpense,
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
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
  // Not used by the sentence below — these two are rendered as events — but
  // kept so an old row still reads as something if the wording ever changes.
  expenseAdded: "a recorded expense",
  expenseRemoved: "a recorded expense",
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
 * The history tab: who changed what, since the project was booked.
 *
 * Fetched the first time the tab is opened and kept for as long as the record
 * is — switching back and forth costs nothing, and an edit closes the dialog
 * anyway, so there is no staler view to worry about.
 */
function ProjectHistory({
  entries,
}: {
  entries: ProjectHistoryEntry[] | null
}) {
  return (
    <div className="rounded-xl border p-3">
      <div>
        {entries === null ? (
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <Spinner className="size-3.5" />
            Loading…
          </span>
        ) : entries.length > 0 ? (
          <div className="flex flex-col gap-3">
            {entries.map((entry) => (
              <div key={entry.id} className="flex gap-2.5 text-sm">
                <span
                  className={cn(
                    "mt-1.5 size-1.5 shrink-0 rounded-full",
                    entry.field === "expenseAdded"
                      ? "bg-rose-500"
                      : entry.field === "expenseRemoved"
                        ? "bg-emerald-500"
                        : "bg-sky-500"
                  )}
                />
                <div className="min-w-0">
                  {/* An expense is an event, not a field that moved from one
                      value to another — "changed the expense from — to Parts"
                      is not a sentence anybody should have to decode. */}
                  {entry.field === "expenseAdded" ||
                  entry.field === "expenseRemoved" ? (
                    <p>
                      <span className="font-medium">{entry.editedByName}</span>{" "}
                      {entry.field === "expenseAdded" ? "recorded" : "removed"}{" "}
                      an expense{" "}
                      <Badge variant="outline">
                        {historyValue(
                          entry.field === "expenseAdded"
                            ? entry.newValue
                            : entry.oldValue
                        )}
                      </Badge>
                    </p>
                  ) : (
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
                  )}
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
      </div>
    </div>
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
  costs,
  onRemoved,
}: {
  salesOrderNo: string
  cogs: number
  costs: ProjectCosts | null
  onRemoved: () => void
}) {
  // Which office row is being taken out. A liquidation line has none of this:
  // it belongs to an employee's claim, with a review behind it.
  const [confirming, setConfirming] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)

  async function remove(id: string) {
    setRemoving(id)
    await deleteCompanyExpense(id)
    setConfirming(null)
    setRemoving(null)
    onRemoved()
  }

  // Who spent it, in order of how much — the second question after "how much".
  const byPerson = costs
    ? [...costs.lines.filter((line) => line.approved)]
        .reduce<{ name: string; amount: number }[]>((people, line) => {
          const found = people.find((person) => person.name === line.employeeName)
          if (found) found.amount += line.amount
          else people.push({ name: line.employeeName, amount: line.amount })
          return people
        }, [])
        .sort((a, b) => b.amount - a.amount)
    : []

  return (
    <section className="overflow-hidden rounded-xl border">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b bg-muted/40 px-3 py-2.5">
        <div>
          <p className="text-sm leading-tight font-medium">
            What made up this COGS
          </p>
          <p className="text-[11px] text-muted-foreground">
            Liquidated by the crew or paid directly, against {salesOrderNo}
          </p>
        </div>
        <p className="text-base font-semibold tabular-nums">
          {pesoAmount(cogs)}
        </p>
      </header>

      {costs === null ? (
        <p className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
          <Spinner className="size-3.5" />
          Loading the expenses…
        </p>
      ) : costs.lines.length === 0 ? (
        <p className="px-3 py-4 text-xs text-muted-foreground">
          Nothing has been liquidated against this job yet. COGS fills in as the
          crew files expenses against this S.O. number.
        </p>
      ) : (
        <>
          {/* Who it came from, before the line-by-line — on a job with twenty
              receipts this is the summary somebody actually wants. */}
          {byPerson.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 border-b px-3 py-2">
              {byPerson.map((person) => (
                <span
                  key={person.name}
                  className="text-xs text-muted-foreground"
                >
                  {person.name}{" "}
                  <span className="font-medium text-foreground tabular-nums">
                    {amount(person.amount)}
                  </span>
                </span>
              ))}
            </div>
          )}

          <div>
            <table className="w-full text-[0.8125rem]">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b text-[0.625rem] tracking-wide text-muted-foreground uppercase">
                  <th scope="col" className="px-3 py-1.5 text-left font-semibold">
                    Date
                  </th>
                  <th scope="col" className="px-3 py-1.5 text-left font-semibold">
                    Expense
                  </th>
                  <th scope="col" className="px-3 py-1.5 text-left font-semibold">
                    From
                  </th>
                  <th scope="col" className="px-3 py-1.5 text-right font-semibold">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {costs.lines.map((line) => (
                  <tr
                    key={line.id}
                    className={cn(
                      "border-b last:border-b-0",
                      // Still in the queue: shown, because it is coming, but
                      // dimmed because it is not in the figure above.
                      !line.approved && "text-muted-foreground"
                    )}
                  >
                    <td className="px-3 py-1.5 whitespace-nowrap tabular-nums">
                      {dayLabel(line.spentOn)}
                    </td>
                    <td className="max-w-52 px-3 py-1.5">
                      <span className="block truncate" title={line.description}>
                        {line.description}
                      </span>
                      <span className="block truncate text-[10px] text-muted-foreground">
                        <span
                          className={cn(
                            line.source === "liquidation" && "font-mono"
                          )}
                        >
                          {line.referenceNo}
                        </span>
                        {line.source === "office" && " · paid directly"}
                        {line.source === "labour" &&
                          " · scheduled hours on this job"}
                        {!line.approved && " · awaiting review"}
                      </span>
                    </td>
                    <td className="max-w-36 px-3 py-1.5">
                      <span className="block truncate" title={line.employeeName}>
                        {line.employeeName}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right whitespace-nowrap tabular-nums">
                      {amount(line.amount)}
                    </td>
                    <td className="px-2 py-1.5">
                      {line.source === "office" && (
                        <button
                          type="button"
                          aria-label={`Remove ${line.description}`}
                          title="Remove this expense"
                          onClick={() => setConfirming(line.id)}
                          disabled={removing != null}
                          className="rounded p-0.5 text-muted-foreground outline-none hover:bg-muted hover:text-destructive disabled:opacity-40"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {confirming && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-destructive/10 px-3 py-2 text-xs">
              <span className="text-destructive">
                Remove this expense? It comes straight off this job&apos;s COGS.
                Re-record it if it was only mistyped.
              </span>
              <span className="flex gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  size="xs"
                  onClick={() => remove(confirming)}
                  disabled={removing != null}
                >
                  {removing ? "Removing…" : "Yes, remove"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => setConfirming(null)}
                  disabled={removing != null}
                >
                  Keep
                </Button>
              </span>
            </div>
          )}

          {costs.truncated && (
            <p className="border-t px-3 py-2 text-xs text-muted-foreground">
              Only the most recent {costs.lines.length}{" "}
              are listed. The COGS figure above is the job&apos;s full approved
              total.
            </p>
          )}

          {costs.pending > 0 && (
            <p className="border-t bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              {/* {" "} rather than a plain space: JSX trims each line of a
                  text node, so the space between an expression and the words
                  that follow it on a wrapped line is eaten — "₱640.00more". */}
              {pesoAmount(costs.pending)}{" "}
              more is filed against this job but not yet approved, so it
              isn&apos;t in the figure above.
            </p>
          )}
        </>
      )}
    </section>
  )
}

/**
 * The overview tab.
 *
* The record at a glance: what the job is, what was entered, what follows from
 * it. The two long lists — the expenses behind the COGS and the edit history —
 * live in their own tabs.
 */
function ProjectOverview({ project }: { project: ProjectRow }) {
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

    </div>
  )
}

/**
 * A project, read-only.
 *
 * Three tabs rather than one long scroll. The record itself is a screenful;
 * the expenses behind the COGS and the edit history are both lists that grow
 * without limit, and a job with sixty receipts on it would otherwise bury the
 * terms and the dates nobody scrolled past them to find.
 *
 * Tabs are cheaper, not dearer: each list is fetched the first time its tab is
 * opened and not before, so reading a record costs one request instead of
 * three — and reading only the overview costs none at all.
 */
export function ProjectDetails({ project }: { project: ProjectRow }) {
  const [tab, setTab] = useState<string>("overview")

  // Both lists are held HERE rather than inside the tab that renders them.
  // Base UI unmounts a hidden panel, so state kept in one dies the moment you
  // look at another — and the tab would re-fetch every time you came back to
  // it. The parent survives, so each list is fetched once per record opened.
  const [costs, setCosts] = useState<ProjectCosts | null>(null)
  const [entries, setEntries] = useState<ProjectHistoryEntry[] | null>(null)

  const { salesOrderNo, id } = project

  useEffect(() => {
    if (tab !== "expenses" || costs) return

    let cancelled = false
    listProjectCosts(salesOrderNo).then((result) => {
      if (!cancelled) setCosts(result)
    })
    return () => {
      cancelled = true
    }
  }, [tab, costs, salesOrderNo])

  useEffect(() => {
    if (tab !== "history" || entries) return

    let cancelled = false
    listProjectHistory(id).then((rows) => {
      if (!cancelled) setEntries(rows)
    })
    return () => {
      cancelled = true
    }
  }, [tab, entries, id])

  return (
    <div className="flex flex-col gap-4">
      {/* The identity stays above the tabs: which project you are looking at
          is not one view among three. */}
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

      <Tabs value={tab} onValueChange={(value) => setTab(value as string)}>
        <TabsList
          variant="line"
          className="w-full min-w-0 justify-start overflow-x-auto border-b"
        >
          <TabsTrigger value="overview" className="flex-none gap-1.5 px-3">
            <FileText className="size-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="expenses" className="flex-none gap-1.5 px-3">
            <ReceiptText className="size-4" />
            Expenses
            {/* The amount, not a count: it is already known from the ledger
                row, so the tab can say what is behind it without fetching
                anything to find out. */}
            {project.cogs > 0 && (
              <span className="ml-1 rounded-full bg-muted px-1.5 text-xs tabular-nums">
                {amount(project.cogs)}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="flex-none gap-1.5 px-3">
            <History className="size-4" />
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="pt-4">
          <ProjectOverview project={project} />
        </TabsContent>

        <TabsContent value="expenses" className="pt-4">
          {/* The panel renders empty until its data arrives; the effect
              above is what makes the fetch happen on first open and not
              before. */}
          <ProjectCostBreakdown
            salesOrderNo={project.salesOrderNo}
            cogs={project.cogs}
            costs={costs}
            // Drop the cache and let the effect above fetch it again — the
            // figure in the ledger behind this dialog is revalidated by the
            // action itself.
            onRemoved={() => setCosts(null)}
          />
        </TabsContent>

        <TabsContent value="history" className="pt-4">
          <ProjectHistory entries={entries} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
