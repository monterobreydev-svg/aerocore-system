"use client"

import { useActionState, useEffect, useState } from "react"
import { AlertTriangle, Pencil, Plus, Trash2 } from "lucide-react"
import {
  submitLiquidation,
  type LiquidationState,
} from "@/app/actions/reimbursements"
import {
  LIQUIDATION_WINDOW_DAYS,
  isLateExpense,
  peso,
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

type Expense = {
  uid: string
  clientId: string
  clientName: string
  soNumber: string
  description: string
  amount: number
}

// One field per row, generous spacing — the previous grid crammed four inputs
// onto a phone line, which is where typos in peso amounts come from.
function ExpenseSheet({
  clients,
  initial,
  open,
  onOpenChange,
  onSave,
}: {
  clients: ClientChoice[]
  initial: Expense | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (expense: Expense) => void
}) {
  const [clientId, setClientId] = useState("")
  const [soNumber, setSoNumber] = useState("")
  const [description, setDescription] = useState("")
  const [amount, setAmount] = useState("")

  // Re-seed each time the sheet opens: blank for a new expense, or the row's
  // current values when editing one.
  useEffect(() => {
    if (!open) return
    setClientId(initial?.clientId ?? "")
    setSoNumber(initial?.soNumber ?? "")
    setDescription(initial?.description ?? "")
    setAmount(initial ? String(initial.amount) : "")
  }, [open, initial])

  const clientOptions = [
    { value: "", label: "Not client-specific", hint: "General expense" },
    ...clients.map((client) => ({ value: client.id, label: client.name })),
  ]

  const parsed = Number(amount)
  const valid = description.trim() !== "" && Number.isFinite(parsed) && parsed > 0

  function save() {
    if (!valid) return
    onSave({
      uid: initial?.uid ?? crypto.randomUUID(),
      clientId,
      clientName: clients.find((c) => c.id === clientId)?.name ?? "",
      soNumber: soNumber.trim(),
      description: description.trim(),
      amount: parsed,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
        {/* Cancel / title / Save across the top, the way a phone sheet reads —
            the primary action is where a thumb already is. */}
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
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!valid}
            onClick={save}
            className={cn(valid && "text-sky-700 dark:text-sky-400")}
          >
            Save
          </Button>
        </div>

        <DialogDescription className="sr-only">
          Enter one expense from today&apos;s spending.
        </DialogDescription>

        <div className="flex flex-col gap-0 divide-y px-4 py-1">
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

          <Field className="py-3">
            <FieldLabel
              htmlFor="expense-client"
              className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase"
            >
              Client name
            </FieldLabel>
            <SearchSelect
              id="expense-client"
              options={clientOptions}
              value={clientId}
              onValueChange={setClientId}
              placeholder="Not client-specific"
              searchPlaceholder="Search clients…"
              emptyMessage="No client matches that."
              className="border-0 px-0 shadow-none dark:bg-transparent"
            />
          </Field>

          <Field className="py-3">
            <FieldLabel
              htmlFor="expense-so"
              className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase"
            >
              S.O. number
            </FieldLabel>
            <Input
              id="expense-so"
              value={soNumber}
              onChange={(e) => setSoNumber(e.target.value)}
              placeholder="e.g. SO-2026-0148"
              className="h-auto border-0 bg-transparent p-0 font-mono shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
          </Field>

          <Field className="py-3">
            <FieldLabel
              htmlFor="expense-description"
              className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase"
            >
              Description
            </FieldLabel>
            <Input
              id="expense-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What was it for?"
              className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
          </Field>
        </div>

        <div className="p-3">
          <Button
            type="button"
            size="lg"
            className="w-full"
            disabled={!valid}
            onClick={save}
          >
            {initial ? "Save changes" : "Add to today's list"}
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

  useEffect(() => {
    if (!state?.success) return
    setExpenseDate(today)
    setReceipt(null)
    setExpenses([])
    setLateReason("")
    setNote("")
    onOpenChange(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const total = expenses.reduce((sum, e) => sum + e.amount, 0)
  const late = Boolean(expenseDate) && isLateExpense(expenseDate)
  const blocked =
    !expenseDate || expenses.length === 0 || (late && !lateReason.trim())

  function upsert(expense: Expense) {
    setExpenses((current) =>
      current.some((e) => e.uid === expense.uid)
        ? current.map((e) => (e.uid === expense.uid ? expense : e))
        : [...current, expense]
    )
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[92vh] flex-col gap-3 overflow-hidden sm:max-w-lg">
          <DialogHeader className="shrink-0">
            <DialogTitle>Today&apos;s liquidation</DialogTitle>
            <DialogDescription className="text-xs">
              One date, one set of receipts, and a line for each thing you paid
              for.
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
                  clientId: e.clientId || undefined,
                  soNumber: e.soNumber || undefined,
                  description: e.description,
                  amount: e.amount,
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

                <Field>
                  <FieldLabel className="text-xs">
                    Receipts{" "}
                    <span className="font-normal text-muted-foreground">
                      — one file for the day
                    </span>
                  </FieldLabel>
                  <FileUpload
                    folder="receipts"
                    value={receipt}
                    onChange={setReceipt}
                    disabled={pending}
                    label="Attach compiled receipts"
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
                <p className="mt-1.5 rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground">
                  Nothing added yet. Use “Add expense” for each thing you paid
                  for today.
                </p>
              ) : (
                <div className="mt-1.5 flex flex-col divide-y rounded-xl border px-3">
                  {expenses.map((expense) => (
                    <div key={expense.uid} className="flex items-start gap-2 py-2.5">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          setEditing(expense)
                          setSheetOpen(true)
                        }}
                        className="min-w-0 flex-1 text-left outline-none"
                      >
                        <p className="truncate text-sm leading-tight">
                          {expense.description}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {expense.clientName || "Not client-specific"}
                          {expense.soNumber && ` · ${expense.soNumber}`}
                        </p>
                      </button>
                      <span className="shrink-0 text-sm font-medium tabular-nums">
                        {peso(expense.amount)}
                      </span>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          setEditing(expense)
                          setSheetOpen(true)
                        }}
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

              <Button
                type="button"
                variant="outline"
                className="mt-2 w-full"
                disabled={pending}
                onClick={() => {
                  setEditing(null)
                  setSheetOpen(true)
                }}
              >
                <Plus />
                Add expense
              </Button>

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

      <ExpenseSheet
        clients={clients}
        initial={editing}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onSave={upsert}
      />
    </>
  )
}
