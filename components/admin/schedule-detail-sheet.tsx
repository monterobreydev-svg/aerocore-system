"use client"

import { useActionState, useEffect, useState } from "react"
import type { ScheduleStatus } from "@/app/generated/prisma/client"
import {
  AlertTriangle,
  CalendarDays,
  ChevronDown,
  Clock,
  History,
  MapPin,
  Pencil,
  Phone,
  StickyNote,
  Trash2,
  UserRound,
  User,
  Users,
} from "lucide-react"
import {
  deleteSchedule,
  listScheduleHistory,
  updateScheduleStatus,
  updateSchedule,
  type ScheduleHistoryEntry,
  type UpdateScheduleState,
} from "@/app/actions/schedules"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Spinner } from "@/components/ui/spinner"
import {
  SCHEDULE_STATUSES,
  SCHEDULE_STATUS_CHIP,
  SCHEDULE_STATUS_DOT,
  SCHEDULE_STATUS_LABELS,
  WORK_TYPE_LABELS,
  WORK_TYPE_SOLID,
  formatScheduleDate,
  formatTimeRange,
  toDateInputValue,
  toTimeInputValue,
  type EmployeeBusyBlock,
} from "@/lib/schedule"
import { cn } from "@/lib/utils"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  ScheduleFormFields,
  type ScheduleContext,
} from "@/components/admin/schedule-form-fields"
import type {
  ClientOption,
  EmployeeOption,
  ScheduleRecord,
} from "@/components/admin/schedule-types"

