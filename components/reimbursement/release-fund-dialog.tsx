"use client"

import { useActionState, useEffect, useState } from "react"
import { Plus } from "lucide-react"
import { releaseFund, type FundingState } from "@/app/actions/reimbursements"
import { FUND_RELEASE_METHODS, peso } from "@/lib/reimbursement"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import type { EmployeeBalance } from "@/components/reimbursement/admin-claim"

export function ReleaseFundDialog({
  employees,
  presetEmployeeId,
  open,
  onOpenChange,
}: {
  employees: EmployeeBalance[]
  presetEmployeeId?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [state, action, pending] = useActionState<FundingState, FormData>(
    releaseFund,
    undefined
  )
  // The dialog is mounted only while it's open, so a fresh open starts from
  // these initial values — nothing to reset in an effect.
  const [employeeId, setEmployeeId] = useState(presetEmployeeId ?? "")
  const [proof, setProof] = useState<UploadedFile | null>(null)

  useEffect(() => {
    if (state?.success) onOpenChange(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const selected = employees.find((e) => e.id === employeeId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Release fund</DialogTitle>
          <DialogDescription className="text-xs">
            Money handed to an employee up front. They account for it with
            daily liquidations.
          </DialogDescription>
        </DialogHeader>

        <form action={action} id="release-fund-form" className="flex flex-col gap-3">
          <input type="hidden" name="employeeId" value={employeeId} />
          <input type="hidden" name="proofKey" value={proof?.key ?? ""} />
          <input type="hidden" name="proofName" value={proof?.name ?? ""} />
          <input type="hidden" name="proofType" value={proof?.type ?? ""} />

          <Field data-invalid={!!state?.errors?.employeeId}>
            <FieldLabel htmlFor="release-employee" className="text-xs">
              Employee
            </FieldLabel>
            <SearchSelect
              id="release-employee"
              options={employees.map((e) => ({
                value: e.id,
                label: e.name,
                hint: `${peso(e.released - e.liquidated)} on hand`,
              }))}
              value={employeeId}
              onValueChange={setEmployeeId}
              placeholder="Pick an employee"
              searchPlaceholder="Search employees…"
              emptyMessage="No employee matches that."
              disabled={pending}
            />
            <FieldError
              errors={state?.errors?.employeeId?.map((message) => ({ message }))}
            />
          </Field>

          {selected && (
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              Currently holding{" "}
              <span className="font-medium text-foreground tabular-nums">
                {peso(selected.released - selected.liquidated)}
              </span>{" "}
              of {peso(selected.released)} released.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field data-invalid={!!state?.errors?.amount}>
              <FieldLabel htmlFor="release-amount" className="text-xs">
                Amount
              </FieldLabel>
              <div className="relative">
                <span className="absolute top-1/2 left-2.5 -translate-y-1/2 text-xs text-muted-foreground">
                  ₱
                </span>
                <Input
                  id="release-amount"
                  name="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="0.00"
                  disabled={pending}
                  required
                  className="pl-6"
                />
              </div>
              <FieldError
                errors={state?.errors?.amount?.map((message) => ({ message }))}
              />
            </Field>

            <Field data-invalid={!!state?.errors?.method}>
              <FieldLabel htmlFor="release-method" className="text-xs">
                Method
              </FieldLabel>
              <Select
                name="method"
                defaultValue=""
                disabled={pending}
                items={Object.fromEntries(
                  FUND_RELEASE_METHODS.map((method) => [method, method])
                )}
              >
                <SelectTrigger id="release-method" className="w-full">
                  <SelectValue placeholder="How it was sent" />
                </SelectTrigger>
                <SelectContent>
                  {FUND_RELEASE_METHODS.map((method) => (
                    <SelectItem key={method} value={method}>
                      {method}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError
                errors={state?.errors?.method?.map((message) => ({ message }))}
              />
            </Field>
          </div>

          <Field data-invalid={!!state?.errors?.proof}>
            <FieldLabel className="text-xs">
              Proof of transfer <span className="text-destructive">*</span>
            </FieldLabel>
            {/* Screenshots only. Proof of a transfer is what someone holds up
                on a phone — a PDF of one is a step nobody was taking, and
                images are compressed on the way out where a PDF can't be. */}
            <FileUpload
              folder="funding-proof"
              value={proof}
              onChange={setProof}
              disabled={pending}
              label="Attach a screenshot"
              accept="image/jpeg,image/png,image/webp,image/heic"
              context={{ employeeId }}
            />
            <FieldError
              errors={state?.errors?.proof?.map((message) => ({ message }))}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="release-note" className="text-xs">
              Note
            </FieldLabel>
            <Textarea
              id="release-note"
              name="note"
              rows={2}
              maxLength={1000}
              disabled={pending}
            />
          </Field>

          {state?.message && (
            <p className="text-xs text-destructive">{state.message}</p>
          )}
        </form>

        <DialogFooter>
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
            form="release-fund-form"
            disabled={pending || !proof || !employeeId}
          >
            <Plus />
            {pending ? "Saving…" : "Release fund"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
