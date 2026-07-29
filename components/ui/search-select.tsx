"use client"

import * as React from "react"
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox"
import { CheckIcon, ChevronsUpDownIcon, SearchIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export type SearchSelectOption = {
  value: string
  label: string
  // Second line in the list — an address, a position, whatever disambiguates
  // two options that share a name.
  hint?: string
}

// A single-select that filters as you type. Exists because a client can have a
// hundred branches: a plain <Select> makes you scroll a hundred rows, while
// this narrows to the one you want in three keystrokes. Submits through a
// hidden input so it works inside a plain server-action <form>.
export function SearchSelect({
  name,
  options,
  value,
  onValueChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyMessage = "Nothing found.",
  disabled = false,
  id,
  className,
}: {
  name?: string
  options: SearchSelectOption[]
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  disabled?: boolean
  id?: string
  className?: string
}) {
  const selected = options.find((option) => option.value === value) ?? null

  return (
    <>
      {name && <input type="hidden" name={name} value={value} />}
      <ComboboxPrimitive.Root
        items={options}
        value={selected}
        onValueChange={(next) => onValueChange(next?.value ?? "")}
        itemToStringLabel={(item: SearchSelectOption) => item.label}
        disabled={disabled}
      >
        <ComboboxPrimitive.Trigger
          id={id}
          data-slot="search-select-trigger"
          className={cn(
            "flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-left text-sm transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:hover:bg-input/50",
            className
          )}
        >
          <span
            className={cn(
              "line-clamp-1 flex-1",
              !selected && "text-muted-foreground"
            )}
          >
            {selected?.label ?? placeholder}
          </span>
          <ChevronsUpDownIcon className="pointer-events-none size-4 shrink-0 text-muted-foreground" />
        </ComboboxPrimitive.Trigger>

        <ComboboxPrimitive.Portal>
          <ComboboxPrimitive.Positioner
            sideOffset={4}
            className="isolate z-50 w-(--anchor-width)"
          >
            <ComboboxPrimitive.Popup className="max-h-72 w-full origin-(--transform-origin) overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
              <div className="relative border-b">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <ComboboxPrimitive.Input
                  placeholder={searchPlaceholder}
                  className="h-9 w-full bg-transparent pr-2.5 pl-8 text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>

              {/* Stays mounted so screen readers announce the result count;
                  collapses to nothing when the list has matches. */}
              <ComboboxPrimitive.Empty className="text-center text-sm text-muted-foreground not-empty:px-3 not-empty:py-6">
                {emptyMessage}
              </ComboboxPrimitive.Empty>

              <ComboboxPrimitive.List className="max-h-56 overflow-y-auto p-1">
                {(option: SearchSelectOption) => (
                  <ComboboxPrimitive.Item
                    key={option.value}
                    value={option}
                    className="relative flex w-full cursor-default flex-col items-start gap-0.5 rounded-md py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                  >
                    <span className="line-clamp-1">{option.label}</span>
                    {option.hint && (
                      <span className="line-clamp-1 text-xs text-muted-foreground">
                        {option.hint}
                      </span>
                    )}
                    <ComboboxPrimitive.ItemIndicator className="absolute top-2 right-2">
                      <CheckIcon className="size-4" />
                    </ComboboxPrimitive.ItemIndicator>
                  </ComboboxPrimitive.Item>
                )}
              </ComboboxPrimitive.List>
            </ComboboxPrimitive.Popup>
          </ComboboxPrimitive.Positioner>
        </ComboboxPrimitive.Portal>
      </ComboboxPrimitive.Root>
    </>
  )
}