function DetailRow({
  icon: Icon,
  children,
}: {
  icon: React.ElementType
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-2.5 text-sm">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

// The words for each logged field. The log stores the key so the wording can
// change without rewriting rows that were already written.
const FIELD_LABELS: Record<string, string> = {
  client: "the client",
  branch: "the branch",
  date: "the date",
  startTime: "the start time",
  endTime: "the end time",
  status: "the status",
  workTypes: "the work types",
  assigned: "the crew",
  contactPerson: "the on-site contact",
  contactNumber: "the contact number",
  remarks: "the remarks",
}

/** An empty side of a change reads as a dash, not as nothing at all. */
function historyValue(value: string | null) {
  return value && value.trim() !== "" ? value : "—"
}

/**
 * Who changed what, since the job was booked.
 *
 * Fetched when the panel is opened rather than with the calendar: history is
 * per-job and grows forever, so shipping it with every schedule on screen is
 * the payload that scales with two things at once. Re-read on each open rather
 * than cached — a status chip one tap away can change it at any moment, and a
 * stale history is worse than a half-second wait.
 */
function ScheduleHistory({ scheduleId }: { scheduleId: string }) {
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<ScheduleHistoryEntry[] | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) return

    setLoading(true)
    try {
      setEntries(await listScheduleHistory(scheduleId))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Collapsible
      open={open}
      onOpenChange={handleOpenChange}
      className="group/history rounded-lg border p-3"
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
                    {new Date(entry.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Nothing has been changed since this job was created.
          </p>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

// Read-only first: opening a job should answer "what is this" before offering
// to change it, and it makes Edit and Delete visible actions rather than
// something you discover by scrolling a form.
function ScheduleSummary({
  schedule,
  onEdit,
  onDeleted,
}: {
  schedule: ScheduleRecord
  onEdit: () => void
  onDeleted: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [savingStatus, setSavingStatus] = useState<ScheduleStatus | null>(null)

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteSchedule(schedule.id)
      onDeleted()
    } finally {
      setDeleting(false)
    }
  }

  async function handleStatus(status: ScheduleStatus) {
    if (status === schedule.status) return
    setSavingStatus(status)
    try {
      await updateScheduleStatus(schedule.id, status)
    } finally {
      setSavingStatus(null)
    }
  }

  // min-h-0 on both levels: a flex item's min-height defaults to its content,
  // so without it the body grows past the sheet and pushes the footer — and
  // the Save/Delete buttons with it — off the bottom of the screen.
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {schedule.workTypes.map((type) => (
            <Badge key={type} className={WORK_TYPE_SOLID[type]}>
              {WORK_TYPE_LABELS[type]}
            </Badge>
          ))}
        </div>

        {/* Status is the one thing that changes constantly after creation —
            closing out a day shouldn't mean opening the full edit form, so it
            saves on click without touching anything else. */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Status
          </span>
          <div className="flex flex-wrap gap-1.5">
            {SCHEDULE_STATUSES.map((status) => {
              const active = schedule.status === status
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => handleStatus(status)}
                  disabled={savingStatus !== null || deleting}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors outline-none disabled:opacity-60",
                    active
                      ? cn(SCHEDULE_STATUS_CHIP[status], "border-transparent")
                      : "border-border text-muted-foreground hover:bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      SCHEDULE_STATUS_DOT[status]
                    )}
                  />
                  {SCHEDULE_STATUS_LABELS[status]}
                  {savingStatus === status && "…"}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border p-3">
          <DetailRow icon={CalendarDays}>
            {formatScheduleDate(schedule.date)}
          </DetailRow>
          <DetailRow icon={Clock}>
            {formatTimeRange(schedule.startTime, schedule.endTime)}
          </DetailRow>
          <DetailRow icon={MapPin}>
            <p>{schedule.branch?.name ?? "Head office"}</p>
            <p className="text-xs text-muted-foreground">
              {schedule.branch?.address ?? schedule.client.address}
            </p>
          </DetailRow>
          <DetailRow icon={Users}>
            {schedule.assignments.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {schedule.assignments.map((assignment) => (
                  <Badge key={assignment.id} variant="outline">
                    {assignment.employeeName}
                  </Badge>
                ))}
              </div>
            ) : (
              <span className="text-amber-700 dark:text-amber-400">
                No employees assigned yet
              </span>
            )}
          </DetailRow>
          <DetailRow icon={User}>
            {schedule.contactPerson || schedule.contactNumber ? (
              <span>
                {schedule.contactPerson || "No name on file"}
                {schedule.contactNumber && (
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    {" · "}
                    <Phone className="size-3" />
                    {schedule.contactNumber}
                  </span>
                )}
              </span>
            ) : (
              <span className="text-muted-foreground">
                No on-site contact recorded
              </span>
            )}
          </DetailRow>
          {schedule.remarks && (
            <DetailRow icon={StickyNote}>
              <p className="whitespace-pre-wrap">{schedule.remarks}</p>
            </DetailRow>
          )}
          {/* Who created it, spelled out rather than tucked in the subtitle —
              it's the first thing anyone asks when a job looks wrong. */}
          <DetailRow icon={UserRound}>
            <span className="text-muted-foreground">
              Created by{" "}
              <span className="font-medium text-foreground">
                {schedule.createdByName ?? "the system"}
              </span>{" "}
              on {new Date(schedule.createdAt).toLocaleString()}
            </span>
          </DetailRow>
        </div>

        {/* And who changed it since. Second question after "who made this". */}
        <ScheduleHistory scheduleId={schedule.id} />

        {confirmDelete && (
          <div className="flex flex-col gap-3 rounded-lg bg-destructive/10 p-3 text-sm">
            <p className="text-destructive">
              Delete this job? Its employee assignments go with it and this
              can&apos;t be undone.
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? "Deleting..." : "Yes, delete"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
              >
                Keep
              </Button>
            </div>
          </div>
        )}
      </div>

      <SheetFooter className="mt-auto shrink-0 flex-row gap-2 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={() => setConfirmDelete(true)}
          disabled={deleting || confirmDelete}
          className="text-destructive hover:bg-destructive/10"
        >
          <Trash2 />
          Delete
        </Button>
        <Button type="button" onClick={onEdit} className="flex-1">
          <Pencil />
          Edit job
        </Button>
      </SheetFooter>
    </div>
  )
}

function ScheduleEditForm({
  schedule,
  clients,
  employees,
  busy,
  onCancel,
  onSaved,
}: {
  schedule: ScheduleRecord
  clients: ClientOption[]
  employees: EmployeeOption[]
  busy: EmployeeBusyBlock[]
  onCancel: () => void
  onSaved: () => void
}) {
  const [state, action, pending] = useActionState<
    UpdateScheduleState,
    FormData
  >(updateSchedule, undefined)

  const [context, setContext] = useState<ScheduleContext>(() => ({
    clientId: schedule.client.id,
    branchId: schedule.branch?.id ?? "",
    date: toDateInputValue(schedule.date),
    startTime: toTimeInputValue(schedule.startTime),
    endTime: toTimeInputValue(schedule.endTime),
  }))
  // Frozen so a revalidate can't swap defaultValue under an already-mounted
  // uncontrolled field while the sheet is closing.
  const [initial] = useState(schedule)

  useEffect(() => {
    if (state?.success) onSaved()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const formId = `schedule-edit-form-${schedule.id}`
  const conflictMessages = state?.errors?.employeeIds ?? []

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <form action={action} id={formId}>
          <input type="hidden" name="scheduleId" value={schedule.id} />
          <ScheduleFormFields
            idPrefix={`schedule-${schedule.id}`}
            clients={clients}
            employees={employees}
            busy={busy}
            context={context}
            onContextChange={(patch) =>
              setContext((current) => ({ ...current, ...patch }))
            }
            errors={state?.errors}
            pending={pending}
            scheduleId={schedule.id}
            defaultWorkTypes={initial.workTypes}
            defaultEmployeeIds={initial.assignments.map((a) => a.employeeId)}
            defaultContactPerson={initial.contactPerson ?? ""}
            defaultContactNumber={initial.contactNumber ?? ""}
            defaultRemarks={initial.remarks ?? ""}
            defaultStatus={initial.status}
            showStatus
          />
        </form>
      </div>

      {/* Errors sit outside the scroll area, pinned above the buttons. Inside
          it they'd land at the bottom of a long form — you press Save, nothing
          appears to happen, and the reason is off-screen. */}
      {conflictMessages.length > 0 && (
        <div className="flex max-h-32 shrink-0 flex-col gap-1 overflow-y-auto border-t bg-destructive/10 px-4 py-2.5 text-xs text-destructive">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <AlertTriangle className="size-3.5 shrink-0" />
            Schedule conflict — nobody can be in two places at once
          </span>
          {conflictMessages.map((message) => (
            <span key={message}>{message}</span>
          ))}
        </div>
      )}

      {state?.message && conflictMessages.length === 0 && (
        <p className="shrink-0 border-t bg-destructive/10 px-4 py-2.5 text-xs text-destructive">
          {state.message}
        </p>
      )}

      <SheetFooter className="mt-auto shrink-0 flex-row gap-2 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button type="submit" form={formId} disabled={pending} className="flex-1">
          {pending ? "Saving..." : "Save changes"}
        </Button>
      </SheetFooter>
    </div>
  )
}

function SheetBody({
  schedule,
  clients,
  employees,
  busy,
  onClose,
}: {
  schedule: ScheduleRecord
  clients: ClientOption[]
  employees: EmployeeOption[]
  busy: EmployeeBusyBlock[]
  onClose: () => void
}) {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <ScheduleEditForm
        schedule={schedule}
        clients={clients}
        employees={employees}
        busy={busy}
        onCancel={() => setEditing(false)}
        onSaved={onClose}
      />
    )
  }

  return (
    <ScheduleSummary
      schedule={schedule}
      onEdit={() => setEditing(true)}
      onDeleted={onClose}
    />
  )
}

export function ScheduleDetailSheet({
  schedule,
  open,
  onOpenChange,
  clients,
  employees,
  busy,
}: {
  schedule: ScheduleRecord | null
  open: boolean
  onOpenChange: (open: boolean) => void
  clients: ClientOption[]
  employees: EmployeeOption[]
  busy: EmployeeBusyBlock[]
}) {
  if (!schedule) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-hidden sm:max-w-xl">
        <SheetHeader className="shrink-0 border-b pr-12">
          <SheetTitle className={cn("truncate")}>
            {schedule.client.name}
            {schedule.branch ? ` · ${schedule.branch.name}` : ""}
          </SheetTitle>
          <SheetDescription>
            {formatScheduleDate(schedule.date)} ·{" "}
            {formatTimeRange(schedule.startTime, schedule.endTime)}
          </SheetDescription>
        </SheetHeader>

        <SheetBody
          key={schedule.id}
          schedule={schedule}
          clients={clients}
          employees={employees}
          busy={busy}
          onClose={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  )
}
