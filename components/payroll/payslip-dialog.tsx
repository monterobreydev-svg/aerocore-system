"use client"

import { useEffect, useState } from "react"
import { Download, Minus, Plus, Send, Trash2, X } from "lucide-react"
import {
  addPayrollAdjustment,
  getPayslip,
  removePayrollAdjustment,
  type AdjustmentRow,
  type PayslipDetail,
} from "@/app/actions/payroll"
import { Input } from "@/components/ui/input"
import { dayLabel, minutesLabel } from "@/lib/attendance"
import { peso } from "@/lib/reimbursement"
import {
  NIGHT_DIFFERENTIAL_RATE,
  OVERTIME_STARTS_AFTER_HOURS,
  PAGIBIG_MONTHLY,
  PHILHEALTH_EMPLOYEE_RATE,
  REGULAR_HOURS_PER_DAY,
} from "@/lib/payroll"
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

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

/** One line of the payslip: what it is, how it was arrived at, what it's worth. */
function Line({
  label,
  basis,
  amount,
  negative,
  strong,
  /**
   * Owed but not taken out of this cutoff. Printed as "due" rather than as a
   * minus figure: a line reading "−₱650.00" above a total of "−₱0.00" says two
   * different things about the same money.
   */
  due,
}: {
  label: string
  basis?: string
  amount: number
  negative?: boolean
  strong?: boolean
  due?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="min-w-0">
        <span className={cn("text-sm", strong && "font-medium")}>{label}</span>
        {basis && (
          <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">
            {basis}
          </span>
        )}
      </span>
      <span
        className={cn(
          "shrink-0 text-sm tabular-nums",
          strong && "font-semibold",
          (negative || due) && "text-muted-foreground"
        )}
      >
        {due ? (
          <>
            {peso(amount)}
            <span className="ml-1 text-xs">due</span>
          </>
        ) : (
          <>
            {negative ? "−" : ""}
            {peso(amount)}
          </>
        )}
      </span>
    </div>
  )
}

function Panel({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border bg-card">
      <p className="border-b px-3 py-2 text-[0.6875rem] font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </p>
      <div className="divide-y px-3 py-1">{children}</div>
    </section>
  )
}

/** One of the four hour/day figures across the top. */
function Figure({
  label,
  value,
  note,
}: {
  label: string
  value: string
  note?: string
}) {
  return (
    <div className="rounded-lg border px-2.5 py-2">
      <p className="text-[0.625rem] tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
      {note && (
        <p className="text-[0.625rem] text-amber-700 tabular-nums dark:text-amber-400">
          {note}
        </p>
      )}
    </div>
  )
}

/**
 * Corrections the office makes by hand, and the form for adding one.
 *
 * Everything else on this payslip is derived from evidence — a punch, an
 * approved request, a published contribution table. This is the one part
 * somebody simply decides, so it names who decided it and stays removable
 * while the period is open.
 */
