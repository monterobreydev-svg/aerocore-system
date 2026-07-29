"use client"

import { useState } from "react"
import { SKILL_OPTIONS } from "@/lib/employee"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"
import { FieldLabel } from "@/components/ui/field"

// A fixed checkbox set rather than free text: skills drive who gets picked
// for a job, and typing "aircon cleaning" vs "Cleaning" quietly breaks that.
// Every box shares the `skills` name, so the action reads them back with
// formData.getAll("skills").
export function SkillsPicker({
  idPrefix,
  name = "skills",
  selected = [],
  disabled = false,
}: {
  idPrefix: string
  name?: string
  selected?: readonly string[]
  disabled?: boolean
}) {
  // Controlled so the "all-round technician" helper can tick the set in one
  // go — most employees can do most of these, and eight clicks per hire
  // is the kind of friction that ends with the field left blank.
  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(SKILL_OPTIONS.map((s) => [s, selected.includes(s)]))
  )

  const checkedCount = SKILL_OPTIONS.filter((skill) => checked[skill]).length
  const allChecked = checkedCount === SKILL_OPTIONS.length

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label
          className={cn(
            "flex cursor-pointer items-center gap-2 text-xs text-muted-foreground",
            disabled && "pointer-events-none opacity-50"
          )}
        >
          <Checkbox
            id={`${idPrefix}-all`}
            checked={allChecked}
            indeterminate={checkedCount > 0 && !allChecked}
            onCheckedChange={(value) =>
              setChecked(
                Object.fromEntries(SKILL_OPTIONS.map((s) => [s, !!value]))
              )
            }
            disabled={disabled}
          />
          <span>{allChecked ? "Clear all" : "Select all"}</span>
        </label>
        <span className="text-xs text-muted-foreground">
          {checkedCount} of {SKILL_OPTIONS.length} selected
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {SKILL_OPTIONS.map((skill) => {
          const id = `${idPrefix}-${skill.toLowerCase().replace(/[^a-z]+/g, "-")}`
          return (
            <div
              key={skill}
              className="flex items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors has-data-checked:border-sky-600/40 has-data-checked:bg-sky-600/5"
            >
              <Checkbox
                id={id}
                name={name}
                value={skill}
                checked={checked[skill] ?? false}
                onCheckedChange={(value) =>
                  setChecked((prev) => ({ ...prev, [skill]: !!value }))
                }
                disabled={disabled}
              />
              <FieldLabel
                htmlFor={id}
                className="flex-1 cursor-pointer text-sm font-normal"
              >
                {skill}
              </FieldLabel>
            </div>
          )
        })}
      </div>
    </div>
  )
}
