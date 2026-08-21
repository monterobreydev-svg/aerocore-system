"use client"

import { useActionState, useEffect, useState } from "react"
import { Building2, Copy, Plus, ReceiptText, Trash2, Users } from "lucide-react"
import {
  listClientProjects,
  recordCompanyExpenses,
  type ClientProjectOption,
  type ExpenseBatchState,
} from "@/app/actions/projects"
import { amount, pesoAmount } from "@/lib/projects"
import { todayKey } from "@/lib/schedule"
import { cn } from "@/lib/utils"
import type { ClientOption } from "@/components/projects/projects-view"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SearchSelect } from "@/components/ui/search-select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type Kind = "OPEX" | "COGS"

type Line = {
  uid: string
  kind: Kind
  spentOn: string
  description: string
  amount: string
  clientId: string
  salesOrderNo: string
}

/** A client with nothing booked keeps a stable empty list between renders. */
const NO_PROJECTS: ClientProjectOption[] = []

// One set of widths for the header and every row. A batch is read down its
// columns — twenty amounts in a ragged right edge is the thing that made the
// old card-per-row layout hard to check.
const COLUMNS = [
  { key: "kind", label: "", width: 116 },
  { key: "date", label: "Date", width: 136 },
  { key: "description", label: "What it was for", width: 260 },
  { key: "charged", label: "Charged to", width: 280 },
  { key: "amount", label: "Amount", width: 124 },
  { key: "actions", label: "", width: 68 },
] as const

const TABLE_WIDTH = COLUMNS.reduce((sum, column) => sum + column.width, 0)

function blankLine(kind: Kind = "OPEX"): Line {
  return {
    uid: crypto.randomUUID(),
    kind,
    spentOn: todayKey(),
    description: "",
    amount: "",
    clientId: "",
    salesOrderNo: "",
  }
}

function toNumber(value: string) {
  const parsed = Number(value.replace(/[₱,\s]/g, ""))
  return Number.isFinite(parsed) ? parsed : 0
}

/** Is this row complete enough to send? The server checks again regardless. */
function isReady(line: Line) {
  if (!line.spentOn || !line.description.trim() || toNumber(line.amount) <= 0) {
    return false
  }
  return line.kind === "OPEX" || Boolean(line.clientId && line.salesOrderNo)
}

/** Blank rows are scaffolding, not mistakes — only a half-filled one is. */
function isBlank(line: Line) {
  return (
    !line.description.trim() &&
    toNumber(line.amount) === 0 &&
    !line.clientId &&
    !line.salesOrderNo
  )
}

/**
 * OPEX or COGS, as two buttons rather than a dropdown.
 *
 * There are exactly two answers, the choice changes what the rest of the row
 * asks for, and in a list of twenty rows it is the thing the eye sorts by — so
 * it is always visible and always in the same place, never behind a click.
 */
function KindToggle({
  kind,
  disabled,
  onChange,
}: {
  kind: Kind
  disabled: boolean
  onChange: (kind: Kind) => void
}) {
  return (
    <div className="flex rounded-lg border p-0.5">
      {(["OPEX", "COGS"] as const).map((option) => (
        <button
          key={option}
          type="button"
          disabled={disabled}
          onClick={() => onChange(option)}
          className={cn(
            "inline-flex flex-1 items-center justify-center gap-1 rounded-md px-1.5 py-1 text-[0.6875rem] font-medium transition-colors",
            kind === option
              ? option === "OPEX"
                ? "bg-sky-600/10 text-sky-700 dark:text-sky-400"
                : "bg-violet-600/10 text-violet-700 dark:text-violet-400"
              : "text-muted-foreground hover:bg-muted"
          )}
        >
          {option === "OPEX" ? (
            <Users className="size-3" />
          ) : (
            <Building2 className="size-3" />
          )}
          {option}
        </button>
      ))}
    </div>
  )
}