function Adjustments({
  employeeId,
  cutoffDay,
  rows,
  onChanged,
}: {
  employeeId: string
  cutoffDay: string
  rows: AdjustmentRow[]
  onChanged: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [direction, setDirection] = useState<"add" | "deduct">("add")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The action is awaited here rather than driven through useActionState and
  // an effect: everything that follows a save — close the form, re-read the
  // payslip — is a consequence of the click, and belongs in the handler that
  // handled it. An effect watching for `success` would be a second render
  // pass doing what this line already does.
  async function save(formData: FormData) {
    setPending(true)
    setError(null)
    const result = await addPayrollAdjustment(undefined, formData)
    setPending(false)

    if (result?.success) {
      setAdding(false)
      onChanged()
      return
    }
    setError(result?.message ?? "That didn't save.")
  }

  return (
    <section className="rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <p className="text-[0.6875rem] font-medium tracking-wide text-muted-foreground uppercase">
          Adjustments
        </p>
        {!adding && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => setAdding(true)}
          >
            <Plus />
            Add
          </Button>
        )}
      </div>

      <div className="flex flex-col divide-y px-3 py-1">
        {rows.length === 0 && !adding && (
          <p className="py-2 text-xs text-muted-foreground">
            None this cutoff. Add one for an agreed allowance, a cash advance
            being repaid, or anything else the clock can&apos;t see.
          </p>
        )}

        {rows.map((row) => (
          <div
            key={row.id}
            className="flex items-baseline justify-between gap-2 py-1.5"
          >
            <span className="min-w-0">
              <span className="text-sm">{row.label}</span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {row.createdByName}
                {row.note && ` · ${row.note}`}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <span
                className={cn(
                  "text-sm font-medium tabular-nums",
                  row.amount < 0
                    ? "text-amber-700 dark:text-amber-400"
                    : "text-emerald-700 dark:text-emerald-400"
                )}
              >
                {row.amount < 0 ? "−" : "+"}
                {peso(Math.abs(row.amount))}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove ${row.label}`}
                onClick={async () => {
                  await removePayrollAdjustment(row.id)
                  onChanged()
                }}
              >
                <Trash2 />
              </Button>
            </span>
          </div>
        ))}

        {adding && (
          <form action={save} className="flex flex-col gap-2 py-2.5">
            <input type="hidden" name="employeeId" value={employeeId} />
            <input type="hidden" name="cutoffDay" value={cutoffDay} />
            <input type="hidden" name="direction" value={direction} />

            <div className="flex gap-2">
              {/* Sign as a choice, not a minus key: "deduct ₱500" is what the
                  office says, and it can't be fat-fingered into a payment. */}
              <div className="flex shrink-0 rounded-lg border p-0.5">
                {(["add", "deduct"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setDirection(option)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium capitalize transition-colors",
                      direction === option
                        ? option === "add"
                          ? "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
                          : "bg-amber-600/10 text-amber-700 dark:text-amber-400"
                        : "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {option === "add" ? (
                      <Plus className="size-3" />
                    ) : (
                      <Minus className="size-3" />
                    )}
                    {option}
                  </button>
                ))}
              </div>

              <Input
                name="amount"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                placeholder="0.00"
                required
                className="h-8 w-28 text-sm tabular-nums"
              />
              <Input
                name="label"
                placeholder="What is it for?"
                required
                maxLength={60}
                className="h-8 min-w-0 flex-1 text-sm"
              />
            </div>

            <Input
              name="note"
              placeholder="Note (optional)"
              maxLength={200}
              className="h-8 text-sm"
            />

            {error && <p className="text-xs text-destructive">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setAdding(false)}
                disabled={pending}
              >
                <X />
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Saving…" : "Save adjustment"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </section>
  )
}

export function PayslipDialog({
  employeeId,
  cutoffDay,
  cutoffLabel,
  open,
  onOpenChange,
}: {
  employeeId: string
  cutoffDay: string
  cutoffLabel: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [detail, setDetail] = useState<PayslipDetail | null>(null)
  // Bumped after an adjustment is added or removed, which re-runs the fetch —
  // the figures all move when one does, so the whole payslip is re-read rather
  // than patched in the browser.
  const [reloads, setReloads] = useState(0)

  // No reset on the way in: the dialog is keyed by employee, so switching rows
  // mounts a fresh one with `detail` already null. Clearing it here instead
  // would be a setState in an effect body — and the failure it guards against
  // (one person's figures showing under another person's name, however
  // briefly) is not one to solve with a race.
  useEffect(() => {
    let cancelled = false

    void (async () => {
      const result = await getPayslip(employeeId, cutoffDay)
      if (!cancelled) setDetail(result)
    })()

    return () => {
      cancelled = true
    }
  }, [employeeId, cutoffDay, reloads])

  const slip = detail?.payslip
  // Some or all of what the schedules asked for stayed behind, which changes
  // how the deduction lines should read: owed, not taken.
  const uncollected = (slip?.deductions.shortfall ?? 0) > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Edge to edge — `sm:p-0` as well as `p-0`, or the popup's own
          `sm:p-4` frames the whole thing in a band of white above 640px. */}
      <DialogContent className="grid max-h-[92dvh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-2xl sm:p-0 lg:max-w-4xl">
        <DialogHeader className="min-w-0 flex-row items-center gap-3 border-b bg-muted/30 px-4 py-3 pr-12 sm:px-5 sm:pr-14">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-strong text-xs font-semibold text-brand-foreground">
            {detail ? initials(detail.employeeName) : "—"}
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-base">
              {detail?.employeeName ?? "Payslip"}
            </DialogTitle>
            <DialogDescription className="truncate text-xs">
              {detail
                ? `${detail.position}${detail.employeeNo ? ` · ${detail.employeeNo}` : ""} · ${peso(detail.payslip.hourlyRate)}/hour`
                : "Working it out…"}
            </DialogDescription>
          </div>
          <span className="hidden shrink-0 text-right sm:block">
            <span className="block text-[0.6875rem] text-muted-foreground uppercase">
              Period
            </span>
            <span className="block text-xs font-medium tabular-nums">
              {cutoffLabel}
            </span>
          </span>
        </DialogHeader>

        <div className="min-h-0 min-w-0 overflow-y-auto p-4 sm:p-5">
          {!slip ? (
            <span className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Spinner className="size-4" />
              Loading the breakdown…
            </span>
          ) : (
            <div className="flex flex-col gap-4">
              {/* The answer, then the workings. */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-gradient-to-br from-sidebar to-[color-mix(in_oklab,var(--sidebar)_80%,var(--brand))] p-4 text-sidebar-foreground sm:col-span-1">
                  <p className="text-[0.6875rem] tracking-widest text-sidebar-foreground/60 uppercase">
                    Net pay
                  </p>
                  <p className="mt-1 text-2xl leading-none font-semibold">
                    {peso(slip.net)}
                  </p>
                  <p className="mt-2 text-xs text-sidebar-foreground/70 tabular-nums">
                    {slip.daysWorked} days · {slip.regularHours} h
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:col-span-2">
                  <div className="rounded-xl border p-3">
                    <p className="text-[0.6875rem] text-muted-foreground uppercase">
                      Gross
                    </p>
                    <p className="mt-1 text-lg font-semibold tabular-nums">
                      {peso(slip.gross)}
                    </p>
                  </div>
                  <div className="rounded-xl border p-3">
                    <p className="text-[0.6875rem] text-muted-foreground uppercase">
                      Deductions
                    </p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                      −{peso(slip.deductions.total)}
                    </p>
                  </div>
                </div>
              </div>

              {/* What the hours came to, before any money is named. These are
                  the four the office reads first. */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Figure label="Days worked" value={String(slip.daysWorked)} />
                <Figure
                  label="Regular hours"
                  value={`${slip.regularHours} h`}
                />
                <Figure
                  label="Overtime hours"
                  value={slip.overtimeHours > 0 ? `${slip.overtimeHours} h` : "—"}
                  // Approved and paid come apart when somebody was granted
                  // hours they then didn't stay for. Saying so here stops the
                  // payslip looking like it lost them.
                  note={
                    slip.approvedOvertimeHours > slip.overtimeHours
                      ? `${slip.approvedOvertimeHours} h approved`
                      : undefined
                  }
                />
                <Figure
                  label="Night hours"
                  value={slip.nightHours > 0 ? `${slip.nightHours} h` : "—"}
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="flex min-w-0 flex-col gap-4">
                  <Panel title="Earnings">
                    <Line
                      label="Basic pay"
                      basis={`${slip.regularHours} h`}
                      amount={slip.basicPay}
                    />
                    {/* Overtime, night and holiday always show, even at zero:
                        a payslip that changes shape depending on the week is
                        one you have to re-read every time to be sure nothing
                        was left off. */}
                    <Line
                      label="Overtime pay"
                      basis={
                        slip.overtimeHours > 0
                          ? slip.approvedOvertimeHours > slip.overtimeHours
                            ? `${slip.overtimeHours} h worked of ${slip.approvedOvertimeHours} h approved`
                            : `${slip.overtimeHours} h`
                          : slip.approvedOvertimeHours > 0
                            ? `${slip.approvedOvertimeHours} h approved, none worked past ${OVERTIME_STARTS_AFTER_HOURS} h`
                            : "none approved"
                      }
                      amount={slip.overtimePay}
                    />
                    <Line
                      label="Night hours"
                      basis={
                        slip.nightPaidHours > 0
                          ? `${slip.nightPaidHours} h at rate +${NIGHT_DIFFERENTIAL_RATE * 100}%`
                          : "no night hours"
                      }
                      amount={slip.nightPay}
                    />
                    <Line
                      label="Rest day premium"
                      basis={
                        slip.restDayPay === 0
                          ? "no Sunday worked this cutoff"
                          : "Sundays worked — rate +30%"
                      }
                      amount={slip.restDayPay}
                    />
                    <Line
                      label="Holiday pay"
                      basis={
                        slip.holidayPay === 0
                          ? slip.unworkedHolidays.length > 0
                            ? "not qualified — absent the day before"
                            : "no holiday this cutoff"
                          : slip.unworkedHolidays.some(
                                (holiday) => holiday.qualified
                              )
                            ? slip.unworkedHolidays
                                .filter((holiday) => holiday.qualified)
                                .map((holiday) => holiday.name)
                                .join(", ")
                            : "worked — double"
                      }
                      amount={slip.holidayPay}
                    />
                    {slip.adjustmentAdditions > 0 && (
                      <Line
                        label="Adjustments"
                        basis="added"
                        amount={slip.adjustmentAdditions}
                      />
                    )}
                    <Line label="Gross pay" amount={slip.gross} strong />
                  </Panel>

                  <Panel title="Deductions">
                    {/* Contributions are worked out from the contract rate, so
                        they exist whether or not the fortnight was worked. When
                        there is no pay to take them from they are shown as
                        still owed rather than as money that moved. */}
                    <Line
                      label="SSS"
                      basis={`gross ${peso(slip.sssBasis)} · MSC ${peso(slip.sss.monthlySalaryCredit)}`}
                      amount={slip.deductions.sss}
                      negative={!uncollected}
                      due={uncollected}
                    />
                    <Line
                      label="PhilHealth"
                      basis={`${PHILHEALTH_EMPLOYEE_RATE * 100}% of basic ${peso(slip.philhealthBasis)}`}
                      amount={slip.deductions.philhealth}
                      negative={!uncollected}
                      due={uncollected}
                    />
                    <Line
                      label="Pag-IBIG"
                      basis={`${peso(PAGIBIG_MONTHLY)}/mo · half`}
                      amount={slip.deductions.pagibig}
                      negative={!uncollected}
                      due={uncollected}
                    />
                    {slip.deductions.adjustments > 0 && (
                      <Line
                        label="Adjustments"
                        basis="deducted"
                        amount={slip.deductions.adjustments}
                        negative={!uncollected}
                        due={uncollected}
                      />
                    )}
                    <Line
                      label={
                        uncollected ? "Actually deducted" : "Total deductions"
                      }
                      amount={slip.deductions.total}
                      negative
                      strong
                    />
                    {uncollected && (
                      <p className="py-2 text-xs text-amber-700 dark:text-amber-400">
                        {slip.gross === 0
                          ? `Nothing was deducted — there is no pay this cutoff to take it from. ${peso(slip.deductions.due)} stays owed for the month.`
                          : `${peso(slip.deductions.shortfall)} of the ${peso(slip.deductions.due)} due couldn't be taken — this cutoff's pay doesn't cover it.`}
                      </p>
                    )}
                  </Panel>

                  <Adjustments
                    employeeId={employeeId}
                    cutoffDay={cutoffDay}
                    rows={detail.adjustments}
                    onChanged={() => setReloads((count) => count + 1)}
                  />
                </div>

                {/* Where the hours came from. The point of a payslip is that
                    every figure traces back to a day somebody worked. */}
                <Panel title={`Days · ${slip.daysWorked} worked`}>
                  {slip.days.length === 0 && slip.unworkedHolidays.length === 0 ? (
                    <p className="py-3 text-sm text-muted-foreground">
                      No attendance in this period.
                    </p>
                  ) : (
                    <>
                      {slip.days.map((day) => (
                        <div
                          key={day.date}
                          className="flex items-baseline justify-between gap-3 py-1.5"
                        >
                          <span className="min-w-0">
                            <span className="text-sm">{dayLabel(day.date)}</span>
                            {day.holiday && (
                              <span className="ml-1.5 text-xs text-red-600 dark:text-red-400">
                                {day.holiday}
                              </span>
                            )}
                            <span className="block text-xs text-muted-foreground tabular-nums">
                              {day.renderedMinutes === 0
                                ? "still on the clock"
                                : `${minutesLabel(day.renderedMinutes)} on site → ${day.regularHours} h paid`}
                              {day.overtimeHours > 0 &&
                                ` · +${day.overtimeHours} h OT`}
                              {/* Granted but not stayed for — the day this is
                                  queried about is this one. */}
                              {day.approvedOvertimeHours >
                                day.overtimeHours && (
                                <span className="text-amber-700 dark:text-amber-400">
                                  {` · ${day.approvedOvertimeHours} h OT approved`}
                                </span>
                              )}
                              {day.nightHours > 0 &&
                                ` · ${day.nightHours} h night`}
                            </span>
                          </span>
                          <span className="shrink-0 text-sm tabular-nums">
                            {peso(day.total)}
                          </span>
                        </div>
                      ))}

                      {slip.unworkedHolidays.map((holiday) => (
                        <div
                          key={holiday.date}
                          className="flex items-baseline justify-between gap-3 py-1.5"
                        >
                          <span className="min-w-0">
                            <span className="text-sm">
                              {dayLabel(holiday.date)}
                            </span>
                            <span className="ml-1.5 text-xs text-red-600 dark:text-red-400">
                              {holiday.name}
                            </span>
                            {/* Says why when it paid nothing. A holiday that
                                shows ₱0 with no reason is a phone call. */}
                            <span className="block text-xs text-muted-foreground">
                              {holiday.qualified
                                ? `not worked · ${REGULAR_HOURS_PER_DAY} h holiday pay`
                                : "not worked · absent the day before, so unpaid"}
                            </span>
                          </span>
                          <span className="shrink-0 text-sm tabular-nums">
                            {peso(holiday.pay)}
                          </span>
                        </div>
                      ))}
                    </>
                  )}
                </Panel>
              </div>

              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Paid hours are whole hours, capped at {REGULAR_HOURS_PER_DAY} a
                day — the ninth hour on site is the unpaid break. Overtime pays
                the approved hours that were actually worked past{" "}
                {OVERTIME_STARTS_AFTER_HOURS} hours on the clock, so an
                approval on its own pays nothing. An hour between 22:00 and
                06:00 pays the hourly rate plus a further{" "}
                {NIGHT_DIFFERENTIAL_RATE * 100}% — {(1 + NIGHT_DIFFERENTIAL_RATE) * 100}% in
                total — and is shown on the night line instead of in basic pay,
                so no hour is counted twice. Contributions
                are monthly and this is one of two cutoffs, so half of each is
                taken here.
              </p>
            </div>
          )}
        </div>

        {/* The margins have to be reset, not just the alignment. DialogFooter
            carries `-mx-3 -mb-3` (and `sm:-mx-4 -mb-4`) to cancel the padding a
            normal dialog has — but this panel is full-bleed, so there is no
            padding to cancel and those negatives drag the footer past the
            panel's edges, where overflow-hidden slices the last button in half.

            Placeholders: present so the layout reads right, wired to nothing. */}
        <DialogFooter className="mx-0 mb-0 px-4 sm:mx-0 sm:mb-0 sm:justify-end sm:px-5">
          <Button variant="outline" title="Not wired up yet">
            <Download />
            Download PDF
          </Button>
          <Button title="Not wired up yet">
            <Send />
            Release payslip
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
