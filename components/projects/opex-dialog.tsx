"use client"

import { useEffect, useState } from "react"
import { Users } from "lucide-react"
import { listMonthlyOpex } from "@/app/actions/projects"
import { MONTH_NAMES } from "@/lib/documents"
import { amount, pesoAmount, percent, type MonthSummary } from "@/lib/projects"
import { roleLabel } from "@/lib/auth/roles"
import type { OpexMonth } from "@/lib/opex"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

function profitTone(value: number) {
  return value < 0
    ? "text-rose-700 dark:text-rose-400"
    : "text-emerald-700 dark:text-emerald-400"
}

/** One figure of the month, stated rather than tabulated. */
function Figure({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: string
}) {
  return (
    <div className="bg-card px-3 py-2.5">
      <p className={cn("text-sm leading-none font-semibold tabular-nums", tone)}>
        {value}
      </p>
      <p className="mt-1.5 truncate text-[0.625rem] tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
    </div>
  )
}

/**
 * A month of the company sheet, opened.
 *
 * Read-only by design, and there is no edit button anywhere on it. Every
 * figure here is payroll's: the wages of the admin side, worked out from their
 * own punches by the rules the payslip uses. Changing any of it means changing
 * an attendance record or a pay rate, which happens where those live — a
 * project sheet that could quietly rewrite somebody's pay would be a second
 * place for payroll to be decided, and the wrong one.
 */
export function OpexDialog({
  year,
  summary,
  open,
  onOpenChange,
}: {
  year: number
  summary: MonthSummary
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [opex, setOpex] = useState<OpexMonth | null>(null)
  const month = summary.month ?? 0

  // The holidays that paid, named once for the month: they are the same days
  // for everyone who qualified, so repeating them on each row says nothing.
  const paidHolidays = [
    ...new Set(
      (opex?.people ?? []).flatMap((person) =>
        person.paidHolidays.map((day) => day.name)
      )
    ),
  ]

  useEffect(() => {
    let cancelled = false
    listMonthlyOpex(year, month).then((result) => {
      if (!cancelled) setOpex(result)
    })
    return () => {
      cancelled = true
    }
  }, [year, month])

  return (
    <Dialog
      open={open}
      disablePointerDismissal
      onOpenChange={(next, details) => {
        if (
          !next &&
          (details.reason === "outside-press" || details.reason === "focus-out")
        ) {
          return
        }
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {MONTH_NAMES[month]} {year}
          </DialogTitle>
          <DialogDescription>
            What the month made, and what running the office cost in it.
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-1 max-h-[62dvh] overflow-y-auto px-1 py-1">
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-border sm:grid-cols-4">
              <Figure
                label="Gross profit"
                value={amount(summary.grossProfit)}
                tone={profitTone(summary.grossProfit)}
              />
              <Figure label="OPEX" value={amount(summary.opex)} />
              <Figure
                label="Net profit"
                value={amount(summary.netProfit)}
                tone={profitTone(summary.netProfit)}
              />
              <Figure label="Net margin" value={percent(summary.netMargin)} />
            </div>

            <section className="overflow-hidden rounded-xl border">
              <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b bg-muted/40 px-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  <Users className="size-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm leading-tight font-medium">
                      What made up this OPEX
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Admin-side pay for the month, from their own time in and
                      out
                    </p>
                  </div>
                </div>
                <p className="text-base font-semibold tabular-nums">
                  {pesoAmount(summary.opex)}
                </p>
              </header>

              {opex === null ? (
                <p className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
                  <Spinner className="size-3.5" />
                  Working it out from the punches…
                </p>
              ) : opex.people.length === 0 ? (
                <p className="px-3 py-4 text-xs text-muted-foreground">
                  Nobody on the admin side clocked a paid day this month, so the
                  month carries no overhead.
                </p>
              ) : (
                <table className="w-full text-[0.8125rem]">
                  <thead>
                    <tr className="border-b text-[0.625rem] tracking-wide text-muted-foreground uppercase">
                      <th scope="col" className="px-3 py-1.5 text-left font-semibold">
                        Who
                      </th>
                      <th scope="col" className="px-2 py-1.5 text-right font-semibold">
                        Days
                      </th>
                      <th scope="col" className="px-2 py-1.5 text-right font-semibold">
                        Hours
                      </th>
                      <th scope="col" className="px-2 py-1.5 text-right font-semibold">
                        OT
                      </th>
                      {/* The two that no punch accounts for, given columns of
                          their own so the total is checkable. */}
                      <th scope="col" className="px-2 py-1.5 text-right font-semibold">
                        Holiday
                      </th>
                      <th scope="col" className="px-2 py-1.5 text-right font-semibold">
                        Allowance
                      </th>
                      <th scope="col" className="px-3 py-1.5 text-right font-semibold">
                        Pay
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {opex.people.map((person) => (
                      <tr key={person.employeeId} className="border-b last:border-b-0">
                        <td className="max-w-56 px-3 py-1.5">
                          <span className="block truncate" title={person.name}>
                            {person.name}
                          </span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {roleLabel(person.role)} · {person.position}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {person.daysWorked}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {person.hours.toFixed(2)}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {person.overtimeHours > 0
                            ? person.overtimeHours.toFixed(2)
                            : "—"}
                        </td>
                        <td
                          className="px-2 py-1.5 text-right tabular-nums"
                          title={person.paidHolidays
                            .map((day) => day.name)
                            .join(", ")}
                        >
                          {person.holidayPay > 0
                            ? amount(person.holidayPay)
                            : "—"}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {person.allowances > 0
                            ? amount(person.allowances)
                            : "—"}
                        </td>
                        <td className="px-3 py-1.5 text-right font-medium tabular-nums">
                          {amount(person.pay)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {paidHolidays.length > 0 && (
                <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
                  Paid without being worked: {paidHolidays.join(", ")}. A
                  regular holiday pays a full day to anyone who was present the
                  workday before it.
                </p>
              )}

              <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
                Gross wages, at what payroll would pay for the month — hours,
                overtime, night differential, holidays and any allowance added
                by hand. Deductions are not here: those come out of the
                employee&apos;s pay, not the company&apos;s. Correct an
                attendance record or a pay rate and this follows on the next
                load. There is nothing to edit here.
              </p>
            </section>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
