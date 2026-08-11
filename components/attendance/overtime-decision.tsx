"use client"

import { useActionState, useState } from "react"
import { Check, Loader2, Minus, Plus, X } from "lucide-react"
import {
  reviewOvertime,
  type OvertimeReviewState,
} from "@/app/actions/attendance"
import { MAX_OVERTIME_HOURS } from "@/lib/attendance"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

// Overtime is asked for in half hours; anything finer is false precision on a
// number somebody estimated while still on the job.
const STEP = 0.5

function clamp(value: number) {
  return Math.min(MAX_OVERTIME_HOURS, Math.max(STEP, Math.round(value / STEP) * STEP))
}

/** Trailing ".0" reads like a form field; "2" and "2.5" read like hours. */
function hoursLabel(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

/**
 * Approve or reject one request, wherever it's being looked at — the queue and
 * the day's detail both use this, so the two can't drift on what a decision
 * costs.
 *
 * The hours are editable: what an employee estimated an hour before knocking
 * off is not always what the job took, and the office is the one who knows.
 * Whatever is granted is stored beside the original rather than over it, so
 * "asked for 3, got 1.5" stays answerable afterwards.
 */
export function OvertimeDecision({
  requestId,
  requestedHours,
  className,
}: {
  requestId: string
  requestedHours: number
  className?: string
}) {
  const [state, action, pending] = useActionState<OvertimeReviewState, FormData>(
    reviewOvertime,
    undefined
  )
  const [hours, setHours] = useState(requestedHours)
  const [rejecting, setRejecting] = useState(false)

  const edited = hours !== requestedHours

  return (
    <form action={action} className={cn("flex flex-col gap-2.5", className)}>
      <input type="hidden" name="id" value={requestId} />
      <input type="hidden" name="approvedHours" value={hours} />

      {rejecting ? (
        <>
          <Textarea
            name="reviewNote"
            rows={2}
            required
            maxLength={1000}
            autoFocus
            placeholder="Why is this being rejected? The employee sees this."
            disabled={pending}
            className="text-sm"
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => setRejecting(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              name="decision"
              value="REJECTED"
              variant="destructive"
              size="sm"
              disabled={pending}
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              Confirm rejection
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* A stepper rather than a bare number field: this is a decision made
              in half hours, and typing is the slower way to make it. */}
          <div className="mr-auto flex items-center gap-2">
            <div className="flex items-center rounded-lg border bg-background">
              <button
                type="button"
                aria-label="Fewer hours"
                disabled={pending || hours <= STEP}
                onClick={() => setHours((h) => clamp(h - STEP))}
                className="flex size-8 items-center justify-center rounded-l-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground disabled:opacity-40"
              >
                <Minus className="size-3.5" />
              </button>
              <span className="w-14 text-center text-sm font-semibold tabular-nums">
                {hoursLabel(hours)}h
              </span>
              <button
                type="button"
                aria-label="More hours"
                disabled={pending || hours >= MAX_OVERTIME_HOURS}
                onClick={() => setHours((h) => clamp(h + STEP))}
                className="flex size-8 items-center justify-center rounded-r-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground disabled:opacity-40"
              >
                <Plus className="size-3.5" />
              </button>
            </div>

            {edited && (
              <button
                type="button"
                onClick={() => setHours(requestedHours)}
                className="text-xs text-amber-600 underline-offset-2 outline-none hover:underline dark:text-amber-400"
              >
                asked {hoursLabel(requestedHours)}h · reset
              </button>
            )}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => setRejecting(true)}
          >
            <X className="size-4" />
            Reject
          </Button>
          <Button
            type="submit"
            name="decision"
            value="APPROVED"
            size="sm"
            disabled={pending}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            Approve {hoursLabel(hours)}h
          </Button>
        </div>
      )}

      {state?.message && (
        <p className="text-right text-xs text-destructive">{state.message}</p>
      )}
    </form>
  )
}
