"use client"

import { useActionState, useEffect, useMemo, useState } from "react"
import { MapPin, Plus } from "lucide-react"
import { createSchedule, type ScheduleState } from "@/app/actions/schedules"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
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
} from "@/components/admin/schedule-types"

export function CreateScheduleDialog({
  clients,
  employees,
}: {
  clients: ClientOption[]
  employees: EmployeeOption[]
}) {
  const [open, setOpen] = useState(false)
  const [clientId, setClientId] = useState("")
  const [branchId, setBranchId] = useState("")
  const [state, action, pending] = useActionState<ScheduleState, FormData>(
    createSchedule,
    undefined
  )

  useEffect(() => {
    if (state?.success) {
      setOpen(false)
      setClientId("")
      setBranchId("")
    }
  }, [state])

  const selectedClient = useMemo(
    () => clients.find((client) => client.id === clientId),
    [clients, clientId]
  )
  const branches = selectedClient?.branches ?? []
  const address = branchId
    ? branches.find((branch) => branch.id === branchId)?.address
    : selectedClient?.address

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <Plus />
            New schedule
          </Button>
        }
      />
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create schedule</DialogTitle>
          <DialogDescription>
            Book a job for a client and assign the employees who&apos;ll handle it.
          </DialogDescription>
        </DialogHeader>

        <form action={action} id="create-schedule-form">
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={!!state?.errors?.clientId}>
                <FieldLabel htmlFor="clientId">Client</FieldLabel>
                <Select
                  name="clientId"
                  value={clientId}
                  onValueChange={(value) => {
                    setClientId(value as string)
                    setBranchId("")
                  }}
                  disabled={pending}
                  items={Object.fromEntries(
                    clients.map((client) => [client.id, client.name])
                  )}
                >
                  <SelectTrigger id="clientId" className="w-full">
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
                <FieldLabel htmlFor="branchId">Branch (optional)</FieldLabel>
                <Select
                  name="branchId"
                  value={branchId}
                  onValueChange={(value) => setBranchId(value as string)}
                  disabled={pending || branches.length === 0}
                  items={Object.fromEntries(
                    branches.map((branch) => [branch.id, branch.name])
                  )}
                >
                  <SelectTrigger id="branchId" className="w-full">
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
                <FieldLabel htmlFor="date">Date</FieldLabel>
                <Input
                  id="date"
                  name="date"
                  type="date"
                  disabled={pending}
                  required
                />
                <FieldError
                  errors={state?.errors?.date?.map((message) => ({ message }))}
                />
              </Field>
              <Field data-invalid={!!state?.errors?.startTime}>
                <FieldLabel htmlFor="startTime">Start time</FieldLabel>
                <Input
                  id="startTime"
                  name="startTime"
                  type="time"
                  disabled={pending}
                  required
                />
                <FieldError
                  errors={state?.errors?.startTime?.map((message) => ({
                    message,
                  }))}
                />
              </Field>
              <Field data-invalid={!!state?.errors?.endTime}>
                <FieldLabel htmlFor="endTime">End time</FieldLabel>
                <Input
                  id="endTime"
                  name="endTime"
                  type="time"
                  disabled={pending}
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
              <ScheduleWorkTypePicker disabled={pending} />
              <FieldError
                errors={state?.errors?.workTypes?.map((message) => ({
                  message,
                }))}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={!!state?.errors?.contactPerson}>
                <FieldLabel htmlFor="contactPerson">
                  Contact person (optional)
                </FieldLabel>
                <Input
                  id="contactPerson"
                  name="contactPerson"
                  disabled={pending}
                />
                <FieldError
                  errors={state?.errors?.contactPerson?.map((message) => ({
                    message,
                  }))}
                />
              </Field>
              <Field data-invalid={!!state?.errors?.contactNumber}>
                <FieldLabel htmlFor="contactNumber">
                  Contact number (optional)
                </FieldLabel>
                <Input
                  id="contactNumber"
                  name="contactNumber"
                  disabled={pending}
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
              <ScheduleEmployeePicker employees={employees} disabled={pending} />
            </Field>

            {state?.message && (
              <p className="text-sm text-destructive">{state.message}</p>
            )}
          </FieldGroup>
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button type="submit" form="create-schedule-form" disabled={pending}>
            {pending ? "Creating..." : "Create schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