function ExpenseRow({
  line,
  index,
  clients,
  projects,
  error,
  disabled,
  onChange,
  onRemove,
  onDuplicate,
}: {
  line: Line
  index: number
  clients: ClientOption[]
  projects: ClientProjectOption[]
  error?: string
  disabled: boolean
  onChange: (patch: Partial<Line>) => void
  onRemove: () => void
  onDuplicate: () => void
}) {
  const cogs = line.kind === "COGS"

  return (
    <>
      <tr
        className={cn(
          "border-b align-top",
          // Striped, because the eye loses its place around row eight.
          index % 2 === 1 && "bg-muted/25",
          error && "bg-destructive/5"
        )}
      >
        <td className="p-1.5">
          <KindToggle
            kind={line.kind}
            disabled={disabled}
            onChange={(kind) =>
              onChange(
                kind === "OPEX"
                  ? { kind, clientId: "", salesOrderNo: "" }
                  : { kind }
              )
            }
          />
        </td>

        <td className="p-1.5">
          <Input
            type="date"
            aria-label={`Date for row ${index + 1}`}
            value={line.spentOn}
            onChange={(event) => onChange({ spentOn: event.target.value })}
            disabled={disabled}
            className="h-8 w-full"
          />
        </td>

        <td className="p-1.5">
          <Input
            aria-label={`What row ${index + 1} was for`}
            value={line.description}
            onChange={(event) => onChange({ description: event.target.value })}
            placeholder={
              cogs ? "Supplier invoice, permit…" : "Electricity, rent, supplies…"
            }
            disabled={disabled}
            maxLength={200}
            className="h-8 w-full"
          />
        </td>

        {/* The one cell whose contents depend on the kind. Overhead is charged
            to nobody, and says so rather than leaving a hole the eye reads as
            a field somebody forgot. */}
        <td className="p-1.5">
          {cogs ? (
            <div className="flex flex-col gap-1 [&_[data-slot=search-select-trigger]]:h-8">
              <SearchSelect
                options={clients.map((client) => ({
                  value: client.id,
                  label: client.name,
                }))}
                value={line.clientId}
                // Changing the client abandons the old client's sales order:
                // keeping it would submit a job belonging to somebody else,
                // which the server rejects anyway.
                onValueChange={(value) =>
                  onChange({ clientId: value, salesOrderNo: "" })
                }
                placeholder="Which client"
                searchPlaceholder="Search clients…"
                emptyMessage="No client by that name."
                disabled={disabled}
              />
              <SearchSelect
                options={projects.map((project) => ({
                  value: project.salesOrderNo,
                  label: project.salesOrderNo,
                  hint: project.name,
                }))}
                value={line.salesOrderNo}
                onValueChange={(value) => onChange({ salesOrderNo: value })}
                placeholder={
                  !line.clientId
                    ? "Pick a client first"
                    : projects.length === 0
                      ? "No projects for this client"
                      : "Which job"
                }
                searchPlaceholder="Search S.O. or project…"
                emptyMessage="No job matches that."
                disabled={disabled || !line.clientId || projects.length === 0}
              />
            </div>
          ) : (
            <p className="px-1 py-2 text-xs text-muted-foreground">
              Company overhead
            </p>
          )}
        </td>

        <td className="p-1.5">
          <Input
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            aria-label={`Amount for row ${index + 1}`}
            value={line.amount}
            onChange={(event) => onChange({ amount: event.target.value })}
            placeholder="0.00"
            disabled={disabled}
            className="h-8 w-full text-right tabular-nums"
          />
        </td>

        <td className="p-1.5">
          <div className="flex items-center justify-end gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`Duplicate row ${index + 1}`}
              title="Duplicate this row"
              onClick={onDuplicate}
              disabled={disabled}
            >
              <Copy />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`Remove row ${index + 1}`}
              onClick={onRemove}
              disabled={disabled}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 />
            </Button>
          </div>
        </td>
      </tr>

      {error && (
        <tr className="border-b bg-destructive/5">
          <td colSpan={COLUMNS.length} className="px-3 pb-2 text-xs text-destructive">
            {error}
          </td>
        </tr>
      )}
    </>
  )
}

/**
 * Record several expenses in one sitting.
 *
 * A table, not a stack of cards: the office enters these off a pile of
 * invoices, and a pile is checked by running down a column of amounts. Every
 * row keeps the same shape whether it is overhead or a job's cost, so the
 * columns stay straight however many rows are added.
 */
