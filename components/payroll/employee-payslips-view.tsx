"use client"

import { useState } from "react"
import {
  Banknote,
  CalendarDays,
  ChevronDown,
  Download,
  MinusCircle,
  Wallet,
} from "lucide-react"

import { peso } from "@/lib/reimbursement"
import { cn } from "@/lib/utils"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export type PayslipSummary = {
  /** "2026-08-16" — the cutoff, as the download route names it. */
  cutoffDay: string
  cutoffLabel: string
  releasedAt: string
  daysWorked: number
  regularHours: number
  overtimeHours: number
  nightHours: number
  nightPaidHours: number
  basicPay: number
  overtimePay: number
  nightPay: number
  holidayPay: number
  restDayPay: number
  specialHolidayPay: number
  adjustmentAdditions: number
  gross: number
  deductions: number
  net: number
}

function Line({
  label,
  value,
  muted,
  strong,
}: {
  label: string
  value: string
  muted?: boolean
  strong?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span
        className={cn(
          "min-w-0 truncate text-xs",
          strong ? "font-medium text-foreground" : "text-muted-foreground"
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "shrink-0 text-sm tabular-nums",
          strong && "font-semibold",
          muted && "text-muted-foreground"
        )}
      >
        {value}
      </span>
    </div>
  )
}

/**
 * One released period.
 *
 * Net pay is the headline because it is the only figure most people open this
 * for. What made it up is one tap away, and the day-by-day working that made
 * *that* up is a download — a fortnight of hours is a table, and a table on a
 * phone over 3G is a page nobody waits for.
 */
function PayslipCard({
  slip,
  open,
  onToggle,
}: {
  slip: PayslipSummary
  open: boolean
  onToggle: () => void
}) {
  return (
    <Card size="sm" className="shadow-sm">
      <CardContent className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand/10">
            <Wallet className="size-5 text-brand" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{slip.cutoffLabel}</p>
            <p className="truncate text-xs text-muted-foreground">
              {slip.daysWorked} {slip.daysWorked === 1 ? "day" : "days"} ·{" "}
              {slip.regularHours} h
              {slip.overtimeHours > 0 && ` · ${slip.overtimeHours} h OT`}
            </p>
          </div>

          <div className="text-right">
            <p className="text-lg leading-none font-semibold tabular-nums">
              {peso(slip.net)}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">Net pay</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onToggle}
            aria-expanded={open}
          >
            <ChevronDown
              className={cn("transition-transform", open && "rotate-180")}
            />
            {open ? "Hide summary" : "Summary"}
          </Button>

          {/* A plain link, so the browser takes the download into its own list
              rather than holding it in a page the employee might leave — and
              styled rather than rendered through <Button>, because Base UI's
              Button expects a native <button> underneath and says so. */}
          <a
            href={`/api/payslips/download?cutoff=${slip.cutoffDay}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "ml-auto")}
          >
            <Download />
            Download PDF
          </a>
        </div>

        {open && (
          <div className="grid gap-x-6 gap-y-1 border-t pt-2 sm:grid-cols-2">
            <div>
              <p className="flex items-center gap-1.5 py-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                <Banknote className="size-3.5" />
                Earnings
              </p>
              <Line
                label={`Basic · ${slip.regularHours - slip.nightPaidHours} h`}
                value={peso(slip.basicPay)}
              />
              <Line
                label={`Overtime · ${slip.overtimeHours} h`}
                value={peso(slip.overtimePay)}
                muted={slip.overtimePay === 0}
              />
              {/* The night hours in full — their own pay plus the premium —
                  because "night differential 8.75" against a rate of 87.50
                  reads as though the hour was worth a tenth of a day hour.
                  They are left out of Basic above rather than counted twice. */}
              <Line
                label={`Night · ${slip.nightPaidHours} h at rate +10%`}
                value={peso(slip.nightPay)}
                muted={slip.nightPay === 0}
              />
              <Line
                label="Rest day (Sundays worked, +30%)"
                value={peso(slip.restDayPay)}
                muted={slip.restDayPay === 0}
              />
              <Line
                label="Special holiday (+30%)"
                value={peso(slip.specialHolidayPay)}
                muted={slip.specialHolidayPay === 0}
              />
              <Line
                label="Holiday pay"
                value={peso(slip.holidayPay)}
                muted={slip.holidayPay === 0}
              />
              {slip.adjustmentAdditions > 0 && (
                <Line
                  label="Adjustments"
                  value={peso(slip.adjustmentAdditions)}
                />
              )}
              <Line label="Gross pay" value={peso(slip.gross)} strong />
            </div>

            <div>
              <p className="flex items-center gap-1.5 py-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                <MinusCircle className="size-3.5" />
                Deductions
              </p>
              {/* One figure, not a breakdown: which schedule took what is in
                  the PDF, and putting four more rows here is how a summary
                  stops being one. */}
              <Line
                label="SSS, PhilHealth, Pag-IBIG and adjustments"
                value={peso(slip.deductions)}
                muted={slip.deductions === 0}
              />
              <Line label="Net pay" value={peso(slip.net)} strong />
              <p className="pt-2 text-[11px] leading-relaxed text-muted-foreground">
                Download the PDF for the day-by-day computation every figure
                here is the sum of.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function EmployeePayslipsView({
  payslips,
}: {
  payslips: PayslipSummary[]
}) {
  // The newest is the one being opened for, so it starts open and the rest
  // stay as a list of headlines.
  const [openDay, setOpenDay] = useState<string | null>(
    payslips[0]?.cutoffDay ?? null
  )

  if (payslips.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center sm:p-12">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <CalendarDays className="size-5 text-muted-foreground" />
        </div>
        <p className="max-w-sm text-sm text-muted-foreground">
          No payslips yet. One appears here as soon as the office releases the
          payroll for a finished period.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {payslips.map((slip) => (
        <PayslipCard
          key={slip.cutoffDay}
          slip={slip}
          open={openDay === slip.cutoffDay}
          onToggle={() =>
            setOpenDay((current) =>
              current === slip.cutoffDay ? null : slip.cutoffDay
            )
          }
        />
      ))}
    </div>
  )
}
