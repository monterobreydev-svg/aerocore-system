"use client"

import { useActionState, useEffect, useState } from "react"
import {
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  History,
  ShieldAlert,
  ShieldCheck,
  UserRound,
  Wallet,
} from "lucide-react"
import {
  updateStaffAccount,
  type UpdateStaffState,
} from "@/app/actions/staff"
import { roleLabel } from "@/lib/roles"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { StaffMember } from "@/components/admin/staff-cards"

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

export function StaffDetailView({
  staff,
  onBack,
  readOnly = false,
}: {
  staff: StaffMember
  onBack: () => void
  readOnly?: boolean
}) {
  const [state, action, pending] = useActionState<UpdateStaffState, FormData>(
    updateStaffAccount,
    undefined
  )
  const [historyOpen, setHistoryOpen] = useState(false)
  const [activeTab, setActiveTab] = useState("profile")
  // Uncontrolled inputs below read their defaultValue from this frozen
  // snapshot, not the live `staff` prop — a successful save triggers
  // revalidatePath, which can push fresh data into this still-mounted form
  // before onBack() unmounts it, and changing defaultValue on an already
  // -initialized uncontrolled field is what Base UI warns about.
  const [initial] = useState(staff)

  useEffect(() => {
    if (state?.success) {
      onBack()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

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
    <div className="flex flex-col gap-6">
      <div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="-ml-2 mb-2 text-muted-foreground"
        >
          <ChevronLeft className="size-4" />
          Back to staff
        </Button>

        <div className="flex items-center gap-3">
          <Avatar className="size-12 rounded-lg">
            <AvatarFallback className="rounded-lg bg-sky-600/10 text-sky-700 dark:text-sky-400">
              {initials(staff.employee.firstName, staff.employee.lastName)}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{fullName}</h2>
              <Badge
                variant={
                  staff.role === "DIRECTOR"
                    ? "default"
                    : staff.role === "ADMINISTRATOR"
                      ? "secondary"
                      : "outline"
                }
              >
                {roleLabel(staff.role)}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              @{staff.username} · {staff.employee.position}
            </p>
          </div>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as string)}
      >
        <TabsList className="sm:w-fit">
          <TabsTrigger value="profile" className="flex-1 sm:flex-none sm:px-6">
            Profile
          </TabsTrigger>
          <TabsTrigger
            value="attendance"
            className="flex-1 sm:flex-none sm:px-6"
          >
            Attendance
          </TabsTrigger>
          <TabsTrigger value="payroll" className="flex-1 sm:flex-none sm:px-6">
            Payroll
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="max-w-2xl pt-4">
          <div className="flex flex-col gap-6">
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
              <input
                type="hidden"
                name="employeeId"
                value={staff.employee.id}
              />
              <FieldGroup>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field data-invalid={!!state?.errors?.firstName}>
                    <FieldLabel htmlFor={`firstName-${staff.id}`}>
                      First name
                    </FieldLabel>
                    <Input
                      id={`firstName-${staff.id}`}
                      name="firstName"
                      defaultValue={initial.employee.firstName}
                      disabled={fieldsDisabled}
                      required
                    />
                    <FieldError
                      errors={state?.errors?.firstName?.map((message) => ({
                        message,
                      }))}
                    />
                  </Field>
                  <Field data-invalid={!!state?.errors?.middleName}>
                    <FieldLabel htmlFor={`middleName-${staff.id}`}>
                      Middle name
                    </FieldLabel>
                    <Input
                      id={`middleName-${staff.id}`}
                      name="middleName"
                      defaultValue={initial.employee.middleName ?? ""}
                      disabled={fieldsDisabled}
                    />
                    <FieldError
                      errors={state?.errors?.middleName?.map((message) => ({
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
                      defaultValue={initial.employee.lastName}
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

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field data-invalid={!!state?.errors?.position}>
                    <FieldLabel htmlFor={`position-${staff.id}`}>
                      Position
                    </FieldLabel>
                    <Input
                      id={`position-${staff.id}`}
                      name="position"
                      defaultValue={initial.employee.position}
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
                      defaultValue={initial.employee.hourlyRate}
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
                  <FieldLabel htmlFor={`skills-${staff.id}`}>
                    Skills
                  </FieldLabel>
                  <Input
                    id={`skills-${staff.id}`}
                    name="skills"
                    defaultValue={initial.employee.skills.join(", ")}
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
                  <Field
                    data-invalid={!!state?.errors?.emergencyContactPerson}
                  >
                    <FieldLabel htmlFor={`emergencyContactPerson-${staff.id}`}>
                      Emergency contact name
                    </FieldLabel>
                    <Input
                      id={`emergencyContactPerson-${staff.id}`}
                      name="emergencyContactPerson"
                      defaultValue={
                        initial.employee.emergencyContactPerson ?? ""
                      }
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
                      defaultValue={initial.employee.emergencyContactNo ?? ""}
                      disabled={fieldsDisabled}
                    />
                    <FieldError
                      errors={state?.errors?.emergencyContactNo?.map(
                        (message) => ({ message })
                      )}
                    />
                  </Field>
                </div>

                <Field className="sm:max-w-56">
                  <FieldLabel htmlFor={`isActive-${staff.id}`}>
                    Status
                  </FieldLabel>
                  <Select
                    name="isActive"
                    defaultValue={String(initial.isActive)}
                    disabled={fieldsDisabled}
                    items={{ true: "Active", false: "Inactive" }}
                  >
                    <SelectTrigger
                      id={`isActive-${staff.id}`}
                      className="w-full"
                    >
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

              <div className="flex justify-end border-t pt-4">
                <Button type="submit" disabled={fieldsDisabled}>
                  {pending ? "Saving..." : "Save changes"}
                </Button>
              </div>
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
                  <div className="flex max-h-96 flex-col gap-3 overflow-y-auto pr-1">
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
        </TabsContent>

        <TabsContent value="attendance" className="pt-4">
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center">
            <CalendarClock className="size-6 text-muted-foreground" />
            <p className="text-sm font-medium">
              Attendance history isn&apos;t tracked yet
            </p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Once the Attendance feature is built, {staff.employee.firstName}
              &apos;s clock-in/out records will show up here.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="payroll" className="pt-4">
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center">
            <Wallet className="size-6 text-muted-foreground" />
            <p className="text-sm font-medium">
              Payroll records aren&apos;t tracked yet
            </p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Once the Payroll feature is built, {staff.employee.firstName}
              &apos;s pay history will show up here.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
