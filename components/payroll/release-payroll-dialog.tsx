"use client"

import { useState, useTransition } from "react"
import { AlertTriangle, EyeOff, Send } from "lucide-react"

import { releasePayroll, unreleasePayroll } from "@/app/actions/payroll"
import { peso } from "@/lib/reimbursement"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export type ReleaseMode = "release" | "unrelease"

/**
 * Whether the period has actually finished.
 *
 * The same test the server makes, made again here so the dialog can say what
 * it is about to do rather than opening a confirmation and then refusing it.
 * The server still decides — a browser clock can be wrong, and this is a
 * courtesy — so its refusal is shown here too if it ever disagrees.
 */
function hasClosed(cutoffEnd: string) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return new Date(cutoffEnd) < today
}

/**
 * Releasing payroll, confirmed rather than done on a click.
 *
 * It is the one action on this page that reaches people outside the office:
 * every employee sees their own pay the moment it lands, and a mis-click is
 * not something an apology takes back. So the button opens this, and this says
 * what is about to happen — to how many people, for how much — before it does.
 */
export function ReleasePayrollDialog({
  mode,
  open,
  onOpenChange,
  cutoffDay,
  cutoffLabel,
  cutoffEnd,
  staffCount,
  netTotal,
}: {
  mode: ReleaseMode
  open: boolean
  onOpenChange: (open: boolean) => void
  cutoffDay: string
  cutoffLabel: string
  /** Last day of the period, so the dialog knows whether it has run out. */
  cutoffEnd: string
  staffCount: number
  netTotal: number
}) {
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  // A period still running is refused rather than confirmed: the figures move
  // every time a punch is corrected, and an employee watching their own pay
  // change for a week is worse than waiting for the cutoff to close.
  const tooEarly = mode === "release" && !hasClosed(cutoffEnd)

  function confirm() {
    setMessage(null)
    startTransition(async () => {
      const result = await (mode === "release"
        ? releasePayroll(cutoffDay)
        : unreleasePayroll(cutoffDay))

      // `revalidatePath` brings the new state down on its own, so there is
      // nothing to do on success but get out of the way.
      if (result?.message) setMessage(result.message)
      else onOpenChange(false)
    })
  }

  const closesOn = new Date(cutoffEnd).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {tooEarly ? (
              <>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-600/10">
                  <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
                </span>
                This period hasn&rsquo;t finished
              </>
            ) : mode === "release" ? (
              <>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand/10">
                  <Send className="size-4 text-brand" />
                </span>
                Release {cutoffLabel}?
              </>
            ) : (
              <>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-600/10">
                  <EyeOff className="size-4 text-amber-600 dark:text-amber-400" />
                </span>
                Hide {cutoffLabel} again?
              </>
            )}
          </DialogTitle>

          <DialogDescription>
            {tooEarly
              ? `${cutoffLabel} runs until ${closesOn}. Until then these figures still move as punches are corrected and overtime is decided — releasing now would change somebody's pay under them for the rest of the period.`
              : mode === "release"
                ? "Every employee will see their own payslip on their Payroll page, with a summary on screen and the full day-by-day computation to download."
                : "It disappears from every employee's Payroll page and the download stops working. Nothing is deleted, and you can release it again."}
          </DialogDescription>
        </DialogHeader>

        {/* What is actually going out, in the two numbers that describe it. */}
        {!tooEarly && mode === "release" && (
          <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/30 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium tabular-nums">
                {staffCount} {staffCount === 1 ? "person" : "people"}
              </p>
              <p className="text-xs text-muted-foreground">on this run</p>
            </div>
            <div className="min-w-0 text-right">
              <p className="text-sm font-medium tabular-nums">
                {peso(netTotal)}
              </p>
              <p className="text-xs text-muted-foreground">total net pay</p>
            </div>
          </div>
        )}

        {mode === "unrelease" && (
          <p className="text-xs text-muted-foreground">
            Anyone who has already downloaded their payslip keeps their copy.
          </p>
        )}

        {message && (
          <p className="text-sm text-destructive" role="status">
            {message}
          </p>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {tooEarly ? "Close" : "Cancel"}
          </Button>

          {/* No confirm button at all when it can't be done — an action that
              would only be refused is worse than one that isn't offered. */}
          {!tooEarly && (
            <Button
              type="button"
              onClick={confirm}
              disabled={pending}
              variant={mode === "release" ? "default" : "destructive"}
            >
              {mode === "release" ? <Send /> : <EyeOff />}
              {pending
                ? mode === "release"
                  ? "Releasing…"
                  : "Hiding…"
                : mode === "release"
                  ? "Release payroll"
                  : "Unrelease"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
