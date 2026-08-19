"use client"

import { Input } from "@/components/ui/input"

/**
 * An input that refuses characters that cannot belong in it.
 *
 * `pattern` and server validation both report a bad value *after* the fact —
 * you type a letter into a phone number, nothing happens, and you find out at
 * submit. This rejects the keystroke instead, so the field can only ever hold
 * something valid.
 *
 * Works on uncontrolled fields (the staff forms use `defaultValue`) by editing
 * the element's own value on `input`. The caret is put back where it was: since
 * sanitising only ever *removes* characters, walking it back by the number
 * dropped leaves it exactly where the typist expects — otherwise correcting a
 * digit in the middle of a number would fling the cursor to the end.
 *
 * Paste is covered too, because it fires `input` like anything else: pasting
 * "Tel: 0917 123 4567" leaves "0917 123 4567" behind.
 */
export function ConstrainedInput({
  sanitize,
  onInput,
  ...props
}: React.ComponentProps<typeof Input> & {
  sanitize: (value: string) => string
}) {
  return (
    <Input
      {...props}
      onInput={(event) => {
        const element = event.currentTarget
        const before = element.value
        const after = sanitize(before)

        if (after !== before) {
          const caret = element.selectionStart ?? before.length
          element.value = after
          const moved = caret - (before.length - after.length)
          element.setSelectionRange(moved, moved)
        }

        onInput?.(event)
      }}
    />
  )
}
