"use client"

import { useActionState, useEffect, useState } from "react"
import { Loader2, Timer } from "lucide-react"
import {
  requestOvertime,
  type OvertimeState,
} from "@/app/actions/attendance"
import { clockTime, MAX_OVERTIME_HOURS } from "@/lib/attendance"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"

// The lengths people actually ask for. Typing "2" into a number field on a phone
// keyboard is three taps; this is one.
const QUICK_HOURS = [1, 2, 3, 4]

export function OvertimeDialog({
  shiftEndsAt,
  open,
  onOpenChange,
}: {
  shiftEndsAt: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [state, action, pending] = useActionState<OvertimeState, FormData>(
    requestOvertime,
    undefined
  )
  const [hours, setHours] = useState("1")
  const [reason, setReason] = useState("")

  useEffect(() => {
    if (state?.success) onOpenChange(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const parsed = Number(hours)
  const valid =
    reason.trim() !== "" &&
    Number.isFinite(parsed) &&
    parsed > 0 &&
    parsed <= MAX_OVERTIME_HOURS

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Timer className="size-4" />
            Request overtime
          </DialogTitle>
          <DialogDescription className="text-xs">
            Your shift ends at {clockTime(shiftEndsAt)}. Say how much longer the
            job needs — the office reviews it.
          </DialogDescription>
        </DialogHeader>

        <form action={action} id="overtime-form" className="flex flex-col gap-3">
          <input type="hidden" name="hours" value={hours} />

          <Field>
            <FieldLabel className="text-xs">Extra hours</FieldLabel>
            <div className="flex gap-1.5">
              {QUICK_HOURS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setHours(String(value))}
                  className={cn(
                    "h-10 flex-1 rounded-lg border text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    Number(hours) === value
                      ? "border-brand bg-brand/10 text-brand"
                      : "border-border hover:bg-muted"
                  )}
                >
                  {value}h
                </button>
              ))}
            </div>
            <Input
              type="number"
              min="0.5"
              max={MAX_OVERTIME_HOURS}
              step="0.5"
              inputMode="decimal"
              value={hours}
              onChange={(event) => setHours(event.target.value)}
              aria-label="Extra hours"
              disabled={pending}
              className="mt-1"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="overtime-reason" className="text-xs">
              Why the job needs longer
            </FieldLabel>
            <Textarea
              id="overtime-reason"
              name="reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="e.g. Compressor replacement still in progress, unit can't be left open."
              disabled={pending}
            />
          </Field>

          {state?.message && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {state.message}
            </p>
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
            form="overtime-form"
            disabled={pending || !valid}
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            {pending ? "Sending…" : "Send request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
