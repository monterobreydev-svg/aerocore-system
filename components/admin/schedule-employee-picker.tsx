"use client"

import { useMemo, useState } from "react"
import { AlertTriangle, Check, Search, Sparkles, X } from "lucide-react"
import type { WorkType } from "@/app/generated/prisma/client"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import { skillMatchCount } from "@/lib/employee"
import {
  findBusyConflicts,
  formatTime,
  formatTimeRange,
  isSameDay,
  type EmployeeBusyBlock,
} from "@/lib/schedule"
import type { EmployeeOption } from "@/components/admin/schedule-types"

function initials(first: string, last: string) {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase()
}

/**
 * "8:00 AM – 10:00 AM" — the whole block they're taken for.
 *
 * The start on its own doesn't answer the question being asked. "Busy 8:00 AM"
 * gives no way to tell a two-hour service call from a full day on site, so the
 * only way to know whether the person could still take this job was to open the
 * other one. The full range was in the `title` all along — a tooltip, which on
 * the phones this is used on doesn't exist.
 */
function busyLabel(block: EmployeeBusyBlock) {
  // A night shift ends on the following day, and "8:00 PM – 6:00 AM" reads as
  // going backwards unless that's said out loud.
  const overnight = !isSameDay(new Date(block.start), new Date(block.end))
  return `${formatTimeRange(block.start, block.end)}${overnight ? " +1d" : ""}`
}