export function ExpensesDialog({
  clients,
  open,
  onOpenChange,
}: {
  clients: ClientOption[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [lines, setLines] = useState<Line[]>(() => [blankLine()])
  const [state, action, pending] = useActionState<ExpenseBatchState, FormData>(
    recordCompanyExpenses,
    undefined
  )

  // Each picked client's jobs, cached by client so a batch of rows against one
  // client asks once.
  const [projectCache, setProjectCache] = useState<
    Record<string, ClientProjectOption[]>
  >({})

  useEffect(() => {
    const missing = [
      ...new Set(
        lines
          .filter((line) => line.kind === "COGS" && line.clientId)
          .map((line) => line.clientId)
      ),
    ].filter((clientId) => !projectCache[clientId])
    if (missing.length === 0) return

    let cancelled = false
    for (const clientId of missing) {
      listClientProjects(clientId).then((rows) => {
        if (!cancelled) {
          setProjectCache((current) => ({ ...current, [clientId]: rows }))
        }
      })
    }
    return () => {
      cancelled = true
    }
  }, [lines, projectCache])

  useEffect(() => {
    if (state?.success) onOpenChange(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const ready = lines.filter(isReady)
  // Started but not finished — the rows that would be dropped silently on save
  // if nobody said anything.
  const incomplete = lines.filter((line) => !isReady(line) && !isBlank(line))

  const total = ready.reduce((sum, line) => sum + toNumber(line.amount), 0)
  const opexTotal = ready
    .filter((line) => line.kind === "OPEX")
    .reduce((sum, line) => sum + toNumber(line.amount), 0)

  function patch(uid: string, changes: Partial<Line>) {
    setLines((current) =>
      current.map((line) => (line.uid === uid ? { ...line, ...changes } : line))
    )
  }

  function addRow() {
    setLines((current) => [
      ...current,
      // The next row is usually the same kind as the last.
      blankLine(current[current.length - 1]?.kind ?? "OPEX"),
    ])
  }

  return (
    <Dialog
      open={open}
      // A batch half-typed is worth more than most dialogs' contents; a stray
      // press on the backdrop must not be what discards it.
      disablePointerDismissal
      onOpenChange={(next, details) => {
        if (
          !next &&
          (details.reason === "outside-press" || details.reason === "focus-out")
        ) {
          return
        }
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Record expenses</DialogTitle>
          <DialogDescription>
            Money the office paid directly. Overhead lands on its month&apos;s
            OPEX; a job&apos;s cost lands on that project&apos;s COGS.
          </DialogDescription>
        </DialogHeader>

        <form action={action} id="expenses-form">
          {/* The rows travel as JSON — the same way a liquidation's do. A
              variable-length list of mixed-shape rows in flat form fields is a
              set of parallel arrays waiting to fall out of step. */}
          <input
            type="hidden"
            name="lines"
            value={JSON.stringify(
              ready.map((line) => ({
                kind: line.kind,
                spentOn: line.spentOn,
                description: line.description.trim(),
                amount: line.amount,
                clientId: line.kind === "COGS" ? line.clientId : "",
                salesOrderNo: line.kind === "COGS" ? line.salesOrderNo : "",
              }))
            )}
          />
        </form>

        <div className="-mx-1 max-h-[54dvh] min-w-0 overflow-auto px-1">
          <table
            className="w-full border-collapse text-sm"
            style={{ minWidth: TABLE_WIDTH }}
          >
            <colgroup>
              {COLUMNS.map((column) => (
                <col key={column.key} style={{ width: column.width }} />
              ))}
            </colgroup>

            {/* Sticky, so the columns are still named at row twenty. */}
            <thead className="sticky top-0 z-1 bg-popover">
              <tr className="border-b text-[0.625rem] tracking-wide text-muted-foreground uppercase">
                {COLUMNS.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    className={cn(
                      "px-2 py-1.5 text-left font-semibold",
                      column.key === "amount" && "text-right"
                    )}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {lines.map((line, index) => (
                <ExpenseRow
                  key={line.uid}
                  line={line}
                  index={index}
                  clients={clients}
                  projects={projectCache[line.clientId] ?? NO_PROJECTS}
                  error={state?.rowErrors?.[ready.indexOf(line)]}
                  disabled={pending}
                  onChange={(changes) => patch(line.uid, changes)}
                  onRemove={() =>
                    setLines((current) =>
                      current.length === 1
                        ? [blankLine()]
                        : current.filter((row) => row.uid !== line.uid)
                    )
                  }
                  onDuplicate={() =>
                    setLines((current) => {
                      const copy = { ...line, uid: crypto.randomUUID() }
                      const at = current.findIndex((row) => row.uid === line.uid)
                      return [
                        ...current.slice(0, at + 1),
                        copy,
                        ...current.slice(at + 1),
                      ]
                    })
                  }
                />
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addRow}
            disabled={pending}
          >
            <Plus />
            Add row
          </Button>

          <span className="text-xs text-muted-foreground tabular-nums">
            {ready.length} of {lines.length} row
            {lines.length === 1 ? "" : "s"} ready
          </span>

          {/* Named rather than dropped quietly: a row somebody started and left
              half-finished is not saved, and finding that out afterwards means
              re-typing it. */}
          {incomplete.length > 0 && (
            <span className="text-xs text-amber-700 dark:text-amber-400">
              {incomplete.length} row{incomplete.length === 1 ? "" : "s"} still
              incomplete — {incomplete.length === 1 ? "it" : "they"}{" "}
              won&apos;t be saved
            </span>
          )}

          {state?.message && (
            <span className="text-xs text-destructive">{state.message}</span>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <div className="flex items-center gap-2 text-sm">
            <ReceiptText className="size-4 shrink-0 text-muted-foreground" />
            <span className="tabular-nums">
              <span className="font-semibold">{pesoAmount(total)}</span>
              {ready.length > 0 && (
                <span className="ml-2 text-xs text-muted-foreground">
                  {amount(opexTotal)} OPEX · {amount(total - opexTotal)} COGS
                </span>
              )}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="expenses-form"
              disabled={pending || ready.length === 0}
            >
              {pending
                ? "Saving…"
                : `Save ${ready.length || ""} expense${ready.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
