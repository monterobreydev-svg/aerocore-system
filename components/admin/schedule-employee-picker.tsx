"use client"

import { useMemo, useState } from "react"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { EmployeeOption } from "@/components/admin/schedule-types"

export function ScheduleEmployeePicker({
  employees,
  defaultSelectedIds = [],
  disabled,
}: {
  employees: EmployeeOption[]
  defaultSelectedIds?: string[]
  disabled?: boolean
}) {
  const [search, setSearch] = useState("")
  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(defaultSelectedIds.map((id) => [id, true]))
  )

  const selectedCount = useMemo(
    () => Object.values(checked).filter(Boolean).length,
    [checked]
  )

  const query = search.trim().toLowerCase()

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search employees..."
          disabled={disabled}
          className="pl-8"
        />
        {selectedCount > 0 && (
          <Badge variant="secondary" className="absolute top-1/2 right-2 -translate-y-1/2">
            {selectedCount} selected
          </Badge>
        )}
      </div>

      <div className="flex max-h-44 flex-col gap-0.5 overflow-y-auto rounded-lg border p-1">
        {employees.length === 0 && (
          <p className="px-2 py-3 text-center text-sm text-muted-foreground">
            No employees available.
          </p>
        )}
        {employees.map((employee) => {
          const name = `${employee.firstName} ${employee.lastName}`
          const matches =
            query.length === 0 || name.toLowerCase().includes(query)

          return (
            <label
              key={employee.id}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted",
                !matches && "hidden"
              )}
            >
              <Checkbox
                name="employeeIds"
                value={employee.id}
                checked={checked[employee.id] ?? false}
                onCheckedChange={(value) =>
                  setChecked((prev) => ({ ...prev, [employee.id]: !!value }))
                }
                disabled={disabled}
              />
              <span className="flex-1">{name}</span>
              <span className="text-xs text-muted-foreground">
                {employee.position}
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
