"use client"

import { useState } from "react"
import type { Role } from "@/app/generated/prisma/client"
import { roleLabel } from "@/lib/roles"
import { cn } from "@/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { StaffDetailSheet } from "@/components/admin/staff-detail-sheet"

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

export function StaffTable({
  staff,
  currentAccountId,
  currentRole,
}: {
  staff: StaffMember[]
  currentAccountId: string
  currentRole: Role
}) {
  const [selected, setSelected] = useState<StaffMember | null>(null)
  const [open, setOpen] = useState(false)

  return (
    <>
      <div className="overflow-hidden rounded-xl border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead>Name</TableHead>
              <TableHead>Username</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Position</TableHead>
              <TableHead>Hourly rate</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {staff.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-32 text-center text-muted-foreground"
                >
                  No staff accounts yet.
                </TableCell>
              </TableRow>
            )}
            {staff.map((member) => (
              <TableRow
                key={member.id}
                className="cursor-pointer"
                onClick={() => {
                  setSelected(member)
                  setOpen(true)
                }}
              >
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2.5">
                    <Avatar className="size-8 rounded-lg">
                      <AvatarFallback className="rounded-lg bg-sky-600/10 text-xs text-sky-700 dark:text-sky-400">
                        {initials(
                          member.employee.firstName,
                          member.employee.lastName
                        )}
                      </AvatarFallback>
                    </Avatar>
                    {member.employee.firstName} {member.employee.lastName}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  @{member.username}
                </TableCell>
                <TableCell>
                  <Badge variant={ROLE_BADGE_VARIANT[member.role]}>
                    {roleLabel(member.role)}
                  </Badge>
                </TableCell>
                <TableCell>{member.employee.position}</TableCell>
                <TableCell>
                  {member.employee.hourlyRate.toLocaleString("en-US", {
                    style: "currency",
                    currency: "PHP",
                  })}
                </TableCell>
                <TableCell>
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
                        member.isActive ? "bg-emerald-500" : "bg-muted-foreground/50"
                      )}
                    />
                    {member.isActive ? "Active" : "Inactive"}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <StaffDetailSheet
        staff={selected}
        open={open}
        onOpenChange={setOpen}
        readOnly={
          !!selected &&
          selected.id === currentAccountId &&
          currentRole === "ADMINISTRATOR"
        }
      />
    </>
  )
}
