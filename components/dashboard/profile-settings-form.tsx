"use client"

import { useActionState } from "react"
import { updateProfile, type ProfileState } from "@/app/actions/profile"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

type Employee = {
  firstName: string
  lastName: string
  middleName: string | null
  position: string
  emergencyContactPerson: string | null
  emergencyContactNo: string | null
}

export function ProfileSettingsForm({
  section,
  employee,
}: {
  section: "admin" | "employee"
  employee: Employee
}) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(
    updateProfile,
    undefined
  )

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Personal details</CardTitle>
        <CardDescription>
          Update your name and emergency contact information.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action}>
          <input type="hidden" name="section" value={section} />
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={!!state?.errors?.firstName}>
                <FieldLabel htmlFor="firstName">First name</FieldLabel>
                <Input
                  id="firstName"
                  name="firstName"
                  defaultValue={employee.firstName}
                  aria-invalid={!!state?.errors?.firstName}
                  disabled={pending}
                  required
                />
                <FieldError
                  errors={state?.errors?.firstName?.map((message) => ({
                    message,
                  }))}
                />
              </Field>
              <Field data-invalid={!!state?.errors?.lastName}>
                <FieldLabel htmlFor="lastName">Last name</FieldLabel>
                <Input
                  id="lastName"
                  name="lastName"
                  defaultValue={employee.lastName}
                  aria-invalid={!!state?.errors?.lastName}
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

            <Field data-invalid={!!state?.errors?.middleName}>
              <FieldLabel htmlFor="middleName">Middle name</FieldLabel>
              <Input
                id="middleName"
                name="middleName"
                defaultValue={employee.middleName ?? ""}
                disabled={pending}
              />
              <FieldError
                errors={state?.errors?.middleName?.map((message) => ({
                  message,
                }))}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="position">Position</FieldLabel>
              <Input
                id="position"
                defaultValue={employee.position}
                disabled
                className="text-muted-foreground"
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
                  defaultValue={employee.emergencyContactPerson ?? ""}
                  placeholder="e.g. Maria Dela Cruz"
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
                  defaultValue={employee.emergencyContactNo ?? ""}
                  placeholder="e.g. 0917 123 4567"
                  disabled={pending}
                />
                <FieldError
                  errors={state?.errors?.emergencyContactNo?.map(
                    (message) => ({ message })
                  )}
                />
              </Field>
            </div>

            {state?.message && (
              <p className="text-sm text-sky-600">{state.message}</p>
            )}

            <Button type="submit" disabled={pending} className="w-fit">
              {pending ? "Saving..." : "Save changes"}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
