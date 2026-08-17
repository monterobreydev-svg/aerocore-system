"use client"

import { useActionState, useState } from "react"
import { AtSign, CheckCircle2 } from "lucide-react"

import { changeUsername, type UsernameState } from "@/app/actions/profile"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"

/**
 * Changing the name you sign in with.
 *
 * Behind a button rather than sitting open, because this is the one field on
 * the page that changes how you get back in — and on the shared phone it is the
 * *only* thing that identifies you, so a careless edit strands somebody at a
 * site gate typing a name that no longer exists.
 *
 * The current password is asked for here for the same reason the password form
 * asks for it: on an unlocked handset, anything less lets a passer-by take the
 * owner's account away from them.
 */
export function UsernameForm({
  username,
  section,
}: {
  username: string
  section: "admin" | "employee"
}) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState<UsernameState, FormData>(
    changeUsername,
    undefined
  )
  // Each call returns a fresh state object, so comparing identity is what
  // separates "just succeeded" from "succeeded earlier and was acknowledged" —
  // the same trick the password form uses, and it needs no effect.
  const [acknowledged, setAcknowledged] = useState<UsernameState>(undefined)
  const [formKey, setFormKey] = useState(0)

  const justChanged = !!state?.success && state !== acknowledged

  if (!open || justChanged) {
    return (
      <div className="flex items-center justify-between gap-3 py-1">
        <span className="min-w-0">
          <span className="block font-mono text-sm">{username}</span>
          {justChanged && state?.message && (
            <span className="mt-0.5 flex items-start gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
              {state.message}
            </span>
          )}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setAcknowledged(state)
            setFormKey((key) => key + 1)
            setOpen(true)
          }}
        >
          Change
        </Button>
      </div>
    )
  }

  return (
    <form key={formKey} action={action} className="py-1">
      <input type="hidden" name="section" value={section} />

      <FieldGroup className="gap-3">
        <Field data-invalid={!!state?.errors?.username}>
          <FieldLabel htmlFor="username">New username</FieldLabel>
          <Input
            id="username"
            name="username"
            defaultValue={username}
            // Phone keyboards capitalise the first letter, and sign-in matches
            // exactly — the same reason the kiosk's field turns this off.
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={pending}
            required
            className="font-mono"
          />
          <FieldDescription>
            What you type to sign in, and what the crew types on the shared
            phone. Letters, numbers and . _ @ + - only.
          </FieldDescription>
          <FieldError
            errors={state?.errors?.username?.map((message) => ({ message }))}
          />
        </Field>

        <Field data-invalid={!!state?.errors?.currentPassword}>
          <FieldLabel htmlFor="username-password">Current password</FieldLabel>
          <Input
            id="username-password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            disabled={pending}
            required
          />
          <FieldError
            errors={state?.errors?.currentPassword?.map((message) => ({
              message,
            }))}
          />
        </Field>

        {state?.message && !state.success && (
          <p className="text-xs text-destructive">{state.message}</p>
        )}

        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={pending}>
            <AtSign />
            {pending ? "Saving…" : "Save username"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
        </div>
      </FieldGroup>
    </form>
  )
}
