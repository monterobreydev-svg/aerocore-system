"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { AlertTriangle, CheckCircle2 } from "lucide-react"
import { createSchedule, type ScheduleState } from "@/app/actions/schedules"
import { todayKey, type EmployeeBusyBlock } from "@/lib/schedule"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,

} from "@/components/ui/dialog"
import {
  ScheduleFormFields,
  type ScheduleContext,
} from "@/components/admin/schedule-form-fields"
import type { ScheduleSlot } from "@/components/admin/schedule-slot"
import type {
  ClientOption,
  EmployeeOption,
} from "@/components/admin/schedule-types"

// What clicking an empty calendar slot hands over: the day, and for the time
// grids the hour that was clicked.
export function CreateScheduleDialog({
  clients,
  employees,
  busy,
  open,
  onOpenChange,
  slot,
}: {
  clients: ClientOption[]
  employees: EmployeeOption[]
  busy: EmployeeBusyBlock[]
  // Controlled from the calendar so clicking an empty slot can open this
  // pre-filled with that day and hour, not just the toolbar button.
  open: boolean
  onOpenChange: (open: boolean) => void
  slot: ScheduleSlot
}) {
  const [state, action, pending] = useActionState<ScheduleState, FormData>(
    createSchedule,
    undefined
  )

  const [context, setContext] = useState<ScheduleContext>(() => ({
    clientId: "",
    branchId: "",
    ...slot,
  }))
  // Bumping this remounts the volatile half of the form (work types,
  // employees, contacts, remarks) while `context` survives in this component's
  // state — the whole point of "Save & add another".
  const [formKey, setFormKey] = useState(0)
  const [createdCount, setCreatedCount] = useState(0)
  // Read inside the effect only, so it doesn't need to be a dependency: which
  // button was pressed decides whether the dialog stays open for the next job.
  const keepOpenRef = useRef(false)
  // Tracks the slot the dialog was last opened with, so re-opening on a
  // different day reseeds the form without an effect firing on every render.
  const openedWithRef = useRef<ScheduleSlot | null>(null)

  useEffect(() => {
    if (!state?.success) return
    setCreatedCount((count) => count + 1)
    setFormKey((key) => key + 1)
    if (!keepOpenRef.current) onOpenChange(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  useEffect(() => {
    if (!open || openedWithRef.current === slot) return
    openedWithRef.current = slot
    setContext({ clientId: "", branchId: "", ...slot })
    setFormKey((key) => key + 1)
    setCreatedCount(0)
  }, [open, slot])

  function patchContext(patch: Partial<ScheduleContext>) {
    setContext((current) => ({ ...current, ...patch }))
  }

  const conflictMessages = state?.errors?.employeeIds ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* One scroll region, not two. DialogContent became a scroll container
          itself (max-height + overflow-y-auto on the popup), and this dialog
          still had its own capped, scrolling form inside it — so the panel got
          a second scrollbar beside the first, the employee picker's made a
          third, and the popup could still end up taller than the screen with
          the footer stranded mid-panel.

          Rows instead: header and footer size to their content, the form takes
          whatever is left and scrolls on its own. `overflow-hidden` on the
          popup is what stops it scrolling as well, and `minmax(0, 1fr)` is what
          lets the middle row shrink below its content instead of pushing the
          footer off the bottom. Same shape as the liquidation and claim
          dialogs. */}
      <DialogContent className="grid max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-3 overflow-hidden sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Create schedule</DialogTitle>
          <DialogDescription className="text-xs">
            “Save &amp; add another” keeps the site, date and time for the next
            schedule.
          </DialogDescription>
        </DialogHeader>

        <form
          action={action}
          id="create-schedule-form"
          className="-mx-1 min-h-0 overflow-y-auto px-1 py-0.5"
        >
          <ScheduleFormFields
            key={formKey}
            idPrefix="new-schedule"
            clients={clients}
            employees={employees}
            busy={busy}
            context={context}
            onContextChange={patchContext}
            errors={state?.errors}
            pending={pending}
            // Read on each open rather than held in state: the dialog can be
            // left sitting on a phone overnight, and the floor has to be the
            // day it is submitted on, not the day it was opened on.
            minDate={todayKey()}
          />

          {conflictMessages.length > 0 && (
            <div className="mt-4 flex flex-col gap-1.5 rounded-lg bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
              <span className="inline-flex items-center gap-1.5 font-medium">
                <AlertTriangle className="size-3.5" />
                Schedule conflict
              </span>
              {conflictMessages.map((message) => (
                <span key={message}>{message}</span>
              ))}
            </div>
          )}

          {state?.message && conflictMessages.length === 0 && (
            <p className="mt-4 text-sm text-destructive">{state.message}</p>
          )}
        </form>

        {/* Buttons stack on a phone and sit inline from sm up; the counter
            only earns its line once something has actually been created. */}
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {createdCount > 0 && (
            <p className="inline-flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="size-3.5" />
              {createdCount} created
            </p>
          )}
          <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
            <Button
              type="submit"
              form="create-schedule-form"
              variant="outline"
              disabled={pending}
              onClick={() => (keepOpenRef.current = true)}
              className="flex-1 sm:flex-none"
            >
              Save &amp; add
            </Button>
            <Button
              type="submit"
              form="create-schedule-form"
              disabled={pending}
              onClick={() => (keepOpenRef.current = false)}
              className="flex-1 sm:flex-none"
            >
              {pending ? "Creating..." : "Create schedule"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
