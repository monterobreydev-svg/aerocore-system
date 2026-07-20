"use client"

import { useActionState, useEffect, useState } from "react"
import {
  ChevronDown,
  History,
  ShieldAlert,
  ShieldCheck,
  UserRound,
} from "lucide-react"
import {
  updateStaffAccount,
  type UpdateStaffState,
} from "@/app/actions/staff"
import { roleLabel } from "@/lib/roles"
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
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import type { StaffMember } from "@/components/admin/staff-table"

function initials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase()
}

const FIELD_LABELS: Record<string, string> = {
  firstName: "First name",
  lastName: "Last name",
  middleName: "Middle name",
  position: "Position",
  hourlyRate: "Hourly rate",
  skills: "Skills",
  emergencyContactPerson: "Emergency contact name",
  emergencyContactNo: "Emergency contact number",
  isActive: "Status",
}

function formatFieldValue(field: string, value: string | null) {
  if (!value) return "—"
  if (field === "hourlyRate") {
    return Number(value).toLocaleString("en-US", {
      style: "currency",
      currency: "PHP",
    })
  }
  if (field === "isActive") {
    return value === "true" ? "Active" : "Inactive"
  }
  return value
}

export function StaffDetailSheet({
  staff,
  open,
  onOpenChange,
  readOnly = false,
}: {
  staff: StaffMember | null
  open: boolean
  onOpenChange: (open: boolean) => void
  readOnly?: boolean
}) {
  const [state, action, pending] = useActionState<UpdateStaffState, FormData>(
    updateStaffAccount,
    undefined
  )
  const [historyOpen, setHistoryOpen] = useState(false)

  useEffect(() => {
    if (state?.success) {
      onOpenChange(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  if (!staff) return null

  const fieldsDisabled = pending || readOnly
  const editCount = staff.employee.editLogs.length

  const fullName = [
    staff.employee.firstName,
    staff.employee.middleName,
    staff.employee.lastName,
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader className="border-b">
          <div className="flex items-center gap-3">
            <Avatar className="size-11 rounded-lg">
              <AvatarFallback className="rounded-lg bg-sky-600/10 text-sky-700 dark:text-sky-400">
                {initials(staff.employee.firstName, staff.employee.lastName)}
              </AvatarFallback>
            </Avatar>
            <div>
              <SheetTitle>{fullName}</SheetTitle>
              <SheetDescription>
                @{staff.username} · {roleLabel(staff.role)}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex flex-col gap-6 px-4 py-4">
          <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
            <span>
              Added {new Date(staff.employee.createdAt).toLocaleDateString()}
              {staff.employee.createdByName
                ? ` by ${staff.employee.createdByName}`
                : ""}
              . All edits below are recorded with who made them.
            </span>
          </div>

          {readOnly && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-400">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                You can&apos;t edit your own account. Ask a Director to make
                changes here.
              </span>
            </div>
          )}

          <form
            action={action}
            id={`staff-edit-form-${staff.id}`}
            className="flex flex-col gap-4"
          >
            <input type="hidden" name="employeeId" value={staff.employee.id} />
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field data-invalid={!!state?.errors?.firstName}>
                  <FieldLabel htmlFor={`firstName-${staff.id}`}>
                    First name
                  </FieldLabel>
                  <Input
                    id={`firstName-${staff.id}`}
                    name="firstName"
                    defaultValue={staff.employee.firstName}
                    disabled={fieldsDisabled}
                    required
                  />
                  <FieldError
                    errors={state?.errors?.firstName?.map((message) => ({
                      message,
                    }))}
                  />
                </Field>
                <Field data-invalid={!!state?.errors?.lastName}>
                  <FieldLabel htmlFor={`lastName-${staff.id}`}>
                    Last name
                  </FieldLabel>
                  <Input
                    id={`lastName-${staff.id}`}
                    name="lastName"
                    defaultValue={staff.employee.lastName}
                    disabled={fieldsDisabled}
                    required
                  />
                  <FieldError
                    errors={state?.errors?.lastName?.map((message) => ({
                      message,
                    }))}
                  />
                </Field>
              </div>

              <Field data-invalid={!!state?.errors?.middleName}>
                <FieldLabel htmlFor={`middleName-${staff.id}`}>
                  Middle name
                </FieldLabel>
                <Input
                  id={`middleName-${staff.id}`}
                  name="middleName"
                  defaultValue={staff.employee.middleName ?? ""}
                  disabled={fieldsDisabled}
                />
                <FieldError
                  errors={state?.errors?.middleName?.map((message) => ({
                    message,
                  }))}
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field data-invalid={!!state?.errors?.position}>
                  <FieldLabel htmlFor={`position-${staff.id}`}>
                    Position
                  </FieldLabel>
                  <Input
                    id={`position-${staff.id}`}
                    name="position"
                    defaultValue={staff.employee.position}
                    disabled={fieldsDisabled}
                    required
                  />
                  <FieldError
                    errors={state?.errors?.position?.map((message) => ({
                      message,
                    }))}
                  />
                </Field>

                <Field data-invalid={!!state?.errors?.hourlyRate}>
                  <FieldLabel htmlFor={`hourlyRate-${staff.id}`}>
                    Hourly rate
                  </FieldLabel>
                  <Input
                    id={`hourlyRate-${staff.id}`}
                    name="hourlyRate"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={staff.employee.hourlyRate}
                    disabled={fieldsDisabled}
                    required
                  />
                  <FieldError
                    errors={state?.errors?.hourlyRate?.map((message) => ({
                      message,
                    }))}
                  />
                </Field>
              </div>

              <Field data-invalid={!!state?.errors?.skills}>
                <FieldLabel htmlFor={`skills-${staff.id}`}>Skills</FieldLabel>
                <Input
                  id={`skills-${staff.id}`}
                  name="skills"
                  defaultValue={staff.employee.skills.join(", ")}
                  placeholder="e.g. Aircon installation, Electrical wiring"
                  disabled={fieldsDisabled}
                />
                <FieldError
                  errors={state?.errors?.skills?.map((message) => ({
                    message,
                  }))}
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field data-invalid={!!state?.errors?.emergencyContactPerson}>
                  <FieldLabel htmlFor={`emergencyContactPerson-${staff.id}`}>
                    Emergency contact name
                  </FieldLabel>
                  <Input
                    id={`emergencyContactPerson-${staff.id}`}
                    name="emergencyContactPerson"
                    defaultValue={staff.employee.emergencyContactPerson ?? ""}
                    disabled={fieldsDisabled}
                  />
                  <FieldError
                    errors={state?.errors?.emergencyContactPerson?.map(
                      (message) => ({ message })
                    )}
                  />
                </Field>
                <Field data-invalid={!!state?.errors?.emergencyContactNo}>
                  <FieldLabel htmlFor={`emergencyContactNo-${staff.id}`}>
                    Emergency contact number
                  </FieldLabel>
                  <Input
                    id={`emergencyContactNo-${staff.id}`}
                    name="emergencyContactNo"
                    defaultValue={staff.employee.emergencyContactNo ?? ""}
                    disabled={fieldsDisabled}
                  />
                  <FieldError
                    errors={state?.errors?.emergencyContactNo?.map(
                      (message) => ({ message })
                    )}
                  />
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor={`isActive-${staff.id}`}>
                  Status
                </FieldLabel>
                <Select
                  name="isActive"
                  defaultValue={String(staff.isActive)}
                  disabled={fieldsDisabled}
                  items={{ true: "Active", false: "Inactive" }}
                >
                  <SelectTrigger id={`isActive-${staff.id}`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Active</SelectItem>
                    <SelectItem value="false">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              {state?.message && (
                <p className="text-sm text-destructive">{state.message}</p>
              )}
            </FieldGroup>
          </form>

          <Separator />

          <Collapsible
            open={historyOpen}
            onOpenChange={setHistoryOpen}
            className="group/history"
          >
            <CollapsibleTrigger className="flex w-full items-center justify-between text-sm font-medium outline-none">
              <span className="flex items-center gap-1.5">
                <History className="size-4 text-muted-foreground" />
                Edit history
                {editCount > 0 && (
                  <Badge variant="secondary">{editCount}</Badge>
                )}
              </span>
              <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[panel-open]/history:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3">
              {editCount === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No edits have been made yet.
                </p>
              ) : (
                <div className="flex max-h-72 flex-col gap-3 overflow-y-auto pr-1">
                  {staff.employee.editLogs.map((log) => (
                    <div key={log.id} className="flex gap-2.5 text-sm">
                      <UserRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <div>
                        <p>
                          <span className="font-medium">
                            {log.editedByName}
                          </span>{" "}
                          changed{" "}
                          <span className="font-medium">
                            {FIELD_LABELS[log.field] ?? log.field}
                          </span>{" "}
                          from{" "}
                          <Badge variant="outline">
                            {formatFieldValue(log.field, log.oldValue)}
                          </Badge>{" "}
                          to{" "}
                          <Badge variant="outline">
                            {formatFieldValue(log.field, log.newValue)}
                          </Badge>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(log.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        </div>

        <SheetFooter className="mt-auto border-t">
          <Button
            type="submit"
            form={`staff-edit-form-${staff.id}`}
            disabled={fieldsDisabled}
            className={cn("w-full")}
          >
            {pending ? "Saving..." : "Save changes"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
