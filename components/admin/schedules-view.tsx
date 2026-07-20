"use client"

import { useState } from "react"
import { CalendarDays, List } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ScheduleTable } from "@/components/admin/schedule-table"
import { ScheduleCalendar } from "@/components/admin/schedule-calendar"
import { ScheduleDetailSheet } from "@/components/admin/schedule-detail-sheet"
import type {
  ClientOption,
  EmployeeOption,
  ScheduleRecord,
} from "@/components/admin/schedule-types"

export function SchedulesView({
  schedules,
  clients,
  employees,
}: {
  schedules: ScheduleRecord[]
  clients: ClientOption[]
  employees: EmployeeOption[]
}) {
  const [view, setView] = useState<"list" | "calendar">("calendar")
  const [selected, setSelected] = useState<ScheduleRecord | null>(null)
  const [open, setOpen] = useState(false)

  function handleSelect(schedule: ScheduleRecord) {
    setSelected(schedule)
    setOpen(true)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1 self-start rounded-lg border bg-muted/30 p-0.5">
        <Button
          type="button"
          variant={view === "calendar" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setView("calendar")}
          className={cn(view !== "calendar" && "text-muted-foreground")}
        >
          <CalendarDays />
          Calendar
        </Button>
        <Button
          type="button"
          variant={view === "list" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setView("list")}
          className={cn(view !== "list" && "text-muted-foreground")}
        >
          <List />
          List
        </Button>
      </div>

      {view === "list" ? (
        <ScheduleTable schedules={schedules} onSelect={handleSelect} />
      ) : (
        <ScheduleCalendar schedules={schedules} onSelect={handleSelect} />
      )}

      <ScheduleDetailSheet
        schedule={selected}
        open={open}
        onOpenChange={setOpen}
        clients={clients}
        employees={employees}
      />
    </div>
  )
}
