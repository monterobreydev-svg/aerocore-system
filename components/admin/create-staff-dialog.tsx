"use client"

import { useActionState, useEffect, useState } from "react"
import { Eye, EyeOff, Plus } from "lucide-react"
import { createStaffAccount, type StaffState } from "@/app/actions/staff"
import type { Role } from "@/app/generated/prisma/client"
import { assignableRoles, roleLabel } from "@/lib/roles"
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

export function CreateStaffDialog({ currentRole }: { currentRole: Role }) {
  const [open, setOpen] = useState(false)
  const roleOptions = assignableRoles(currentRole)
  const canChooseRole = roleOptions.length > 1
  const [showPassword, setShowPassword] = useState(false)
  const [state, action, pending] = useActionState<StaffState, FormData>(
    createStaffAccount,
    undefined
  )

  useEffect(() => {
    if (state?.success) {
      setOpen(false)
    }
  }, [state])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <Plus />
            Add staff
          </Button>
        }
      />
      <DialogContent className="max-h-[85vh] sm:max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add staff account</DialogTitle>
          <DialogDescription>
            Creates the employee record and their login account together.
          </DialogDescription>
        </DialogHeader>

        <form action={action} id="create-staff-form">
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field data-invalid={!!state?.errors?.firstName}>
                <FieldLabel htmlFor="firstName">First name</FieldLabel>
                <Input
                  id="firstName"
                  name="firstName"
                  disabled={pending}
                  required
                />
                <FieldError
                  errors={state?.errors?.firstName?.map((message) => ({
                    message,
                  }))}
                />
              </Field>
              <Field data-invalid={!!state?.errors?.middleName}>
                <FieldLabel htmlFor="middleName">Middle name</FieldLabel>
                <Input id="middleName" name="middleName" disabled={pending} />
                <FieldError
                  errors={state?.errors?.middleName?.map((message) => ({
                    message,
                  }))}
                />
              </Field>
              <Field data-invalid={!!state?.errors?.lastName}>
                <FieldLabel htmlFor="lastName">Last name</FieldLabel>
                <Input
                  id="lastName"
                  name="lastName"
                  disabled={pending}
                  required
                />
                <FieldError
                  errors={state?.errors?.lastName?.map((message) => ({
                    message,
                  }))}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field data-invalid={!!state?.errors?.position}>
                <FieldLabel htmlFor="position">Position</FieldLabel>
                <Input
                  id="position"
                  name="position"
                  placeholder="e.g. Technician"
                  disabled={pending}
                  required
                />
                <FieldError
                  errors={state?.errors?.position?.map((message) => ({
                    message,
                  }))}
                />
              </Field>
              <Field data-invalid={!!state?.errors?.hourlyRate}>
                <FieldLabel htmlFor="hourlyRate">Hourly rate</FieldLabel>
                <Input
                  id="hourlyRate"
                  name="hourlyRate"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  disabled={pending}
                  required
                />
                <FieldError
                  errors={state?.errors?.hourlyRate?.map((message) => ({
                    message,
                  }))}
                />
              </Field>

              <Field data-invalid={!!state?.errors?.role}>
                <FieldLabel htmlFor="role">Role</FieldLabel>
                {canChooseRole ? (
                  <Select
                    name="role"
                    defaultValue="EMPLOYEE"
                    disabled={pending}
                    items={Object.fromEntries(
                      roleOptions.map((role) => [role, roleLabel(role)])
                    )}
                  >
                    <SelectTrigger id="role" className="w-full">
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      {roleOptions.map((role) => (
                        <SelectItem key={role} value={role}>
                          {roleLabel(role)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <>
                    <Input
                      id="role"
                      value={roleLabel(roleOptions[0])}
                      disabled
                      readOnly
                      className="text-muted-foreground"
                    />
                    <input type="hidden" name="role" value={roleOptions[0]} />
                  </>
                )}
                <FieldError
                  errors={state?.errors?.role?.map((message) => ({
                    message,
                  }))}
                />
              </Field>
            </div>

            <Field data-invalid={!!state?.errors?.skills}>
              <FieldLabel htmlFor="skills">Skills</FieldLabel>
              <Input
                id="skills"
                name="skills"
                placeholder="e.g. Aircon installation, Electrical wiring"
                disabled={pending}
              />
              <FieldError
                errors={state?.errors?.skills?.map((message) => ({
                  message,
                }))}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={!!state?.errors?.emergencyContactPerson}>
                <FieldLabel htmlFor="emergencyContactPerson">
                  Emergency contact name
                </FieldLabel>
                <Input
                  id="emergencyContactPerson"
                  name="emergencyContactPerson"
                  disabled={pending}
                />
                <FieldError
                  errors={state?.errors?.emergencyContactPerson?.map(
                    (message) => ({ message })
                  )}
                />
              </Field>
              <Field data-invalid={!!state?.errors?.emergencyContactNo}>
                <FieldLabel htmlFor="emergencyContactNo">
                  Emergency contact number
                </FieldLabel>
                <Input
                  id="emergencyContactNo"
                  name="emergencyContactNo"
                  disabled={pending}
                />
                <FieldError
                  errors={state?.errors?.emergencyContactNo?.map(
                    (message) => ({ message })
                  )}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={!!state?.errors?.username}>
                <FieldLabel htmlFor="username">Username</FieldLabel>
                <Input
                  id="username"
                  name="username"
                  autoComplete="off"
                  disabled={pending}
                  required
                />
                <FieldError
                  errors={state?.errors?.username?.map((message) => ({
                    message,
                  }))}
                />
              </Field>
              <Field data-invalid={!!state?.errors?.password}>
                <FieldLabel htmlFor="password">Initial password</FieldLabel>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    disabled={pending}
                    required
                    className="pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    disabled={pending}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground outline-none hover:text-foreground disabled:pointer-events-none"
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
                <FieldError
                  errors={state?.errors?.password?.map((message) => ({
                    message,
                  }))}
                />
              </Field>
            </div>

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
          <Button type="submit" form="create-staff-form" disabled={pending}>
            {pending ? "Creating..." : "Create account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
