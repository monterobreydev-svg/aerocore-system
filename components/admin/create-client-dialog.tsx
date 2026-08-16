"use client"

import { useActionState, useEffect, useState } from "react"
import { Building2, MapPin, Plus, UserRound } from "lucide-react"
import { createClient, type ClientState } from "@/app/actions/clients"
import { TAX_STATUS_OPTIONS, taxStatusLabel } from "@/lib/client"
import { ACRONYM_MAX_LENGTH } from "@/lib/documents"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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

function Required() {
  return <span className="text-destructive">*</span>
}

// The form covers three unrelated things — the company, where it's serviced,
// and who to call. Grouping them under labelled headings makes a long modal
// scannable instead of one undifferentiated stack of inputs.
function Section({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: React.ElementType
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-sky-600/10">
          <Icon className="size-3.5 text-sky-600 dark:text-sky-400" />
        </div>
        <div className="min-w-0">
          <p className="text-sm leading-tight font-medium">{title}</p>
          {hint && (
            <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
          )}
        </div>
      </div>
      <div className="border-l pl-4 sm:ml-3.5">{children}</div>
    </section>
  )
}

export function CreateClientDialog() {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState<ClientState, FormData>(
    createClient,
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
            Add client
          </Button>
        }
      />
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add client</DialogTitle>
          <DialogDescription>
            Only the registered name and head office address are required —
            everything else can be filled in later. Branches are added from the
            client&apos;s own page.
          </DialogDescription>
        </DialogHeader>

        {/* The three sections push past a short viewport, so the body scrolls
            and the header/footer stay put. Negative inset keeps focus rings
            from being clipped by the scroll container's edge. */}
        <form
          action={action}
          id="create-client-form"
          className="-mx-1 max-h-[60dvh] overflow-y-auto px-1 py-1"
        >
          <div className="flex flex-col gap-6">
            <Section
              icon={Building2}
              title="Company"
              hint="As it appears on their BIR registration"
            >
              <FieldGroup>
                <Field data-invalid={!!state?.errors?.name}>
                  <FieldLabel htmlFor="name">
                    Registered name <Required />
                  </FieldLabel>
                  <Input
                    id="name"
                    name="name"
                    placeholder="KoolAir Properties Inc."
                    autoComplete="off"
                    disabled={pending}
                    required
                  />
                  <FieldError
                    errors={state?.errors?.name?.map((message) => ({
                      message,
                    }))}
                  />
                </Field>

                {/* Optional, and usually best left alone: the acronym is
                    derived from the registered name when this is blank, and
                    the derivation is right for most companies. It's here for
                    the ones everybody calls something else. */}
                <Field data-invalid={!!state?.errors?.acronym}>
                  <FieldLabel htmlFor="acronym">
                    Acronym
                    <span className="text-xs font-normal text-muted-foreground">
                      Optional — worked out from the name if blank
                    </span>
                  </FieldLabel>
                  <Input
                    id="acronym"
                    name="acronym"
                    placeholder="KAP"
                    maxLength={ACRONYM_MAX_LENGTH}
                    autoComplete="off"
                    disabled={pending}
                    className="font-mono uppercase"
                  />
                  <FieldError
                    errors={state?.errors?.acronym?.map((message) => ({
                      message,
                    }))}
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field data-invalid={!!state?.errors?.tin}>
                    <FieldLabel htmlFor="tin">TIN</FieldLabel>
                    <Input
                      id="tin"
                      name="tin"
                      placeholder="123-456-789-000"
                      inputMode="numeric"
                      autoComplete="off"
                      disabled={pending}
                      className="font-mono"
                    />
                    <FieldError
                      errors={state?.errors?.tin?.map((message) => ({
                        message,
                      }))}
                    />
                  </Field>

                  <Field data-invalid={!!state?.errors?.taxStatus}>
                    <FieldLabel htmlFor="taxStatus">Tax status</FieldLabel>
                    <Select
                      name="taxStatus"
                      disabled={pending}
                      items={Object.fromEntries(
                        TAX_STATUS_OPTIONS.map((status) => [
                          status,
                          taxStatusLabel(status),
                        ])
                      )}
                    >
                      <SelectTrigger id="taxStatus" className="w-full">
                        <SelectValue placeholder="Select tax status" />
                      </SelectTrigger>
                      <SelectContent>
                        {TAX_STATUS_OPTIONS.map((status) => (
                          <SelectItem key={status} value={status}>
                            {taxStatusLabel(status)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldError
                      errors={state?.errors?.taxStatus?.map((message) => ({
                        message,
                      }))}
                    />
                  </Field>
                </div>
              </FieldGroup>
            </Section>

            <Section
              icon={MapPin}
              title="Head office"
              hint="Where schedules are created unless you add branches later"
            >
              <FieldGroup>
                <Field data-invalid={!!state?.errors?.address}>
                  <FieldLabel htmlFor="address">
                    Address <Required />
                  </FieldLabel>
                  <Input
                    id="address"
                    name="address"
                    placeholder="Ayala Ave, Makati City"
                    autoComplete="off"
                    disabled={pending}
                    required
                  />
                  <FieldError
                    errors={state?.errors?.address?.map((message) => ({
                      message,
                    }))}
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field data-invalid={!!state?.errors?.phoneNo}>
                    <FieldLabel htmlFor="phoneNo">Phone</FieldLabel>
                    <Input
                      id="phoneNo"
                      name="phoneNo"
                      placeholder="(02) 8888 1234"
                      inputMode="tel"
                      autoComplete="off"
                      disabled={pending}
                    />
                    <FieldError
                      errors={state?.errors?.phoneNo?.map((message) => ({
                        message,
                      }))}
                    />
                  </Field>

                  <Field data-invalid={!!state?.errors?.email}>
                    <FieldLabel htmlFor="email">Email</FieldLabel>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="admin@company.ph"
                      autoComplete="off"
                      disabled={pending}
                    />
                    <FieldError
                      errors={state?.errors?.email?.map((message) => ({
                        message,
                      }))}
                    />
                  </Field>
                </div>
              </FieldGroup>
            </Section>

            <Section
              icon={UserRound}
              title="Main contact person"
              hint="Optional — saved as the main contact. Add more from the client's page."
            >
              <FieldGroup>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field data-invalid={!!state?.errors?.contactName}>
                    <FieldLabel htmlFor="contactName">Name</FieldLabel>
                    <Input
                      id="contactName"
                      name="contactName"
                      placeholder="Marites Santos"
                      autoComplete="off"
                      disabled={pending}
                    />
                    <FieldError
                      errors={state?.errors?.contactName?.map((message) => ({
                        message,
                      }))}
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="contactPosition">Position</FieldLabel>
                    <Input
                      id="contactPosition"
                      name="contactPosition"
                      placeholder="Building Administrator"
                      autoComplete="off"
                      disabled={pending}
                    />
                  </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="contactPhoneNo">Phone</FieldLabel>
                    <Input
                      id="contactPhoneNo"
                      name="contactPhoneNo"
                      placeholder="0917 123 4567"
                      inputMode="tel"
                      autoComplete="off"
                      disabled={pending}
                    />
                  </Field>

                  <Field data-invalid={!!state?.errors?.contactEmail}>
                    <FieldLabel htmlFor="contactEmail">Email</FieldLabel>
                    <Input
                      id="contactEmail"
                      name="contactEmail"
                      type="email"
                      placeholder="name@company.ph"
                      autoComplete="off"
                      disabled={pending}
                    />
                    <FieldError
                      errors={state?.errors?.contactEmail?.map((message) => ({
                        message,
                      }))}
                    />
                  </Field>
                </div>
              </FieldGroup>
            </Section>

            {state?.message && (
              <p className="text-sm text-destructive">{state.message}</p>
            )}
          </div>
        </form>

        <DialogFooter className="sm:items-center sm:justify-between">
          <p className="hidden text-xs text-muted-foreground sm:block">
            <Required /> Required
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" form="create-client-form" disabled={pending}>
              {pending ? "Adding..." : "Add client"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
