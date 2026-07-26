"use client"

import { useState } from "react"
import type { Role } from "@/app/generated/prisma/client"
import { roleLabel } from "@/lib/roles"
import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
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
    position: string
    hourlyRate: number
    skills: string[]
    emergencyContactPerson: string | null
    emergencyContactNo: string | null
    createdAt: string
    createdByName: string | null
    editLogs: StaffEditLogEntry[]
  }
}

function initials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase()
}

const ROLE_BADGE_VARIANT: Record<Role, "default" | "secondary" | "outline"> = {
  DIRECTOR: "default",
  ADMINISTRATOR: "secondary",
  ENGINEER: "outline",
  EMPLOYEE: "outline",
}

export function StaffCards({
  staff,
  currentAccountId,
  currentRole,
}: {
  staff: StaffMember[]
  currentAccountId: string
  currentRole: Role
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = staff.find((member) => member.id === selectedId) ?? null

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

  if (staff.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">
        No staff accounts yet.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium text-muted-foreground">
        Team ({staff.length})
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {staff.map((member) => (
          <Card
            key={member.id}
            onClick={() => setSelectedId(member.id)}
            className="cursor-pointer shadow-sm transition-shadow hover:shadow-md"
          >
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <Avatar className="size-11 rounded-lg">
                    <AvatarFallback className="rounded-lg bg-sky-600/10 text-sky-700 dark:text-sky-400">
                      {initials(
                        member.employee.firstName,
                        member.employee.lastName
                      )}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium leading-tight">
                      {member.employee.firstName} {member.employee.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      @{member.username}
                    </p>
                  </div>
                </div>
                <Badge variant={ROLE_BADGE_VARIANT[member.role]}>
                  {roleLabel(member.role)}
                </Badge>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {member.employee.position}
                </span>
                <span className="font-medium">
                  {member.employee.hourlyRate.toLocaleString("en-US", {
                    style: "currency",
                    currency: "PHP",
                  })}
                </span>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 text-xs font-medium",
                    member.isActive
                      ? "text-emerald-700 dark:text-emerald-400"
                      : "text-muted-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      member.isActive
                        ? "bg-emerald-500"
                        : "bg-muted-foreground/50"
                    )}
                  />
                  {member.isActive ? "Active" : "Inactive"}
                </span>
                {member.employee.skills.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {member.employee.skills.length} skill
                    {member.employee.skills.length === 1 ? "" : "s"}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
