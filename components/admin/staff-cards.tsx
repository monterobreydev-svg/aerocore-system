"use client"

import { useMemo, useState } from "react"
import {
  ChevronRight,
  Hourglass,
  LayoutGrid,
  List,
  Search,
  UserCheck,
  UserX,
  Users,
  X,
} from "lucide-react"
import type {
  CivilStatus,
  EmploymentType,
  Role,
} from "@/app/generated/prisma/client"
import { roleLabel } from "@/lib/roles"
import { employmentTypeLabel } from "@/lib/employee"
import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CreateStaffDialog } from "@/components/admin/create-staff-dialog"
import { RoleBadge } from "@/components/admin/role-badge"
import { StaffDetailView } from "@/components/admin/staff-detail-view"

export type StaffEditLogEntry = {
  id: string
  field: string
  oldValue: string | null
  newValue: string | null
  createdAt: string
  editedByName: string
}

export type StaffMember = {
  id: string
  username: string
  role: Role
  isActive: boolean
  employee: {
    id: string
    firstName: string
    lastName: string
    middleName: string | null
    phoneNo: string | null
    email: string | null
    birthDate: string | null
    civilStatus: CivilStatus | null
    address: string | null
    employeeNo: string | null
    position: string
    employmentType: EmploymentType | null
    dateHired: string | null
    hourlyRate: number
    allowancePerCutoff: number | null
    skills: string[]
    emergencyContactPerson: string | null
    emergencyContactNo: string | null
    emergencyContactRelationship: string | null
    tinNo: string | null
    sssNo: string | null
    philhealthNo: string | null
    pagibigNo: string | null
    createdAt: string
    createdByName: string | null
    editLogs: StaffEditLogEntry[]
  }
}

function initials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase()
}

function peso(amount: number) {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "PHP",
  })
}

const ROLE_FILTERS: Role[] = [
  "DIRECTOR",
  "ADMINISTRATOR",
  "ENGINEER",
  "EMPLOYEE",
]

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <Badge
      className={cn(
        isActive
          ? "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
          : "bg-muted text-muted-foreground"
      )}
    >
      {isActive ? "Active" : "Inactive"}
    </Badge>
  )
}

// Outlined pill used for the role row. Kept as buttons rather than a second
// dropdown so the common filters are one click away and their counts are
// visible without opening anything.
function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-9 shrink-0 items-center rounded-lg border px-3.5 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active
          ? "border-sky-600 bg-sky-600/10 text-sky-700 dark:text-sky-400"
          : "border-border bg-background text-foreground hover:bg-muted"
      )}
    >
      {label}
    </button>
  )
}