export function ScheduleEmployeePicker({
  employees,
  busy,
  workTypes,
  start,
  end,
  excludeScheduleId,
  defaultSelectedIds = [],
  disabled,
}: {
  employees: EmployeeOption[]
  busy: EmployeeBusyBlock[]
  workTypes: WorkType[]
  start: Date | null
  end: Date | null
  excludeScheduleId?: string
  defaultSelectedIds?: string[]
  disabled?: boolean
}) {
  const [search, setSearch] = useState("")
  const [matchingOnly, setMatchingOnly] = useState(false)
  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(defaultSelectedIds.map((id) => [id, true]))
  )

  const conflictsById = useMemo(() => {
    const map: Record<string, EmployeeBusyBlock[]> = {}
    for (const employee of employees) {
      const hits = findBusyConflicts(
        busy,
        employee.id,
        start,
        end,
        excludeScheduleId
      )
      if (hits.length > 0) map[employee.id] = hits
    }
    return map
  }, [employees, busy, start, end, excludeScheduleId])

  // How many of the job's work types each person is qualified for.
  const matchById = useMemo(() => {
    const map: Record<string, number> = {}
    for (const employee of employees) {
      map[employee.id] = skillMatchCount(employee.skills, workTypes)
    }
    return map
  }, [employees, workTypes])

  const selectedIds = useMemo(
    () => Object.keys(checked).filter((id) => checked[id]),
    [checked]
  )
  const clashingSelected = selectedIds.filter((id) => conflictsById[id])
  const query = search.trim().toLowerCase()
  const hasWorkTypes = workTypes.length > 0
  const qualifiedCount = employees.filter((e) => matchById[e.id] > 0).length

  const visible = employees.filter((employee) => {
    if (matchingOnly && hasWorkTypes && matchById[employee.id] === 0) {
      // Never hide someone already assigned — that would silently drop them
      // from view while their checkbox is still submitting.
      if (!checked[employee.id]) return false
    }
    if (!query) return true
    return `${employee.firstName} ${employee.lastName} ${employee.position} ${employee.skills.join(" ")}`
      .toLowerCase()
      .includes(query)
  })

  // Best fit first: qualified before unqualified, free before busy. Someone
  // who can do the job and is available should never be below someone who
  // can't do either.
  const ordered = [...visible].sort((a, b) => {
    const aBusy = conflictsById[a.id] ? 1 : 0
    const bBusy = conflictsById[b.id] ? 1 : 0
    if (aBusy !== bBusy) return aBusy - bBusy
    if (matchById[b.id] !== matchById[a.id]) {
      return matchById[b.id] - matchById[a.id]
    }
    return a.firstName.localeCompare(b.firstName)
  })

  const availableCount = employees.length - Object.keys(conflictsById).length

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search employee, position or skill"
          disabled={disabled}
          className="h-8 pl-8"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <label
          className={cn(
            "flex cursor-pointer items-center gap-2 text-xs",
            hasWorkTypes ? "text-foreground" : "text-muted-foreground",
            (disabled || !hasWorkTypes) && "pointer-events-none opacity-50"
          )}
        >
          <Checkbox
            checked={matchingOnly}
            onCheckedChange={(value) => setMatchingOnly(!!value)}
            disabled={disabled || !hasWorkTypes}
          />
          <span className="inline-flex items-center gap-1">
            <Sparkles className="size-3" />
            Only employees with matching skills
            {hasWorkTypes && ` (${qualifiedCount})`}
          </span>
        </label>
        {start && end && (
          <span className="text-xs text-muted-foreground">
            {availableCount} of {employees.length} free
          </span>
        )}
      </div>

      {!hasWorkTypes && (
        <p className="text-xs text-muted-foreground">
          Pick a work type above to see who&apos;s qualified.
        </p>
      )}

      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedIds.map((id) => {
            const employee = employees.find((e) => e.id === id)
            if (!employee) return null
            const clash = !!conflictsById[id]
            return (
              <span
                key={id}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2 text-xs font-medium",
                  clash
                    ? "bg-destructive/10 text-destructive"
                    : "bg-sky-600/10 text-sky-700 dark:text-sky-400"
                )}
              >
                {clash && <AlertTriangle className="size-3" />}
                {employee.firstName} {employee.lastName}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    setChecked((prev) => ({ ...prev, [id]: false }))
                  }
                  aria-label={`Remove ${employee.firstName} ${employee.lastName}`}
                  className="rounded-full p-0.5 outline-none hover:bg-foreground/10"
                >
                  <X className="size-3" />
                </button>
              </span>
            )
          })}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-muted-foreground"
            disabled={disabled}
            onClick={() => setChecked({})}
          >
            Clear
          </Button>
        </div>
      )}

      {clashingSelected.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {clashingSelected.length === 1
              ? "One assigned employee is"
              : `${clashingSelected.length} assigned employees are`}{" "}
            already assigned in this time slot. Saving is blocked until you change
            the time or drop them.
          </span>
        </div>
      )}

      <div className="flex max-h-52 flex-col gap-0.5 overflow-y-auto rounded-lg border p-1">
        {ordered.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            {employees.length === 0
              ? "No employees available."
              : "Nobody matches those filters."}
          </p>
        )}

        {ordered.map((employee) => {
          const isChecked = checked[employee.id] ?? false
          const clashes = conflictsById[employee.id]
          const matches = matchById[employee.id]

          return (
            // `relative` is load-bearing, not styling. The input below is
            // `sr-only`, which is `position: absolute` — so without a
            // positioned ancestor here its containing block becomes the
            // *dialog panel* (the nearest positioned ancestor, being
            // `fixed`). Eight hidden inputs then anchor to the panel at their
            // static positions, inflating its scrollable area far past its
            // own content, and clicking a row near the bottom of this list
            // makes the browser scroll that phantom overflow into view: the
            // form jumps back to the top and the panel slides up leaving a
            // band of empty white under the footer.
            <label
              key={employee.id}
              className={cn(
                "relative flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted",
                isChecked && "bg-sky-600/5",
                disabled && "pointer-events-none opacity-60"
              )}
            >
              <input
                type="checkbox"
                name="employeeIds"
                value={employee.id}
                checked={isChecked}
                onChange={(event) =>
                  setChecked((prev) => ({
                    ...prev,
                    [employee.id]: event.target.checked,
                  }))
                }
                disabled={disabled}
                className="sr-only"
              />

              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-medium",
                  isChecked
                    ? "bg-sky-600 text-white"
                    : clashes
                      ? "bg-destructive/10 text-destructive"
                      : "bg-muted text-muted-foreground"
                )}
              >
                {isChecked ? (
                  <Check className="size-3.5" />
                ) : (
                  initials(employee.firstName, employee.lastName)
                )}
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate leading-tight">
                    {employee.firstName} {employee.lastName}
                  </span>
                  {matches > 0 && (
                    <Sparkles
                      className="size-3 shrink-0 text-amber-500"
                      aria-label="Skills match this job"
                    />
                  )}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {hasWorkTypes && matches > 0
                    ? `Matches ${matches} of ${workTypes.length} work ${
                        workTypes.length === 1 ? "type" : "types"
                      }`
                    : employee.position}
                </span>
              </span>

              {clashes ? (
                <Badge
                  className="shrink-0 bg-destructive/10 text-destructive"
                  title={clashes
                    .map(
                      (block) =>
                        `${block.label} · ${formatTime(block.start)}–${formatTime(block.end)}`
                    )
                    .join("\n")}
                >
                  Busy {busyLabel(clashes[0])}
                  {/* Two clashes in one shift is rare but real — a morning
                      call and an afternoon one. Naming the count keeps the
                      badge honest about showing only the first. */}
                  {clashes.length > 1 && ` +${clashes.length - 1} more`}
                </Badge>
              ) : start && end ? (
                <span className="shrink-0 text-xs text-emerald-700 dark:text-emerald-400">
                  Free
                </span>
              ) : null}
            </label>
          )
        })}
      </div>
    </div>
  )
}
