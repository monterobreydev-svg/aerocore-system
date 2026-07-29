"use client"

import { useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, Plus } from "lucide-react"
import {
  WORK_TYPES,
  WORK_TYPE_LABELS,
  WORK_TYPE_SOLID,
  addDays,
  addMonths,
  dateKey,
  isSameDay,
  startOfDay,
  startOfWeek,
  type EmployeeBusyBlock,
} from "@/lib/schedule"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScheduleTable } from "@/components/admin/schedule-table"
import { ScheduleMonthView } from "@/components/admin/schedule-calendar"
import { ScheduleTimeGrid } from "@/components/admin/schedule-time-grid"
import { ScheduleDetailSheet } from "@/components/admin/schedule-detail-sheet"
import {
  CreateScheduleDialog,
  defaultSlot,
  type ScheduleSlot,
} from "@/components/admin/create-schedule-dialog"
import type {
  ClientOption,
  EmployeeOption,
  ScheduleRecord,
} from "@/components/admin/schedule-types"

type View = "month" | "week" | "day" | "list"

const VIEWS: { value: View; label: string; short: string }[] = [
  { value: "month", label: "Month", short: "M" },
  { value: "week", label: "Week", short: "W" },
  { value: "day", label: "Day", short: "D" },
  { value: "list", label: "List", short: "L" },
]

function rangeLabel(view: View, cursor: Date) {
  if (view === "month") {
    return cursor.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    })
  }
  if (view === "day") {
    return cursor.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }
  if (view === "week") {
    const start = startOfWeek(cursor)
    const end = addDays(start, 6)
    const sameMonth = start.getMonth() === end.getMonth()
    return `${start.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    })} – ${end.toLocaleDateString(undefined, {
      month: sameMonth ? undefined : "short",
      day: "numeric",
      year: "numeric",
    })}`
  }
  return "All schedules"
}

export function SchedulesView({
  schedules,
  clients,
  employees,
  busy,
}: {
  schedules: ScheduleRecord[]
  clients: ClientOption[]
  employees: EmployeeOption[]
  busy: EmployeeBusyBlock[]
}) {
  const [view, setView] = useState<View>("month")
  const [cursor, setCursor] = useState(() => startOfDay(new Date()))
  const [selected, setSelected] = useState<ScheduleRecord | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [slot, setSlot] = useState<ScheduleSlot>(() =>
    defaultSlot(dateKey(new Date()))
  )

  // Opening the booking dialog from anywhere: the toolbar button uses the day
  // the calendar is on, a month cell uses that day, a time-grid cell uses that
  // day and hour. A fresh object each time so the dialog reseeds its form.
  function openCreate(day: Date, hour?: number) {
    setSlot(
      hour === undefined
        ? defaultSlot(dateKey(day))
        : {
            date: dateKey(day),
            startTime: `${String(hour).padStart(2, "0")}:00`,
            endTime: `${String(Math.min(hour + 2, 23)).padStart(2, "0")}:00`,
          }
    )
    setCreateOpen(true)
  }

  const weekDays = useMemo(() => {
    const start = startOfWeek(cursor)
    return Array.from({ length: 7 }, (_, i) => addDays(start, i))
  }, [cursor])

  const dayCount = useMemo(
    () =>
      schedules.filter((schedule) => isSameDay(new Date(schedule.date), cursor))
        .length,
    [schedules, cursor]
  )

  function step(direction: -1 | 1) {
    setCursor((current) => {
      if (view === "month") return addMonths(current, direction)
      if (view === "week") return addDays(current, direction * 7)
      return addDays(current, direction)
    })
  }

  function handleSelect(schedule: ScheduleRecord) {
    setSelected(schedule)
    setSheetOpen(true)
  }

  function openDay(day: Date) {
    setCursor(startOfDay(day))
    setView("day")
  }

  const visibleCount =
    view === "month"
      ? schedules.filter(
          (s) =>
            new Date(s.date).getMonth() === cursor.getMonth() &&
            new Date(s.date).getFullYear() === cursor.getFullYear()
        ).length
      : view === "week"
        ? schedules.filter((s) =>
            weekDays.some((day) => isSameDay(new Date(s.date), day))
          ).length
        : view === "day"
          ? dayCount
          : schedules.length

  return (
    <div className="flex flex-col gap-3">
      {/* Row 1 on mobile: date range + booking. Row 2: navigation + view
          switch. On desktop it all collapses onto one line. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 sm:order-2 sm:flex-none">
          <p className="truncate text-sm font-semibold">
            {rangeLabel(view, cursor)}
          </p>
          <p className="text-xs text-muted-foreground">
            {visibleCount} {visibleCount === 1 ? "job" : "jobs"}
          </p>
        </div>

        {view !== "list" && (
          <div className="order-2 flex items-center gap-1 sm:order-1">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Previous"
              onClick={() => step(-1)}
            >
              <ChevronLeft />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCursor(startOfDay(new Date()))}
            >
              Today
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Next"
              onClick={() => step(1)}
            >
              <ChevronRight />
            </Button>
          </div>
        )}

        <div className="order-2 flex items-center gap-0.5 rounded-lg border p-0.5 sm:order-3 sm:ml-auto">
          {VIEWS.map((option) => (
            <Button
              key={option.value}
              type="button"
              variant={view === option.value ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2 sm:px-2.5"
              aria-label={option.label}
              aria-pressed={view === option.value}
              onClick={() => setView(option.value)}
            >
              <span className="sm:hidden">{option.short}</span>
              <span className="hidden sm:inline">{option.label}</span>
            </Button>
          ))}
        </div>

        <div className="order-1 ml-auto sm:order-4 sm:ml-0">
          <Button type="button" onClick={() => openCreate(cursor)}>
            <Plus />
            New schedule
          </Button>
        </div>
      </div>

      {/* Colour key — the calendar is colour-first now, so the mapping has to
          be stated somewhere rather than learned by hovering. */}
      {view !== "list" && (
        <div className="flex flex-wrap items-center gap-1.5">
          {WORK_TYPES.map((type) => (
            <span
              key={type}
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                WORK_TYPE_SOLID[type]
              )}
            >
              {WORK_TYPE_LABELS[type]}
            </span>
          ))}
        </div>
      )}

      {view === "month" && (
        <ScheduleMonthView
          cursor={cursor}
          schedules={schedules}
          onSelect={handleSelect}
          onOpenDay={openDay}
          onCreateAt={(day) => openCreate(day)}
        />
      )}

      {view === "week" && (
        <ScheduleTimeGrid
          days={weekDays}
          schedules={schedules}
          onSelect={handleSelect}
          onCreateAt={openCreate}
        />
      )}

      {view === "day" && (
        <>
          <ScheduleTimeGrid
            days={[cursor]}
            schedules={schedules}
            onSelect={handleSelect}
            onCreateAt={openCreate}
          />
          {dayCount === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nothing booked for this day.
            </p>
          )}
        </>
      )}

      {view === "list" && (
        <ScheduleTable schedules={schedules} onSelect={handleSelect} />
      )}

      {view !== "list" && schedules.length === 0 && (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          No jobs booked yet. Use “New schedule” to book the first one.
        </div>
      )}

      <CreateScheduleDialog
        clients={clients}
        employees={employees}
        busy={busy}
        open={createOpen}
        onOpenChange={setCreateOpen}
        slot={slot}
      />

      <ScheduleDetailSheet
        schedule={selected}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        clients={clients}
        employees={employees}
        busy={busy}
      />
    </div>
  )
}