export function StaffCards({
  staff,
  currentAccountId,
  currentRole,
  suggestedEmployeeNo,
}: {
  staff: StaffMember[]
  currentAccountId: string
  currentRole: Role
  suggestedEmployeeNo: string
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [roleFilter, setRoleFilter] = useState<Role | "all">("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [view, setView] = useState<"grid" | "list">("grid")

  const selected = staff.find((member) => member.id === selectedId) ?? null

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return staff.filter((member) => {
      if (roleFilter !== "all" && member.role !== roleFilter) return false
      if (statusFilter === "active" && !member.isActive) return false
      if (statusFilter === "inactive" && member.isActive) return false
      if (!needle) return true

      return [
        member.employee.firstName,
        member.employee.middleName,
        member.employee.lastName,
        member.username,
        member.employee.employeeNo,
        member.employee.position,
        member.employee.email,
        ...member.employee.skills,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle)
    })
  }, [staff, query, roleFilter, statusFilter])

  if (selected) {
    return (
      <StaffDetailView
        staff={selected}
        onBack={() => setSelectedId(null)}
        readOnly={
          selected.id === currentAccountId && currentRole === "ADMINISTRATOR"
        }
      />
    )
  }

  const filtersActive =
    query.trim() !== "" || roleFilter !== "all" || statusFilter !== "all"

  function clearFilters() {
    setQuery("")
    setRoleFilter("all")
    setStatusFilter("all")
  }

  const activeCount = staff.filter((member) => member.isActive).length
  const summary = [
    {
      label: "Total employees",
      value: staff.length,
      icon: Users,
      color: "text-slate-600 dark:text-slate-400",
      bg: "bg-slate-600/10",
    },
    {
      label: "Active",
      value: activeCount,
      icon: UserCheck,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-600/10",
    },
    {
      label: "Inactive",
      value: staff.length - activeCount,
      icon: UserX,
      color: "text-rose-600 dark:text-rose-400",
      bg: "bg-rose-600/10",
    },
    {
      // Worth surfacing on its own: these are the people whose regularisation
      // someone has to act on, and nothing else on the page surfaces them.
      label: "Probationary",
      value: staff.filter(
        (member) => member.employee.employmentType === "PROBATIONARY"
      ).length,
      icon: Hourglass,
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-600/10",
    },
  ]

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summary.map((stat) => (
          <Card key={stat.label} className="shadow-sm" size="sm">
            <CardContent className="flex items-center gap-3">
              <div
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-lg",
                  stat.bg
                )}
              >
                <stat.icon className={cn("size-5", stat.color)} />
              </div>
              <div className="min-w-0">
                <p className="text-2xl leading-none font-semibold tabular-nums">
                  {stat.value}
                </p>
                <p className="mt-1.5 truncate text-xs text-muted-foreground">
                  {stat.label}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1 sm:max-w-xs">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name or position"
            aria-label="Search employees"
            className="h-9 pl-9"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground outline-none hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Role chips are desktop-only — five pills can't fit a phone without
            a cramped scroller. Status stays, since it's a single select. */}
        <div className="hidden items-center gap-2 overflow-x-auto sm:flex">
          <FilterChip
            active={roleFilter === "all"}
            label="All"
            onClick={() => setRoleFilter("all")}
          />
          {ROLE_FILTERS.map((role) => (
            <FilterChip
              key={role}
              active={roleFilter === role}
              label={roleLabel(role)}
              onClick={() => setRoleFilter(role)}
            />
          ))}
        </div>

        <Select
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value as string)}
          items={{ all: "All", active: "Active", inactive: "Inactive" }}
        >
          <SelectTrigger className="h-9 w-32" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-0.5 rounded-lg border p-0.5">
          <Button
            type="button"
            variant={view === "grid" ? "secondary" : "ghost"}
            size="icon"
            className="size-7 rounded-md"
            aria-label="Card view"
            aria-pressed={view === "grid"}
            onClick={() => setView("grid")}
          >
            <LayoutGrid className="size-4" />
          </Button>
          <Button
            type="button"
            variant={view === "list" ? "secondary" : "ghost"}
            size="icon"
            className="size-7 rounded-md"
            aria-label="List view"
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            <List className="size-4" />
          </Button>
        </div>

        <div className="ml-auto">
          <CreateStaffDialog
            currentRole={currentRole}
            suggestedEmployeeNo={suggestedEmployeeNo}
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{visible.length}</span>{" "}
          {visible.length === 1 ? "employee" : "employees"}
          {filtersActive && ` of ${staff.length}`}
        </p>
        {filtersActive && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="text-muted-foreground"
          >
            <X className="size-3.5" />
            Clear filters
          </Button>
        )}
      </div>

      {staff.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">
          No employees yet. Use “Add employee” to create the first record.
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-12 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <Search className="size-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">No employees match your filters</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Try a different search term or clear the filters.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      ) : view === "grid" ? (
        // Breakpoints account for the sidebar eating ~256px: going 2-up at
        // `md` leaves cards too narrow to hold a full name plus a badge.
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {visible.map((member) => (
            <Card
              key={member.id}
              onClick={() => setSelectedId(member.id)}
              className="group cursor-pointer shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md hover:ring-sky-600/30"
            >
              <CardContent>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    <Avatar className="size-11 rounded-full">
                      <AvatarFallback className="rounded-full bg-sky-600/10 text-sky-700 dark:text-sky-400">
                        {initials(
                          member.employee.firstName,
                          member.employee.lastName
                        )}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-base leading-tight font-medium">
                        {member.employee.firstName} {member.employee.lastName}
                      </p>
                      {/* Position replaces the removed figures strip — a job
                          title says more at a glance than a pay rate, and the
                          list view still carries the rate for comparing. */}
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {member.employee.position}
                      </p>
                      <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                        @{member.username}
                        {member.employee.employeeNo &&
                          ` · ${member.employee.employeeNo}`}
                      </p>
                    </div>
                  </div>
                  <StatusBadge isActive={member.isActive} />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <RoleBadge role={member.role} />
                  {member.employee.employmentType && (
                    <Badge variant="outline">
                      {employmentTypeLabel(member.employee.employmentType)}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
          <div className="hidden items-center gap-4 border-b bg-muted/40 px-4 py-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
            <span>Name</span>
            <span>Position</span>
            <span>Role</span>
            <span className="text-right">Hourly rate</span>
            <span className="w-24 text-right">Status</span>
          </div>

          <div className="divide-y">
            {visible.map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={() => setSelectedId(member.id)}
                className="group flex w-full items-center gap-4 px-4 py-3 text-left transition-colors outline-none hover:bg-muted/50 focus-visible:bg-muted/50 md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar className="size-9 rounded-full">
                    <AvatarFallback className="rounded-full bg-sky-600/10 text-xs text-sky-700 dark:text-sky-400">
                      {initials(
                        member.employee.firstName,
                        member.employee.lastName
                      )}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm leading-tight font-medium">
                      {member.employee.firstName} {member.employee.lastName}
                    </p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      @{member.username}
                      {member.employee.employeeNo &&
                        ` · ${member.employee.employeeNo}`}
                    </p>
                  </div>
                </div>

                <span className="hidden truncate text-sm text-muted-foreground md:block">
                  {member.employee.position}
                </span>

                <span className="hidden md:block">
                  <RoleBadge role={member.role} />
                </span>

                <span className="hidden text-right text-sm font-medium tabular-nums md:block">
                  {peso(member.employee.hourlyRate)}
                </span>

                <span className="flex shrink-0 items-center justify-end gap-2 md:w-24">
                  <StatusBadge isActive={member.isActive} />
                  <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
