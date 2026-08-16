"use client"

import { useEffect, useMemo, useState } from "react"
import { MapPin, MoonStar } from "lucide-react"
import type { ScheduleStatus, WorkType } from "@/app/generated/prisma/client"
import { listBranches } from "@/app/actions/schedules"
import {
  SCHEDULE_STATUSES,
  SCHEDULE_STATUS_LABELS,
  combineDateTime,
  crossesMidnight,
  scheduleEndsAt,
  shiftMinutes,
  type EmployeeBusyBlock,
} from "@/lib/schedule"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { SearchSelect } from "@/components/ui/search-select"
import { ScheduleEmployeePicker } from "@/components/admin/schedule-employee-picker"
import { ScheduleWorkTypePicker } from "@/components/admin/schedule-worktype-picker"
import type {
  BranchOption,
  ClientOption,
  EmployeeOption,
} from "@/components/admin/schedule-types"

// The five fields worth carrying over when creating schedule after schedule —
// employees usually work one client's sites across a day, so re-picking them
// is the single biggest time sink in bulk entry.
export type ScheduleContext = {
  clientId: string
  branchId: string
  date: string
  startTime: string
  endTime: string
}

// Stable identity so the memo below does not rebuild on every render.
const NO_BRANCHES: BranchOption[] = []

type FieldErrors = Partial<Record<string, string[]>>

const DURATION_PRESETS = [
  { label: "2h", minutes: 120 },
  { label: "4h", minutes: 240 },
  { label: "8h", minutes: 480 },
]

/** "13h" or "9h 30m" — the length, said the way a person would say it. */
function formatShiftLength(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}

