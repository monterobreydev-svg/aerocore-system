"use client"

import {
  Fragment,
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  AlertTriangle,
  CalendarPlus,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  MoonStar,
  Plus,
  Trash2,
} from "lucide-react"
import type { WorkType } from "@/app/generated/prisma/client"
import { createSchedules, type ScheduleBatchState } from "@/app/actions/schedules"
import {
  addDays,
  combineDateTime,
  crossesMidnight,
  dateKey,
  nowTimeKey,
  parseDateKey,
  scheduleEndsAt,
  shiftMinutes,
  todayKey,
  WORK_TYPE_LABELS,
  type EmployeeBusyBlock,
} from "@/lib/schedule"
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
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { SearchSelect } from "@/components/ui/search-select"
import { ScheduleEmployeePicker } from "@/components/admin/schedule-employee-picker"
import {
  ScheduleBranchPicker,
  ScheduleSalesOrderPicker,
  useClientSiteData,
} from "@/components/admin/schedule-site-pickers"
import { ScheduleWorkTypePicker } from "@/components/admin/schedule-worktype-picker"
import type { ScheduleSlot } from "@/components/admin/schedule-slot"
import type {
  ClientOption,
  EmployeeOption,
} from "@/components/admin/schedule-types"

// ---------------------------------------------------------------------------
// Booking a week of work for one crew
//
// The office deploys people, not jobs: the same four are out all week, one
// client on Tuesday and a different one on Thursday. Re-picking those four for
// every visit was the whole reason bulk entry hurt.
//
// So the crew is chosen once, and everything else belongs to the row — client,
// branch, sales order, day, hours, work, and the on-site contact. A different
// client means a different site, and a different site means a different person
// meeting the crew at the gate, so a contact shared across the batch would be
// wrong for all but one of them.
//
// Rows are an accordion, one open at a time. A row is a whole job and doesn't
// fit on a phone screen beside its neighbours, but its collapsed summary is
// exactly what you check when scanning what you're about to book.
// ---------------------------------------------------------------------------

const STEPS = [
  { id: 1, label: "Crew" },
  { id: 2, label: "Schedules" },
  { id: 3, label: "Review" },
] as const

// Matches SCHEDULE_BATCH_LIMIT in app/actions/schedules.ts. The server is the
// one that enforces it; this stops the button before the round trip.
const MAX_ROWS = 20

type Row = {
  // Stable across deletes, so React keeps each row's own DOM — an index key
  // would move the value you just typed into the row below when one above it
  // is removed.
  key: string
  clientId: string
  branchId: string
  // Carried beside the id purely so the collapsed summary and the review step
  // can name the site. The picker hands it over when the choice is made.
  branchLabel: string
  salesOrderNo: string
  date: string
  startTime: string
  endTime: string
  workTypes: WorkType[]
  contactPerson: string
  contactNumber: string
  remarks: string
}

/** What actually crosses the wire — the key and the label are browser concerns. */
type RowPayload = Omit<Row, "key" | "branchLabel">

let rowSeq = 0
function newRow(from: Partial<Row> & { date: string }): Row {
  rowSeq += 1
  return {
    clientId: "",
    branchId: "",
    branchLabel: "Head office",
    salesOrderNo: "",
    startTime: "08:00",
    endTime: "12:00",
    workTypes: [],
    contactPerson: "",
    contactNumber: "",
    remarks: "",
    ...from,
    key: `row-${rowSeq}`,
  }
}

/** "13h" or "9h 30m" — the length, said the way a person would say it. */
function formatShiftLength(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}

const MINUTES_IN_DAY = 24 * 60

function timeToMinutes(time: string) {
  const [hours, mins] = time.split(":").map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return null
  return hours * 60 + mins
}

function minutesToTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(
    minutes % 60
  ).padStart(2, "0")}`
}

function addMinutesToTime(time: string, minutes: number) {
  const from = timeToMinutes(time)
  if (from === null) return ""
  return minutesToTime(Math.min(from + minutes, MINUTES_IN_DAY - 1))
}

/**
 * The hours of the crew's next stop that day: it starts when this job ends and
 * runs for as long. 08:00–12:00 begets 12:00–16:00.
 *
 * Null when the day cannot hold it — an overnight job, or one whose repeat
 * would spill past midnight. The caller leaves the hours as they were rather
 * than inventing a pair that has to be corrected anyway.
 */
function nextShift(row: Row) {
  const start = timeToMinutes(row.startTime)
  const end = timeToMinutes(row.endTime)
  if (start === null || end === null || end <= start) return null
  const finish = end + (end - start)
  if (finish >= MINUTES_IN_DAY) return null
  return { startTime: row.endTime, endTime: minutesToTime(finish) }
}

/** "Tue, 4 Mar" — enough to recognise a day in a list of them. */
function dayLabel(date: string) {
  const parsed = parseDateKey(date)
  return parsed
    ? parsed.toLocaleDateString("en-PH", {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : "No date"
}

const DURATION_PRESETS = [
  { label: "4h", minutes: 240 },
  { label: "8h", minutes: 480 },
]

// ---------------------------------------------------------------------------

/**
 * One job in the batch: everything except who's doing it.
 *
 * Its own component so typing in one row doesn't re-render the other nineteen,
 * and so the row can own the presentation that only makes sense beside its own
 * fields — the overnight note, the late start, its own errors.
 */
function ScheduleRowCard({
  row,
  index,
  count,
  clients,
  siteData,
  minDate,
  minTime,
  problems,
  open,
  disabled,
  onToggle,
  onChange,
  onDuplicate,
  onRemove,
}: {
  row: Row
  index: number
  count: number
  clients: ClientOption[]
  siteData: ReturnType<typeof useClientSiteData>
  minDate: string
  /** The time now, when this row is dated today. Empty on any other day. */
  minTime: string
  problems: string[]
  open: boolean
  disabled: boolean
  onToggle: () => void
  onChange: (patch: Partial<Row>) => void
  onDuplicate: () => void
  onRemove: () => void
}) {
  const client = clients.find((entry) => entry.id === row.clientId)

  const clientOptions = useMemo(
    () =>
      clients.map((entry) => ({
        value: entry.id,
        label: entry.name,
        hint: entry.address,
      })),
    [clients]
  )

  // Only today can be too late: a later day's early start is still ahead.
  const startedAlready = Boolean(
    minTime && row.date === minDate && row.startTime && row.startTime < minTime
  )
  const overnight =
    Boolean(row.startTime && row.endTime) &&
    crossesMidnight(row.startTime, row.endTime)
  const length =
    row.startTime && row.endTime ? shiftMinutes(row.startTime, row.endTime) : 0

  const id = (field: string) => `${row.key}-${field}`

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border bg-card",
        problems.length > 0 && "border-destructive/50"
      )}
    >
      {/* The summary is the row when it's shut: enough to check what you're
          booking without opening all twenty. */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left outline-none"
        >
          <span
            className={cn(
              "flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums",
              problems.length > 0
                ? "bg-destructive/15 text-destructive"
                : "bg-muted text-muted-foreground"
            )}
          >
            {index + 1}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">
              {client?.name ?? "No client yet"}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {dayLabel(row.date)}
              {length > 0 && ` · ${row.startTime}–${row.endTime}`}
              {row.salesOrderNo && ` · SO ${row.salesOrderNo}`}
            </span>
          </span>
          {/* A shut row with something wrong must say so — otherwise the batch
              is rejected and nothing on screen explains why. */}
          {problems.length > 0 && !open && (
            <AlertTriangle className="size-4 shrink-0 text-destructive" />
          )}
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180"
            )}
          />
        </button>
        {/* Duplicate is the button that earns this screen: the next job is
            usually this one with the date moved on. */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="size-7 shrink-0 p-0"
          onClick={onDuplicate}
          disabled={disabled || count >= MAX_ROWS}
          aria-label={`Duplicate schedule ${index + 1}`}
        >
          <Copy className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="size-7 shrink-0 p-0 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
          // The last row can't go: a batch of nothing has nothing to say.
          disabled={disabled || count <= 1}
          aria-label={`Remove schedule ${index + 1}`}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      {open && (
        <div className="flex flex-col gap-3 border-t px-3 py-3">
          <Field>
            <FieldLabel htmlFor={id("client")}>Client</FieldLabel>
            <SearchSelect
              id={id("client")}
              options={clientOptions}
              value={row.clientId}
              // Both belonged to the old client, so both go with it — leaving
              // them set would send the crew to another customer's address and
              // bill the work to their project.
              onValueChange={(value) =>
                onChange({
                  clientId: value,
                  branchId: "",
                  branchLabel: "Head office",
                  salesOrderNo: "",
                })
              }
              placeholder="Select a client"
              searchPlaceholder="Search clients…"
              emptyMessage="No client matches that."
              disabled={disabled}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={id("branch")}>Branch</FieldLabel>
              <ScheduleBranchPicker
                id={id("branch")}
                data={siteData}
                clientId={row.clientId}
                clientAddress={client?.address}
                value={row.branchId}
                onValueChange={(value, label) =>
                  onChange({ branchId: value, branchLabel: label })
                }
                disabled={disabled}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={id("so")}>SO number</FieldLabel>
              <ScheduleSalesOrderPicker
                id={id("so")}
                data={siteData}
                clientId={row.clientId}
                value={row.salesOrderNo}
                onValueChange={(value) => onChange({ salesOrderNo: value })}
                disabled={disabled}
              />
              {/* Said where the empty field is, not only when Continue won't
                  move: the reason it's mandatory isn't obvious from the form. */}
              {row.clientId && !row.salesOrderNo && (
                <p className="text-xs text-muted-foreground">
                  Required — this crew&rsquo;s wages for the day are split
                  across the jobs they were on, and this is the job.
                </p>
              )}
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="col-span-2">
              <Input
                aria-label={`Date for schedule ${index + 1}`}
                type="date"
                value={row.date}
                min={minDate}
                onChange={(event) => onChange({ date: event.target.value })}
                disabled={disabled}
              />
            </div>
            <Input
              aria-label={`Start time for schedule ${index + 1}`}
              type="time"
              value={row.startTime}
              onChange={(event) => onChange({ startTime: event.target.value })}
              disabled={disabled}
            />
            <Input
              aria-label={`End time for schedule ${index + 1}`}
              type="time"
              value={row.endTime}
              onChange={(event) => onChange({ endTime: event.target.value })}
              disabled={disabled}
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Duration</span>
            {DURATION_PRESETS.map((preset) => (
              <Button
                key={preset.label}
                type="button"
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs"
                disabled={disabled || !row.startTime}
                onClick={() =>
                  onChange({
                    endTime: addMinutesToTime(row.startTime, preset.minutes),
                  })
                }
              >
                {preset.label}
              </Button>
            ))}
            {length > 0 && (
              <span className="text-xs text-muted-foreground">
                {formatShiftLength(length)}
              </span>
            )}
          </div>

          {/* Caution, not a block. Recording work that already started is a
              real thing to do — a crew phoned out at eight and entered at ten —
              and refusing it would leave those hours charged to no job at all.
              What this catches is the typo: 08:00 when 20:00 was meant. */}
          {startedAlready && (
            <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-px size-3.5 shrink-0" />
              <span>
                It&rsquo;s already {minTime}, so this starts in the past. Fine if
                you&rsquo;re recording work already under way — check the time if
                you aren&rsquo;t.
              </span>
            </p>
          )}

          {/* An end before the start is a night shift and perfectly legal — but
              it is also what a typo looks like, so it is spelled out here where
              it can be checked before saving. */}
          {overnight && (
            <p className="flex items-center gap-1.5 text-xs text-violet-700 dark:text-violet-400">
              <MoonStar className="size-3.5 shrink-0" />
              Overnight — finishes the next day at {row.endTime}
            </p>
          )}

          {/* Unnamed on purpose — the row travels in the JSON field below, and
              twenty named pickers would submit one indistinguishable heap of
              `workTypes` keys. */}
          <ScheduleWorkTypePicker
            name=""
            selected={row.workTypes}
            onChange={(workTypes) => onChange({ workTypes })}
            disabled={disabled}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={id("contactPerson")}>
                On-site contact
              </FieldLabel>
              <Input
                id={id("contactPerson")}
                value={row.contactPerson}
                onChange={(event) =>
                  onChange({ contactPerson: event.target.value })
                }
                placeholder="Who meets the crew"
                disabled={disabled}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={id("contactNumber")}>
                Contact number
              </FieldLabel>
              <Input
                id={id("contactNumber")}
                value={row.contactNumber}
                onChange={(event) =>
                  onChange({ contactNumber: event.target.value })
                }
                placeholder="0917 123 4567"
                inputMode="tel"
                disabled={disabled}
              />
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor={id("remarks")}>Remarks</FieldLabel>
            <Textarea
              id={id("remarks")}
              value={row.remarks}
              onChange={(event) => onChange({ remarks: event.target.value })}
              rows={2}
              maxLength={2000}
              placeholder="Optional — access instructions, unit numbers, tools to bring…"
              disabled={disabled}
              className="resize-y"
            />
          </Field>
        </div>
      )}

      {problems.length > 0 && (
        <div className="flex flex-col gap-1 border-t bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {problems.map((problem) => (
            <span key={problem} className="flex items-start gap-1.5">
              <AlertTriangle className="mt-px size-3.5 shrink-0" />
              <span className="min-w-0">{problem}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

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
  const [state, action, pending] = useActionState<ScheduleBatchState, FormData>(
    createSchedules,
    undefined
  )

  const [step, setStep] = useState(1)
  const [crew, setCrew] = useState<string[]>([])
  const [rows, setRows] = useState<Row[]>(() => [newRow(slot)])
  const [openRow, setOpenRow] = useState<string | null>(null)
  // Bumping this remounts the employee picker, which owns its own checkbox
  // state — reseeding otherwise leaves the last batch's crew ticked.
  const [pickerKey, setPickerKey] = useState(0)

  // Tracks the slot the dialog was last opened with, so re-opening on a
  // different day reseeds the form without an effect firing on every render.
  const openedWithRef = useRef<ScheduleSlot | null>(null)
  // The last result acted on. `rows` has to be in this effect's dependencies
  // to be read from it — but a rejected batch must be handled once, not again
  // on every keystroke that follows it, so the guard is what makes the re-runs
  // no-ops. Written inside the effect, never during render.
  const handledRef = useRef<ScheduleBatchState>(undefined)

  useEffect(() => {
    if (!state || handledRef.current === state) return
    handledRef.current = state

    if (state.success) {
      onOpenChange(false)
      return
    }
    const failed = state.errors
    if (!failed) return
    // Crew problems are step 1; everything else is a row, which is step 2.
    if (failed.employeeIds?.length) {
      setStep(1)
      return
    }
    if (failed.rows?.length || failed.row) {
      setStep(2)
      // Open the first row that needs attention — a rejected batch with every
      // row shut says "check the highlighted schedules" and shows nothing you
      // can act on.
      const first = Object.keys(failed.row ?? {})
        .map(Number)
        .sort((a, b) => a - b)[0]
      const target = first === undefined ? undefined : rows[first]
      if (target) setOpenRow(target.key)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, rows])

  useEffect(() => {
    if (!open || openedWithRef.current === slot) return
    openedWithRef.current = slot
    const seed = newRow(slot)
    setStep(1)
    setCrew([])
    setRows([seed])
    setOpenRow(seed.key)
    setPickerKey((key) => key + 1)
  }, [open, slot])

  // Read on each open rather than held in state: the dialog can be left sitting
  // on a phone overnight, and the floor has to be the day it is submitted on,
  // not the day it was opened on.
  const minDate = todayKey()
  // Read on every render rather than ticked: the fields re-render as they are
  // typed in, which is exactly when this matters, and the server holds the
  // real floor at submit either way.
  const minTime = nowTimeKey()

  // One fetch per distinct client across the whole batch, not one per row.
  const clientIds = useMemo(() => rows.map((row) => row.clientId), [rows])
  const siteData = useClientSiteData(clientIds)

  // Every block the crew would be taken for, so the picker can mark someone
  // busy on any day of the batch — not just the first.
  const ranges = useMemo(
    () =>
      rows.map((row) => ({
        start: combineDateTime(row.date, row.startTime),
        end: scheduleEndsAt(row.date, row.startTime, row.endTime),
      })),
    [rows]
  )

  // Skill matching is per person, not per row, so the picker sees everything
  // the batch involves and promotes whoever is qualified for any of it.
  const allWorkTypes = useMemo(() => {
    const seen = new Set<WorkType>()
    for (const row of rows) for (const type of row.workTypes) seen.add(type)
    return [...seen]
  }, [rows])

  const rowErrors = state?.errors?.row ?? {}

  function patchRow(key: string, patch: Partial<Row>) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row))
    )
  }

  function pushRow(build: (from: Row) => Row) {
    if (rows.length >= MAX_ROWS) return
    const next = build(rows[rows.length - 1])
    setRows((current) => [...current, next])
    setOpenRow(next.key)
  }

  // "Add another job" is the crew's next stop on the same day, so the day
  // stands and the hours pick up where the last job finished.
  //
  // The client is dropped on purpose: you add a row because the next job is
  // somebody else's. Everything that hangs off that client goes with it — its
  // site, its sales order, the person meeting the crew at that gate, and
  // remarks that describe how to get into a building the crew is no longer
  // going to. Only the work carries over, because a crew out for the day is
  // usually out doing the same thing.
  function addRow() {
    pushRow((from) =>
      newRow({
        date: from.date,
        ...(nextShift(from) ?? {
          startTime: from.startTime,
          endTime: from.endTime,
        }),
        workTypes: from.workTypes,
      })
    )
  }

  // Duplicate is the other half: this same job, at this same client, on the
  // next day — a standing visit, entered once and moved along.
  function duplicateRow(source: Row) {
    const parsed = parseDateKey(source.date)
    pushRow(() =>
      newRow({
        ...source,
        date: parsed ? dateKey(addDays(parsed, 1)) : source.date,
      })
    )
  }

  // Everything a row needs before it is worth sending. Deliberately shallow —
  // the real rules (past dates, shift length, clashes, whose branch that is)
  // belong to the server, the only place that can check them against what else
  // is booked.
  const rowsReady = rows.every(
    (row) =>
      row.clientId &&
      row.salesOrderNo &&
      row.date &&
      row.startTime &&
      row.endTime &&
      row.workTypes.length > 0
  )
  const canContinue = step === 2 ? rowsReady : true

  const clientName = (id: string) =>
    clients.find((client) => client.id === id)?.name ?? "No client"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Header, stepper and footer stay put while only the fields scroll — on
          a phone the whole dialog scrolling means Continue sits below every
          field, so the primary action is never in reach. `minmax(0, 1fr)` is
          what lets the middle row shrink below its content instead of pushing
          the footer off the bottom. */}
      <DialogContent className="grid max-h-[calc(100dvh-2rem)] grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-3 overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-sky-600/10">
              <CalendarPlus className="size-5 text-sky-600 dark:text-sky-400" />
            </div>
            <div className="min-w-0">
              <DialogTitle>Create schedules</DialogTitle>
              <DialogDescription className="text-xs">
                Pick the crew once, then book every job they&rsquo;re on —
                across as many clients as you need.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Stepper sits in its own bordered, tinted bar so it reads as
            navigation chrome rather than part of the form below it. */}
        <div className="flex items-center gap-1 overflow-x-auto rounded-xl border bg-muted/40 px-3 py-2.5">
          {STEPS.map((entry, index) => (
            <Fragment key={entry.id}>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
                    step === entry.id && "border-sky-600 bg-sky-600 text-white",
                    step > entry.id &&
                      "border-sky-600 bg-sky-600/10 text-sky-700 dark:text-sky-400",
                    step < entry.id &&
                      "border-border bg-background text-muted-foreground"
                  )}
                >
                  {step > entry.id ? <Check className="size-3.5" /> : entry.id}
                </span>
                <span
                  className={cn(
                    "text-sm whitespace-nowrap transition-colors",
                    step === entry.id
                      ? "font-medium text-foreground"
                      : "hidden text-muted-foreground sm:inline"
                  )}
                >
                  {entry.label}
                </span>
              </div>
              {index < STEPS.length - 1 && (
                <div
                  className={cn(
                    "mx-1 h-px w-3 shrink-0 sm:mx-1.5 sm:w-6",
                    step > entry.id ? "bg-sky-600" : "bg-border"
                  )}
                />
              )}
            </Fragment>
          ))}
        </div>

        <div className="-mx-1 min-h-0 overflow-y-auto px-1 py-0.5">
          <form action={action} id="create-schedules-form">
            {/* The rows travel as one JSON field rather than repeated form
                keys: each row carries a *list* of work types, and repeated keys
                give no way to tell which row a given value belongs to. */}
            <input
              type="hidden"
              name="rows"
              value={JSON.stringify(
                rows.map((row): RowPayload => {
                  const { key, branchLabel, ...payload } = row
                  void key
                  void branchLabel
                  return payload
                })
              )}
            />

            {/* Step 1 — the crew, the one thing the whole batch shares */}
            <div className={cn("flex flex-col gap-4", step !== 1 && "hidden")}>
              <Field data-invalid={!!state?.errors?.employeeIds}>
                <FieldLabel htmlFor="new-schedule-crew">
                  Crew
                  <span className="text-xs font-normal text-muted-foreground">
                    They&rsquo;ll be on every schedule in this batch
                  </span>
                </FieldLabel>
                <ScheduleEmployeePicker
                  key={pickerKey}
                  employees={employees}
                  busy={busy}
                  workTypes={allWorkTypes}
                  ranges={ranges}
                  onSelectionChange={setCrew}
                  disabled={pending}
                />
                <FieldError
                  errors={state?.errors?.employeeIds?.map((message) => ({
                    message,
                  }))}
                />
              </Field>

              <p className="rounded-lg bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
                Next you&rsquo;ll add the jobs. Each one carries its own client,
                site, sales order and on-site contact — these people go on all
                of them.
              </p>
            </div>

            {/* Step 2 — the jobs */}
            <div className={cn("flex flex-col gap-2.5", step !== 2 && "hidden")}>
              {rows.map((row, index) => (
                <ScheduleRowCard
                  key={row.key}
                  row={row}
                  index={index}
                  count={rows.length}
                  clients={clients}
                  siteData={siteData}
                  minDate={minDate}
                  minTime={minTime}
                  problems={rowErrors[index] ?? []}
                  open={openRow === row.key}
                  disabled={pending}
                  onToggle={() =>
                    setOpenRow((current) =>
                      current === row.key ? null : row.key
                    )
                  }
                  onChange={(patch) => patchRow(row.key, patch)}
                  onDuplicate={() => duplicateRow(row)}
                  onRemove={() =>
                    setRows((current) =>
                      current.filter((entry) => entry.key !== row.key)
                    )
                  }
                />
              ))}

              <div className="flex items-center justify-between gap-2 pt-0.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addRow()}
                  disabled={pending || rows.length >= MAX_ROWS}
                >
                  <Plus />
                  Add another job
                </Button>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {rows.length} of {MAX_ROWS}
                </span>
              </div>

              {state?.errors?.rows?.map((message) => (
                <p key={message} className="text-sm text-destructive">
                  {message}
                </p>
              ))}
            </div>

            {/* Step 3 — what is actually about to be written, said back before
                it is. Two steps in, the crew picked at the start has scrolled
                out of anybody's head. */}
            <div className={cn("flex flex-col gap-3", step !== 3 && "hidden")}>
              <div className="rounded-xl border bg-card p-4">
                <p className="text-sm font-medium">Crew</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {crew.length === 0
                    ? "Nobody assigned"
                    : employees
                        .filter((employee) => crew.includes(employee.id))
                        .map(
                          (employee) =>
                            `${employee.firstName} ${employee.lastName}`
                        )
                        .join(", ")}
                </p>

                {/* An unassigned job is a real thing to create — the schedules
                    page counts them — but it is worth saying out loud rather
                    than discovering on the calendar tomorrow. */}
                {crew.length === 0 && (
                  <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                    These will be created as unassigned jobs — you can deploy a
                    crew later from the calendar.
                  </p>
                )}
              </div>

              <div className="rounded-xl border bg-card p-4">
                <p className="text-sm font-medium">
                  {rows.length} schedule{rows.length === 1 ? "" : "s"}
                </p>
                <ul className="mt-3 flex flex-col divide-y">
                  {rows.map((row, index) => (
                    <li key={row.key} className="flex flex-col gap-0.5 py-2">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate text-sm font-medium">
                          {index + 1}. {clientName(row.clientId)}
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {dayLabel(row.date)} · {row.startTime}–{row.endTime}
                        </span>
                      </div>
                      <span className="truncate text-xs text-muted-foreground">
                        {row.branchLabel}
                        {row.salesOrderNo && ` · SO ${row.salesOrderNo}`}
                        {row.workTypes.length > 0 &&
                          ` · ${row.workTypes
                            .map((type) => WORK_TYPE_LABELS[type])
                            .join(", ")}`}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {row.contactPerson || row.contactNumber
                          ? `Contact: ${[row.contactPerson, row.contactNumber]
                              .filter(Boolean)
                              .join(" · ")}`
                          : "No on-site contact"}
                      </span>
                      {(rowErrors[index] ?? []).map((problem) => (
                        <span key={problem} className="text-xs text-destructive">
                          {problem}
                        </span>
                      ))}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {state?.message && (
              <p className="mt-3 text-sm text-destructive">{state.message}</p>
            )}
          </form>
        </div>

        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <span className="font-mono text-xs text-muted-foreground">
            Step {step} of {STEPS.length}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                step === 1 ? onOpenChange(false) : setStep(step - 1)
              }
              disabled={pending}
            >
              {step === 1 ? (
                "Cancel"
              ) : (
                <>
                  <ChevronLeft />
                  Back
                </>
              )}
            </Button>
            {/* Distinct keys matter: without them React reuses one DOM node
                across the swap, so the click that advances to the last step
                turns the very same node into a submit button and the browser's
                default action fires the form before you've reviewed it. */}
            {step < STEPS.length ? (
              <Button
                key="continue"
                type="button"
                onClick={() => setStep(step + 1)}
                disabled={pending || !canContinue}
              >
                Continue
                <ChevronRight />
              </Button>
            ) : (
              <Button
                key="submit"
                type="submit"
                form="create-schedules-form"
                disabled={pending}
              >
                <Check />
                {pending
                  ? "Creating…"
                  : `Create ${rows.length} schedule${rows.length === 1 ? "" : "s"}`}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
