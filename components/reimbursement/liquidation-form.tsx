"use client"

import { useActionState, useEffect, useState } from "react"
import {
  AlertTriangle,
  Building2,
  FileText,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react"
import {
  submitLiquidation,
  type LiquidationState,
} from "@/app/actions/reimbursements"
import {
  EXPENSE_PRESETS,
  LIQUIDATION_WINDOW_DAYS,
  isLateExpense,
  peso,
  splitAmount,
} from "@/lib/reimbursement"
import { dateKey } from "@/lib/schedule"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { SearchSelect } from "@/components/ui/search-select"
import { FileUpload, type UploadedFile } from "@/components/reimbursement/file-upload"
import type { ClientChoice } from "@/components/reimbursement/client-choice"

// A job this expense was for. Several are allowed: one tank of fuel can cover
// two client sites, and each site has its own S.O. number.
type ExpenseJob = {
  clientId: string
  clientName: string
  soNumber: string
}

type Expense = {
  uid: string
  description: string
  amount: number
  jobs: ExpenseJob[]
}

const NO_JOBS: ExpenseJob[] = []

// The list row under an expense: which jobs it was charged to, and — when it
// covered more than one — what each job took.
function JobLines({ expense }: { expense: Expense }) {
  if (expense.jobs.length === 0) {
    return <span className="text-muted-foreground">Not job-specific</span>
  }

  const shares = splitAmount(expense.amount, expense.jobs.length)

  return (
    <>
      {expense.jobs.map((job, index) => (
        <span key={job.clientId} className="flex flex-wrap gap-x-1.5">
          <span className="break-words">{job.clientName}</span>
          {expense.jobs.length > 1 && (
            <span className="tabular-nums">{peso(shares[index])}</span>
          )}
          {job.soNumber && (
            <span className="font-mono break-all">{job.soNumber}</span>
          )}
        </span>
      ))}
    </>
  )
}

// One expense at a time, one field per line. Mounted only while open, so it
// opens from `initial`/`defaultJobs` and needs no resetting.
function ExpenseSheet({
  clients,
  initial,
  defaultJobs,
  carriedOver,
  open,
  onOpenChange,
  onSave,
}: {
  clients: ClientChoice[]
  initial: Expense | null
  defaultJobs: ExpenseJob[]
  carriedOver: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (expense: Expense, addAnother: boolean) => void
}) {
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "")
  const [description, setDescription] = useState(initial?.description ?? "")
  // A new expense starts on the same job as the last one filed. Most days are
  // several expenses against one client, and picking it again each time was the
  // slowest part of filing.
  const [jobs, setJobs] = useState<ExpenseJob[]>(initial?.jobs ?? defaultJobs)

  const parsed = Number(amount)
  const valid =
    description.trim() !== "" && Number.isFinite(parsed) && parsed > 0

  const unpicked = clients.filter(
    (client) => !jobs.some((job) => job.clientId === client.id)
  )

  // Shown live while they add jobs, so the division is something they agreed to
  // rather than something they discover on the claim afterwards.
  const shares = valid ? splitAmount(parsed, jobs.length) : []

  function addJob(clientId: string) {
    const client = clients.find((c) => c.id === clientId)
    if (!client) return
    setJobs((current) =>
      current.some((job) => job.clientId === clientId)
        ? current
        : [...current, { clientId, clientName: client.name, soNumber: "" }]
    )
  }

  function save(addAnother: boolean) {
    if (!valid) return
    onSave(
      {
        uid: initial?.uid ?? crypto.randomUUID(),
        description: description.trim(),
        amount: parsed,
        jobs: jobs.map((job) => ({ ...job, soNumber: job.soNumber.trim() })),
      },
      addAnother
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[92dvh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-md">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground"
          >
            Cancel
          </Button>
          <DialogTitle className="text-sm">
            {initial ? "Edit expense" : "Add expense"}
          </DialogTitle>
          {/* Balances the Cancel button so the title stays centred. */}
          <span className="w-14" aria-hidden />
        </div>

        <DialogDescription className="sr-only">
          Enter one expense: how much, what for, and which job it was for.
        </DialogDescription>

        <div className="min-h-0 divide-y overflow-y-auto px-4">
          <Field className="py-3">
            <FieldLabel
              htmlFor="expense-amount"
              className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase"
            >
              Amount
            </FieldLabel>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg text-muted-foreground">₱</span>
              <Input
                id="expense-amount"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                autoFocus
                className="h-auto border-0 bg-transparent p-0 text-2xl font-semibold tabular-nums shadow-none focus-visible:ring-0 dark:bg-transparent"
              />
            </div>
          </Field>

          <div className="flex flex-col gap-2 py-3">
            <FieldLabel
              htmlFor="expense-description"
              className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase"
            >
              What was it for
            </FieldLabel>
            {/* The eight things field staff actually buy. One tap instead of
                typing the same word every day. */}
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
              {EXPENSE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setDescription(preset)}
                  className={cn(
                    "h-8 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    description.trim().toLowerCase() === preset.toLowerCase()
                      ? "border-sky-600 bg-sky-600/10 text-sky-700 dark:text-sky-400"
                      : "border-border hover:bg-muted"
                  )}
                >
                  {preset}
                </button>
              ))}
            </div>
            <Input
              id="expense-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Or type it — e.g. tricycle to site"
              className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
          </div>

          <div className="flex flex-col gap-2 py-3">
            <div className="flex items-baseline justify-between gap-2">
              <FieldLabel className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
                Which job
              </FieldLabel>
              {carriedOver && jobs.length > 0 && !initial && (
                <span className="text-[11px] text-sky-700 dark:text-sky-400">
                  Same as your last entry
                </span>
              )}
            </div>

            {jobs.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {jobs.map((job, index) => (
                  <div
                    key={job.clientId}
                    className="rounded-lg border bg-muted/30 p-2"
                  >
                    <div className="flex items-center gap-2">
                      <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {job.clientName}
                      </span>
                      {jobs.length > 1 && shares.length > 0 && (
                        <span className="shrink-0 text-xs font-medium tabular-nums">
                          {peso(shares[index])}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setJobs((current) =>
                            current.filter((j) => j.clientId !== job.clientId)
                          )
                        }
                        aria-label={`Remove ${job.clientName}`}
                        className="rounded p-0.5 text-muted-foreground outline-none hover:bg-muted hover:text-destructive"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                    <Input
                      value={job.soNumber}
                      onChange={(e) =>
                        setJobs((current) =>
                          current.map((j) =>
                            j.clientId === job.clientId
                              ? { ...j, soNumber: e.target.value }
                              : j
                          )
                        )
                      }
                      placeholder="S.O. number (optional)"
                      aria-label={`S.O. number for ${job.clientName}`}
                      className="mt-1 h-7 border-0 bg-transparent px-0 font-mono text-xs shadow-none focus-visible:ring-0 dark:bg-transparent"
                    />
                  </div>
                ))}
              </div>
            )}

            {unpicked.length > 0 && (
              <SearchSelect
                options={unpicked.map((client) => ({
                  value: client.id,
                  label: client.name,
                }))}
                value=""
                onValueChange={addJob}
                placeholder={
                  jobs.length === 0 ? "Pick a client" : "Add another client"
                }
                searchPlaceholder="Search clients…"
                emptyMessage="No client matches that."
              />
            )}

            <p className="text-[11px] leading-snug text-muted-foreground">
              {jobs.length > 1
                ? `Divided evenly between ${jobs.length} jobs${
                    shares.length > 0 ? ` — ${peso(shares[0])} each` : ""
                  }. The receipt total doesn't change.`
                : "Add a second client if one payment covered two sites — it gets divided between them. Leave empty if it isn't for a job."}
            </p>
          </div>
        </div>

        <div className="flex gap-2 border-t bg-muted/50 p-3">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="flex-1"
            disabled={!valid}
            onClick={() => save(true)}
          >
            <Plus />
            Save &amp; add another
          </Button>
          <Button
            type="button"
            size="lg"
            className="flex-1"
            disabled={!valid}
            onClick={() => save(false)}
          >
            {initial ? "Save changes" : "Add to list"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function LiquidationForm({
  clients,
  open,
  onOpenChange,
}: {
  clients: ClientChoice[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [state, action, pending] = useActionState<LiquidationState, FormData>(
    submitLiquidation,
    undefined
  )
  const today = dateKey(new Date())
  const [expenseDate, setExpenseDate] = useState(today)
  const [receipt, setReceipt] = useState<UploadedFile | null>(null)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [lateReason, setLateReason] = useState("")
  const [note, setNote] = useState("")

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)
  // Bumped to remount the sheet blank for the next expense without closing it.
  const [sheetSeq, setSheetSeq] = useState(0)

  // The form is mounted only while open, so a successful submit just closes it —
  // the next one starts fresh with no state to clear.
  useEffect(() => {
    if (state?.success) onOpenChange(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const total = expenses.reduce((sum, e) => sum + e.amount, 0)
  const late = Boolean(expenseDate) && isLateExpense(expenseDate)
  const blocked =
    !expenseDate ||
    expenses.length === 0 ||
    !receipt ||
    (late && !lateReason.trim())

  // Whatever the last expense was booked to, offered as the starting point for
  // the next one.
  const recentJobs = expenses.at(-1)?.jobs ?? NO_JOBS

  function upsert(expense: Expense) {
    setExpenses((current) =>
      current.some((e) => e.uid === expense.uid)
        ? current.map((e) => (e.uid === expense.uid ? expense : e))
        : [...current, expense]
    )
  }

  function handleSave(expense: Expense, addAnother: boolean) {
    upsert(expense)
    if (addAnother) {
      setEditing(null)
      setSheetSeq((n) => n + 1)
    } else {
      setSheetOpen(false)
    }
  }

  function openSheet(expense: Expense | null) {
    setEditing(expense)
    setSheetSeq((n) => n + 1)
    setSheetOpen(true)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[92dvh] flex-col gap-3 overflow-hidden sm:max-w-lg">
          <DialogHeader className="shrink-0">
            <DialogTitle>Today&apos;s liquidation</DialogTitle>
            <DialogDescription className="text-xs">
              One date, one PDF of the receipts, and a line for each thing you
              paid for.
            </DialogDescription>
          </DialogHeader>

          <form action={action} id="liquidation-form" className="contents">
            <input type="hidden" name="expenseDate" value={expenseDate} />
            <input type="hidden" name="receiptKey" value={receipt?.key ?? ""} />
            <input type="hidden" name="receiptName" value={receipt?.name ?? ""} />
            <input type="hidden" name="receiptType" value={receipt?.type ?? ""} />
            <input type="hidden" name="lateReason" value={lateReason} />
            <input type="hidden" name="note" value={note} />
            <input
              type="hidden"
              name="items"
              value={JSON.stringify(
                expenses.map((e) => ({
                  description: e.description,
                  amount: e.amount,
                  clients: e.jobs.map((job) => ({
                    clientId: job.clientId,
                    soNumber: job.soNumber || undefined,
                  })),
                }))
              )}
            />

            <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
              <div className="grid gap-3 rounded-xl border p-3 sm:grid-cols-2">
                <Field data-invalid={!!state?.errors?.expenseDate}>
                  <FieldLabel htmlFor="liquidation-date" className="text-xs">
                    Date of expenses
                  </FieldLabel>
                  <Input
                    id="liquidation-date"
                    type="date"
                    max={today}
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    disabled={pending}
                    required
                  />
                  <FieldError
                    errors={state?.errors?.expenseDate?.map((message) => ({
                      message,
                    }))}
                  />
                </Field>

                <Field data-invalid={!!state?.errors?.receipt}>
                  <FieldLabel className="text-xs">
                    Receipts <span className="text-destructive">*</span>
                  </FieldLabel>
                  <FileUpload
                    folder="receipts"
                    value={receipt}
                    onChange={setReceipt}
                    disabled={pending}
                    label="Attach one PDF"
                    accept="application/pdf"
                    // Names the stored file after the day being liquidated
                    // rather than the day it was uploaded.
                    context={{ expenseDate }}
                  />
                  {!receipt && (
                    <p className="flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
                      <FileText className="mt-px size-3 shrink-0" />
                      PDF only. Combine the day&apos;s receipts with any scanner
                      app before attaching.
                    </p>
                  )}
                  <FieldError
                    errors={state?.errors?.receipt?.map((message) => ({
                      message,
                    }))}
                  />
                </Field>
              </div>

              {late && (
                <div className="mt-3 flex flex-col gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
                  <p className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                      That date is more than {LIQUIDATION_WINDOW_DAYS} days ago.
                      Explain why it&apos;s late — an administrator decides
                      whether it&apos;s still reimbursed.
                    </span>
                  </p>
                  <Field data-invalid={!!state?.errors?.lateReason}>
                    <Textarea
                      value={lateReason}
                      onChange={(e) => setLateReason(e.target.value)}
                      rows={2}
                      maxLength={1000}
                      placeholder="e.g. Receipts were left in the service vehicle."
                      disabled={pending}
                      className="bg-background"
                    />
                    <FieldError
                      errors={state?.errors?.lateReason?.map((message) => ({
                        message,
                      }))}
                    />
                  </Field>
                </div>
              )}

              <div className="mt-3 flex items-center justify-between gap-2">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Today&apos;s list
                </p>
                <p className="text-xs text-muted-foreground">
                  {expenses.length} {expenses.length === 1 ? "entry" : "entries"}
                </p>
              </div>

              {expenses.length === 0 ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => openSheet(null)}
                  className="mt-1.5 flex w-full flex-col items-center gap-1 rounded-xl border border-dashed p-6 text-center outline-none hover:bg-muted/40 focus-visible:bg-muted/40"
                >
                  <Plus className="size-4 text-muted-foreground" />
                  <span className="text-xs font-medium">Add your first expense</span>
                  <span className="text-[11px] text-muted-foreground">
                    Amount, what it was for, and which job — about ten seconds
                    each.
                  </span>
                </button>
              ) : (
                <div className="mt-1.5 flex flex-col divide-y rounded-xl border px-3">
                  {expenses.map((expense) => (
                    <div key={expense.uid} className="flex items-start gap-2 py-2.5">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => openSheet(expense)}
                        className="min-w-0 flex-1 text-left outline-none"
                      >
                        <p className="truncate text-sm leading-tight">
                          {expense.description}
                        </p>
                        <span className="mt-0.5 flex min-w-0 flex-col text-xs text-muted-foreground">
                          <JobLines expense={expense} />
                        </span>
                      </button>
                      <span className="shrink-0 text-sm font-medium tabular-nums">
                        {peso(expense.amount)}
                      </span>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => openSheet(expense)}
                        aria-label={`Edit ${expense.description}`}
                        className="rounded p-1 text-muted-foreground outline-none hover:bg-muted"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          setExpenses((current) =>
                            current.filter((e) => e.uid !== expense.uid)
                          )
                        }
                        aria-label={`Remove ${expense.description}`}
                        className="rounded p-1 text-muted-foreground outline-none hover:bg-muted hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {expenses.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2 w-full"
                  disabled={pending}
                  onClick={() => openSheet(null)}
                >
                  <Plus />
                  Add another expense
                  {recentJobs.length > 0 && (
                    <span className="truncate text-xs font-normal text-muted-foreground">
                      · {recentJobs[0].clientName}
                      {recentJobs.length > 1 && ` +${recentJobs.length - 1}`}
                    </span>
                  )}
                </Button>
              )}

              <Field className="mt-3">
                <FieldLabel className="text-xs">Note (optional)</FieldLabel>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  maxLength={1000}
                  placeholder="Anything the office should know."
                  disabled={pending}
                />
              </Field>
            </div>
          </form>

          {state?.message && !state.success && (
            <p className="shrink-0 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {state.message}
            </p>
          )}

          <DialogFooter className="shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-baseline gap-2">
              <span className="text-xs text-muted-foreground">Total</span>
              <span className="text-lg font-semibold tabular-nums">
                {peso(total)}
              </span>
              {late && (
                <Badge className="bg-amber-600/10 text-amber-700 dark:text-amber-400">
                  Late
                </Badge>
              )}
            </div>
            <div className="flex w-full gap-2 sm:w-auto">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={pending}
                className="flex-1 sm:flex-none"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="liquidation-form"
                disabled={pending || blocked}
                className="flex-1 sm:flex-none"
              >
                {pending ? "Submitting…" : "Submit liquidation"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {sheetOpen && (
        <ExpenseSheet
          key={sheetSeq}
          clients={clients}
          initial={editing}
          defaultJobs={recentJobs}
          carriedOver={recentJobs.length > 0}
          open
          onOpenChange={setSheetOpen}
          onSave={handleSave}
        />
      )}
    </>
  )
}