function addMinutesToTime(time: string, minutes: number) {
  const [hours, mins] = time.split(":").map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return ""
  const total = Math.min(hours * 60 + mins + minutes, 23 * 60 + 59)
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(
    total % 60
  ).padStart(2, "0")}`
}

// Compact section heading — a rule with a label rather than an icon tile, so
// four sections fit a phone screen without the chrome outweighing the fields.
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {title}
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>
      {children}
    </section>
  )
}

export function ScheduleFormFields({
  idPrefix,
  clients,
  employees,
  busy,
  context,
  onContextChange,
  errors,
  pending,
  scheduleId,
  minDate,
  defaultWorkTypes = [],
  defaultEmployeeIds = [],
  defaultContactPerson = "",
  defaultContactNumber = "",
  defaultRemarks = "",
  defaultStatus,
  showStatus = false,
}: {
  idPrefix: string
  clients: ClientOption[]
  employees: EmployeeOption[]
  busy: EmployeeBusyBlock[]
  context: ScheduleContext
  onContextChange: (patch: Partial<ScheduleContext>) => void
  errors?: FieldErrors
  pending: boolean
  scheduleId?: string
  /**
   * Earliest day the picker will offer, as `YYYY-MM-DD`.
   *
   * Set when creating, left off when editing: a job that already happened is
   * still edited on the day it happened, so a floor there would lock the form
   * of every past job the office needs to close out.
   */
  minDate?: string
  defaultWorkTypes?: WorkType[]
  defaultEmployeeIds?: string[]
  defaultContactPerson?: string
  defaultContactNumber?: string
  defaultRemarks?: string
  defaultStatus?: ScheduleStatus
  showStatus?: boolean
}) {
  // Held here rather than inside the picker so the employee list below can
  // promote whoever holds the matching skill as soon as a work type is ticked.
  const [workTypes, setWorkTypes] = useState<WorkType[]>(defaultWorkTypes)

  const selectedClient = clients.find((client) => client.id === context.clientId)

  // Branches arrive on demand rather than with the page — see listBranches().
  // Held as a cache keyed by client so switching back to one already looked at
  // costs nothing.
  //
  // Both the list and the loading flag are *derived* from that cache rather
  // than stored separately: there's no state to push, so the effect only ever
  // fetches, and an empty selection needs no effect at all.
  const [branchCache, setBranchCache] = useState<
    Record<string, BranchOption[]>
  >({})
  const branches = context.clientId
    ? (branchCache[context.clientId] ?? NO_BRANCHES)
    : NO_BRANCHES
  const loadingBranches =
    Boolean(context.clientId) && !branchCache[context.clientId]

  useEffect(() => {
    const clientId = context.clientId
    if (!clientId || branchCache[clientId]) return

    let cancelled = false
    listBranches(clientId).then((rows) => {
      if (!cancelled) {
        setBranchCache((current) => ({ ...current, [clientId]: rows }))
      }
    })
    return () => {
      cancelled = true
    }
  }, [context.clientId, branchCache])

  const clientOptions = useMemo(
    () =>
      clients.map((client) => ({
        value: client.id,
        label: client.name,
        hint: client.address,
      })),
    [clients]
  )

  // A client with a hundred branches is the case this has to survive, hence a
  // filtering combobox rather than a scrolling list. "Head office" is a real
  // option, not a blank — scheduling against the main address is common.
  const branchOptions = useMemo(
    () => [
      {
        value: "",
        label: "Head office",
        hint: selectedClient?.address ?? "Main address",
      },
      ...branches.map((branch) => ({
        value: branch.id,
        label: branch.name,
        hint: branch.address,
      })),
    ],
    [branches, selectedClient]
  )

  const address = context.branchId
    ? branches.find((branch) => branch.id === context.branchId)?.address
    : selectedClient?.address

  const start = combineDateTime(context.date, context.startTime)
  // The employee picker checks for clashes against this, so it has to be the
  // real end — a night shift's end is on the next day, not eleven hours before
  // its own start.
  const end = scheduleEndsAt(context.date, context.startTime, context.endTime)

  const overnight =
    Boolean(context.startTime && context.endTime) &&
    crossesMidnight(context.startTime, context.endTime)
  const shiftLength =
    context.startTime && context.endTime
      ? shiftMinutes(context.startTime, context.endTime)
      : 0
  const nextDayLabel = end
    ? end.toLocaleDateString("en-PH", { weekday: "long" })
    : ""

  return (
    <div className="flex flex-col gap-4">
      <Section title="Site">
        <FieldGroup className="gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field data-invalid={!!errors?.clientId}>
              <FieldLabel htmlFor={`${idPrefix}-clientId`}>Client</FieldLabel>
              <SearchSelect
                id={`${idPrefix}-clientId`}
                name="clientId"
                options={clientOptions}
                value={context.clientId}
                onValueChange={(value) =>
                  onContextChange({ clientId: value, branchId: "" })
                }
                placeholder="Select a client"
                searchPlaceholder="Search clients…"
                emptyMessage="No client matches that."
                disabled={pending}
              />
              <FieldError
                errors={errors?.clientId?.map((message) => ({ message }))}
              />
            </Field>

            <Field data-invalid={!!errors?.branchId}>
              <FieldLabel htmlFor={`${idPrefix}-branchId`}>
                Branch
                {branches.length > 0 && (
                  <span className="text-xs font-normal text-muted-foreground">
                    {branches.length} available
                  </span>
                )}
              </FieldLabel>
              <SearchSelect
                id={`${idPrefix}-branchId`}
                name="branchId"
                options={branchOptions}
                value={context.branchId}
                onValueChange={(value) => onContextChange({ branchId: value })}
                placeholder={
                  !context.clientId
                    ? "Pick a client first"
                    : loadingBranches
                      ? "Loading branches…"
                      : "Head office"
                }
                searchPlaceholder="Search branches…"
                emptyMessage="No branch matches that."
                disabled={pending || !context.clientId}
              />
              <FieldError
                errors={errors?.branchId?.map((message) => ({ message }))}
              />
            </Field>
          </div>

          {address && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <MapPin className="mt-0.5 size-3 shrink-0" />
              <span className="min-w-0">{address}</span>
            </p>
          )}
        </FieldGroup>
      </Section>

      <Section title="When">
        <FieldGroup className="gap-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field data-invalid={!!errors?.date} className="col-span-2 sm:col-span-2">
              <FieldLabel htmlFor={`${idPrefix}-date`}>Date</FieldLabel>
              <Input
                id={`${idPrefix}-date`}
                name="date"
                type="date"
                value={context.date}
                min={minDate}
                onChange={(event) =>
                  onContextChange({ date: event.target.value })
                }
                disabled={pending}
                required
              />
              {/* Said once, next to the field, rather than only after a
                  rejected submit — the picker greys the days out but gives no
                  reason, and a greyed-out calendar with no explanation reads as
                  something broken. */}
              {minDate && !errors?.date && (
                <p className="text-xs text-muted-foreground">
                  Today onwards.
                </p>
              )}
              <FieldError
                errors={errors?.date?.map((message) => ({ message }))}
              />
            </Field>
            <Field data-invalid={!!errors?.startTime}>
              <FieldLabel htmlFor={`${idPrefix}-startTime`}>Start</FieldLabel>
              <Input
                id={`${idPrefix}-startTime`}
                name="startTime"
                type="time"
                value={context.startTime}
                onChange={(event) =>
                  onContextChange({ startTime: event.target.value })
                }
                disabled={pending}
                required
              />
              <FieldError
                errors={errors?.startTime?.map((message) => ({ message }))}
              />
            </Field>
            <Field data-invalid={!!errors?.endTime}>
              <FieldLabel htmlFor={`${idPrefix}-endTime`}>End</FieldLabel>
              <Input
                id={`${idPrefix}-endTime`}
                name="endTime"
                type="time"
                value={context.endTime}
                onChange={(event) =>
                  onContextChange({ endTime: event.target.value })
                }
                disabled={pending}
                required
              />
              <FieldError
                errors={errors?.endTime?.map((message) => ({ message }))}
              />
            </Field>
          </div>

          {/* What was actually typed, said back. An end before the start is a
              night shift and perfectly legal — but it is also what a typo looks
              like, so the length and the day it finishes on are spelled out
              here where they can be checked before saving. */}
          {shiftLength > 0 && (
            <p
              className={cn(
                "flex items-center gap-1.5 text-xs",
                overnight
                  ? "text-violet-700 dark:text-violet-400"
                  : "text-muted-foreground"
              )}
            >
              {overnight && <MoonStar className="size-3.5 shrink-0" />}
              {overnight
                ? `Overnight — ends ${nextDayLabel} at ${context.endTime}`
                : "Same day"}
              <span className="text-muted-foreground">
                · {formatShiftLength(shiftLength)}
              </span>
            </p>
          )}

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Duration</span>
            {DURATION_PRESETS.map((preset) => (
              <Button
                key={preset.label}
                type="button"
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs"
                disabled={pending || !context.startTime}
                onClick={() =>
                  onContextChange({
                    endTime: addMinutesToTime(context.startTime, preset.minutes),
                  })
                }
              >
                {preset.label}
              </Button>
            ))}
            {showStatus && (
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Status</span>
                <Select
                  name="status"
                  defaultValue={defaultStatus}
                  disabled={pending}
                  items={Object.fromEntries(
                    SCHEDULE_STATUSES.map((status) => [
                      status,
                      SCHEDULE_STATUS_LABELS[status],
                    ])
                  )}
                >
                  <SelectTrigger id={`${idPrefix}-status`} className="h-7">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SCHEDULE_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {SCHEDULE_STATUS_LABELS[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </FieldGroup>
      </Section>

      <Section title="Work">
        <Field data-invalid={!!errors?.workTypes}>
          <ScheduleWorkTypePicker
            selected={workTypes}
            onChange={setWorkTypes}
            disabled={pending}
          />
          <FieldError
            errors={errors?.workTypes?.map((message) => ({ message }))}
          />
        </Field>
      </Section>

      <Section title="Employees">
        <Field data-invalid={!!errors?.employeeIds}>
          <ScheduleEmployeePicker
            employees={employees}
            busy={busy}
            workTypes={workTypes}
            start={start}
            end={end}
            excludeScheduleId={scheduleId}
            defaultSelectedIds={defaultEmployeeIds}
            disabled={pending}
          />
          <FieldError
            errors={errors?.employeeIds?.map((message) => ({ message }))}
          />
        </Field>
      </Section>

      <Section title="On-site contact">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field data-invalid={!!errors?.contactPerson}>
            <Input
              id={`${idPrefix}-contactPerson`}
              name="contactPerson"
              placeholder="Who meets the employees"
              defaultValue={defaultContactPerson}
              disabled={pending}
            />
            <FieldError
              errors={errors?.contactPerson?.map((message) => ({ message }))}
            />
          </Field>
          <Field data-invalid={!!errors?.contactNumber}>
            <Input
              id={`${idPrefix}-contactNumber`}
              name="contactNumber"
              placeholder="0917 123 4567"
              inputMode="tel"
              defaultValue={defaultContactNumber}
              disabled={pending}
            />
            <FieldError
              errors={errors?.contactNumber?.map((message) => ({ message }))}
            />
          </Field>
        </div>
      </Section>

      <Section title="Remarks">
        <Field data-invalid={!!errors?.remarks}>
          <Textarea
            id={`${idPrefix}-remarks`}
            name="remarks"
            rows={2}
            maxLength={2000}
            placeholder="Optional — access instructions, unit numbers, tools to bring…"
            defaultValue={defaultRemarks}
            disabled={pending}
            className="resize-y"
          />
          <FieldError
            errors={errors?.remarks?.map((message) => ({ message }))}
          />
        </Field>
      </Section>
    </div>
  )
}
