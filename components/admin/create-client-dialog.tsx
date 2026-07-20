"use client"

import { useActionState, useEffect, useState } from "react"
import { Plus } from "lucide-react"
import { createClient, type ClientState } from "@/app/actions/clients"
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add client</DialogTitle>
          <DialogDescription>
            Add a new client company. You can add branches afterward.
          </DialogDescription>
        </DialogHeader>

        <form action={action} id="create-client-form">
          <FieldGroup>
            <Field data-invalid={!!state?.errors?.name}>
              <FieldLabel htmlFor="name">Client name</FieldLabel>
              <Input id="name" name="name" disabled={pending} required />
              <FieldError
                errors={state?.errors?.name?.map((message) => ({ message }))}
              />
            </Field>

            <Field data-invalid={!!state?.errors?.tin}>
              <FieldLabel htmlFor="tin">TIN</FieldLabel>
              <Input
                id="tin"
                name="tin"
                placeholder="e.g. 123-456-789-000"
                disabled={pending}
              />
              <FieldError
                errors={state?.errors?.tin?.map((message) => ({ message }))}
              />
            </Field>

            <Field data-invalid={!!state?.errors?.address}>
              <FieldLabel htmlFor="address">Address</FieldLabel>
              <Input
                id="address"
                name="address"
                disabled={pending}
                required
              />
              <FieldError
                errors={state?.errors?.address?.map((message) => ({
                  message,
                }))}
              />
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
          <Button type="submit" form="create-client-form" disabled={pending}>
            {pending ? "Adding..." : "Add client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
