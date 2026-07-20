"use client"

import { useActionState, useEffect, useMemo, useState } from "react"
import { MapPin, Phone, Trash2, User } from "lucide-react"
import {
  deleteSchedule,
  updateSchedule,
  type UpdateScheduleState,
} from "@/app/actions/schedules"
import {
  SCHEDULE_STATUSES,
  SCHEDULE_STATUS_LABELS,
  toDateInputValue,
  toTimeInputValue,
} from "@/lib/schedule"
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
import { ScheduleEmployeePicker } from "@/components/admin/schedule-employee-picker"
import { ScheduleWorkTypePicker } from "@/components/admin/schedule-worktype-picker"
import type {
  ClientOption,
  EmployeeOption,
  ScheduleRecord,
} from "@/components/admin/schedule-types"

function ScheduleEditForm({
  schedule,
  clients,
  employees,
  onSaved,
}: {
  schedule: ScheduleRecord
  clients: ClientOption[]
  employees: EmployeeOption[]
  onSaved: () => void
}) {
  const [state, action, pending] = useActionState<
    UpdateScheduleState,
    FormData
  >(updateSchedule, undefined)
  const [clientId, setClientId] = useState(schedule.client.id)
  const [branchId, setBranchId] = useState(schedule.branch?.id ?? "")
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (state?.success) onSaved()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const selectedClient = useMemo(
    () => clients.find((client) => client.id === clientId),
    [clients, clientId]
  )
  const branches = selectedClient?.branches ?? []
  const address = branchId
    ? branches.find((branch) => branch.id === branchId)?.address
    : selectedClient?.address

  const formId = `schedule-edit-form-${schedule.id}`

  async function handleDelete() {
    if (!confirm("Delete this schedule? This can't be undone.")) return
    setDeleting(true)
    try {
      await deleteSchedule(schedule.id)
      onSaved()
    } finally {
      setDeleting(false)
    }
  }

  const fieldsDisabled = pending || deleting

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-6 px-4 py-4">
      <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
        {schedule.contactPerson || schedule.contactNumber ? (
          <>
            <User className="mt-0.5 size-4 shrink-0" />
            <span>
              {schedule.contactPerson || "No contact name on file"}
              {schedule.contactNumber ? (
                <span className="inline-flex items-center gap-1">
                  {" "}
                  · <Phone className="size-3" /> {schedule.contactNumber}
                </span>
              ) : null}
            </span>
          </>
        ) : (
          <span>No on-site contact recorded for this job.</span>
        )}
      </div>

      <form action={action} id={formId} className="flex flex-col gap-4">
        <input type="hidden" name="scheduleId" value={schedule.id} />
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={!!state?.errors?.clientId}>
              <FieldLabel htmlFor={`clientId-${schedule.id}`}>
                Client
              </FieldLabel>
              <Select
                name="clientId"
                value={clientId}
                onValueChange={(value) => {
                  setClientId(value as string)
                  setBranchId("")
                }}
                disabled={fieldsDisabled}
                items={Object.fromEntries(
                  clients.map((client) => [client.id, client.name])
                )}
              >
                <SelectTrigger id={`clientId-${schedule.id}`} className="w-full">
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError
                errors={state?.errors?.clientId?.map((message) => ({
                  message,
                }))}
              />
            </Field>

            <Field data-invalid={!!state?.errors?.branchId}>
              <FieldLabel htmlFor={`branchId-${schedule.id}`}>
                Branch (optional)
              </FieldLabel>
              <Select
                name="branchId"
                value={branchId}
                onValueChange={(value) => setBranchId(value as string)}
                disabled={fieldsDisabled || branches.length === 0}
                items={Object.fromEntries(
                  branches.map((branch) => [branch.id, branch.name])
                )}
              >
                <SelectTrigger id={`branchId-${schedule.id}`} className="w-full">
                  <SelectValue
                    placeholder={
                      branches.length === 0
                        ? "No branches for this client"
                        : "Select a branch"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError
                errors={state?.errors?.branchId?.map((message) => ({
                  message,
                }))}
              />
            </Field>
          </div>

          {address && (
            <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
              <MapPin className="mt-0.5 size-4 shrink-0" />
              <span>{address}</span>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <Field data-invalid={!!state?.errors?.date}>
              <FieldLabel htmlFor={`date-${schedule.id}`}>Date</FieldLabel>
              <Input
                id={`date-${schedule.id}`}
                name="date"
                type="date"
                defaultValue={toDateInputValue(schedule.date)}
                disabled={fieldsDisabled}
                required
              />
              <FieldError
                errors={state?.errors?.date?.map((message) => ({ message }))}
              />
            </Field>
            <Field data-invalid={!!state?.errors?.startTime}>
              <FieldLabel htmlFor={`startTime-${schedule.id}`}>
                Start time
              </FieldLabel>
              <Input
                id={`startTime-${schedule.id}`}
                name="startTime"
                type="time"
                defaultValue={toTimeInputValue(schedule.startTime)}
                disabled={fieldsDisabled}
                required
              />
              <FieldError
                errors={state?.errors?.startTime?.map((message) => ({
                  message,
                }))}
              />
            </Field>
            <Field data-invalid={!!state?.errors?.endTime}>
              <FieldLabel htmlFor={`endTime-${schedule.id}`}>
                End time
              </FieldLabel>
              <Input
                id={`endTime-${schedule.id}`}
                name="endTime"
                type="time"
                defaultValue={toTimeInputValue(schedule.endTime)}
                disabled={fieldsDisabled}
                required
              />
              <FieldError
                errors={state?.errors?.endTime?.map((message) => ({
                  message,
                }))}
              />
            </Field>
          </div>

          <Field data-invalid={!!state?.errors?.workTypes}>
            <FieldLabel>Work type</FieldLabel>
            <ScheduleWorkTypePicker
              defaultSelected={schedule.workTypes}
              disabled={fieldsDisabled}
            />
            <FieldError
              errors={state?.errors?.workTypes?.map((message) => ({
                message,
              }))}
            />
          </Field>

          <Field data-invalid={!!state?.errors?.status}>
            <FieldLabel htmlFor={`status-${schedule.id}`}>Status</FieldLabel>
            <Select
              name="status"
              defaultValue={schedule.status}
              disabled={fieldsDisabled}
              items={Object.fromEntries(
                SCHEDULE_STATUSES.map((status) => [
                  status,
                  SCHEDULE_STATUS_LABELS[status],
                ])
              )}
            >
              <SelectTrigger id={`status-${schedule.id}`} className="w-full">
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
            <FieldError
              errors={state?.errors?.status?.map((message) => ({
                message,
              }))}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={!!state?.errors?.contactPerson}>
              <FieldLabel htmlFor={`contactPerson-${schedule.id}`}>
                Contact person (optional)
              </FieldLabel>
              <Input
                id={`contactPerson-${schedule.id}`}
                name="contactPerson"
                defaultValue={schedule.contactPerson ?? ""}
                disabled={fieldsDisabled}
              />
              <FieldError
                errors={state?.errors?.contactPerson?.map((message) => ({
                  message,
                }))}
              />
            </Field>
            <Field data-invalid={!!state?.errors?.contactNumber}>
              <FieldLabel htmlFor={`contactNumber-${schedule.id}`}>
                Contact number (optional)
              </FieldLabel>
              <Input
                id={`contactNumber-${schedule.id}`}
                name="contactNumber"
                defaultValue={schedule.contactNumber ?? ""}
                disabled={fieldsDisabled}
              />
              <FieldError
                errors={state?.errors?.contactNumber?.map((message) => ({
                  message,
                }))}
              />
            </Field>
          </div>

          <Field>
            <FieldLabel>Assign employees</FieldLabel>
            <ScheduleEmployeePicker
              employees={employees}
              defaultSelectedIds={schedule.assignments.map(
                (a) => a.employeeId
              )}
              disabled={fieldsDisabled}
            />
          </Field>

          {state?.message && (
            <p className="text-sm text-destructive">{state.message}</p>
          )}
        </FieldGroup>
      </form>

      <Button
        type="button"
        variant="destructive"
        size="sm"
        onClick={handleDelete}
        disabled={fieldsDisabled}
        className="self-start"
      >
        <Trash2 />
        {deleting ? "Deleting..." : "Delete schedule"}
      </Button>
      </div>

      <SheetFooter className="mt-auto border-t">
        <Button type="submit" form={formId} disabled={fieldsDisabled} className="w-full">
          {pending ? "Saving..." : "Save changes"}
        </Button>
      </SheetFooter>
    </div>
  )
}

export function ScheduleDetailSheet({
  schedule,
  open,
  onOpenChange,
  clients,
  employees,
}: {
  schedule: ScheduleRecord | null
  open: boolean
  onOpenChange: (open: boolean) => void
  clients: ClientOption[]
  employees: EmployeeOption[]
}) {
  if (!schedule) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>
            {schedule.client.name}
            {schedule.branch ? ` · ${schedule.branch.name}` : ""}
          </SheetTitle>
          <SheetDescription>
            Created {new Date(schedule.createdAt).toLocaleDateString()}
            {schedule.createdByName ? ` by ${schedule.createdByName}` : ""}
          </SheetDescription>
        </SheetHeader>

        <ScheduleEditForm
          key={schedule.id}
          schedule={schedule}
          clients={clients}
          employees={employees}
          onSaved={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  )
}
