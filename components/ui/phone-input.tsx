"use client"

import { useState } from "react"

import {
  PH_COUNTRY_CODE,
  PH_SUBSCRIBER_MAX_DIGITS,
  toPhoneSubscriber,
  toStoredPhone,
} from "@/lib/employee"
import { cn } from "@/lib/utils"

/**
 * A Philippine phone number, with the country code built into the field.
 *
 * "+63" is chrome, not content: it sits outside the editable area, so it cannot
 * be deleted, duplicated, or replaced with a letter, and the person filling the
 * form types only the part that varies. What posts is the whole number —
 * "+63 917 123 4567" — through a hidden input, so the server still receives one
 * complete value and nothing downstream has to reassemble it.
 *
 * Anything pasted is folded into the same shape: "0917 123 4567" loses its
 * trunk zero, "+63 917 123 4567" loses the duplicate country code. Both of
 * those are what people actually have in their contacts, and both would
 * otherwise produce a wrong number.
 */
export function PhoneInput({
  id,
  name,
  defaultValue = "",
  disabled,
  placeholder = "917 123 4567",
  className,
}: {
  id?: string
  name: string
  defaultValue?: string
  disabled?: boolean
  placeholder?: string
  className?: string
}) {
  const [subscriber, setSubscriber] = useState(() =>
    toPhoneSubscriber(defaultValue)
  )

  return (
    <>
      <div
        className={cn(
          "flex h-8 w-full min-w-0 items-center rounded-lg border border-input bg-transparent transition-colors",
          "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
          "has-disabled:pointer-events-none has-disabled:bg-input/50 has-disabled:opacity-50",
          "dark:bg-input/30",
          className
        )}
      >
        <span
          // Presentational: the value it stands for is carried by the hidden
          // input below, and a screen reader gets it from the field's label.
          aria-hidden
          className="pointer-events-none select-none border-r px-2 text-sm text-muted-foreground"
        >
          {PH_COUNTRY_CODE}
        </span>
        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={subscriber}
          onChange={(event) =>
            setSubscriber(toPhoneSubscriber(event.target.value))
          }
          disabled={disabled}
          placeholder={placeholder}
          // Generous next to the 10-digit cap, which is enforced on the value —
          // this only stops a paste of nonsense from being processed at all.
          maxLength={PH_SUBSCRIBER_MAX_DIGITS * 2}
          className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-base outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed md:text-sm"
        />
      </div>
      <input type="hidden" name={name} value={toStoredPhone(subscriber)} />
    </>
  )
}
