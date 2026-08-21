"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import {
  Banknote,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  MinusCircle,
  Search,
  Send,
  Users,
} from "lucide-react"
import type { ReleaseMode } from "@/components/payroll/release-payroll-dialog"
import { peso } from "@/lib/reimbursement"
import { dayLabel } from "@/lib/attendance"
import { HOLIDAY_STYLE, type HolidayKind } from "@/lib/payroll/holidays"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

// The breakdown is a second query and a second chunk — neither is paid for
// until a row is actually opened.
const PayslipDialog = dynamic(() =>
  import("@/components/payroll/payslip-dialog").then((m) => m.PayslipDialog)
)

// Same reasoning: a confirmation nobody has asked for yet shouldn't cost the
// Dialog primitive on first paint.
const ReleasePayrollDialog = dynamic(() =>
  import("@/components/payroll/release-payroll-dialog").then(
    (m) => m.ReleasePayrollDialog
  )
)

export type PayrollRow = {
  employeeId: string
  name: string
  employeeNo: string | null
  position: string
  daysWorked: number
  regularHours: number
  overtimeHours: number
  nightHours: number
  basicPay: number
  overtimePay: number
  nightPay: number
  holidayPay: number
  restDayPay: number
  specialHolidayPay: number
  gross: number
  deductions: number
  net: number
  /** Days still on the clock: no length, so they pay nothing yet. */
  openDays: number
}

export type PayrollCutoff = {
  day: string
  label: string
  start: string
  end: string
  previous: string
  next: string
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

function Summary({
  label,
  value,
  sub,
  icon: Icon,
  tone,
  wash,
}: {
  label: string
  value: string
  sub?: string
  icon: React.ElementType
  tone: string
  wash: string
}) {
  return (
    <Card size="sm" className="shadow-sm">
      <CardContent className="flex items-center gap-3">
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg",
            wash
          )}
        >
          <Icon className={cn("size-5", tone)} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xl leading-none font-semibold tabular-nums">
            {value}
          </p>
          <p className="mt-1.5 truncate text-xs text-muted-foreground">
            {label}
            {sub && ` · ${sub}`}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

/** A money cell that stays quiet when there is nothing in it. */
function Amount({
  value,
  className,
}: {
  value: number
  className?: string
}) {
  return (
    <TableCell
      className={cn(
        "py-2 text-right tabular-nums",
        value === 0 && "text-muted-foreground",
        className
      )}
    >
      {value === 0 ? "—" : peso(value)}
    </TableCell>
  )
}

export function PayrollView({
  rows,
  cutoff,
  holidays,
  released,
}: {
  rows: PayrollRow[]
  cutoff: PayrollCutoff
  holidays: { date: string; name: string; kind: HolidayKind }[]
  /** Null while the run is still the office's own working copy. */
  released: { at: string; byName: string } | null
}) {
  const [query, setQuery] = useState("")
  const [openFor, setOpenFor] = useState<PayrollRow | null>(null)
  // Which confirmation is open, if any. Releasing is the one action here that
  // reaches outside the office, so neither direction happens on a single click.
  const [confirming, setConfirming] = useState<ReleaseMode | null>(null)

  const releasedOn = released
    ? new Date(released.at).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : ""

  const term = query.trim().toLowerCase()
  const visible = term
    ? rows.filter(
        (row) =>
          row.name.toLowerCase().includes(term) ||
          row.employeeNo?.toLowerCase().includes(term) ||
          row.position.toLowerCase().includes(term)
      )
    : rows

  // Totals follow what's on screen, so filtering to one crew answers "what
  // does this crew cost" without a second page.
  const totals = visible.reduce(
    (sum, row) => ({
      gross: sum.gross + row.gross,
      deductions: sum.deductions + row.deductions,
      net: sum.net + row.net,
      paid: sum.paid + (row.net > 0 ? 1 : 0),
      days: sum.days + row.daysWorked,
    }),
    { gross: 0, deductions: 0, net: 0, paid: 0, days: 0 }
  )

  return (
    <div className="flex flex-col gap-4">
      {/* Period and the two things you do with a finished run. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-0.5 rounded-lg border bg-card p-0.5 shadow-sm">
          <Button
            variant="ghost"
            size="icon-sm"
            nativeButton={false}
            render={
              <Link
                href={`/admin/payroll?cutoff=${cutoff.previous}`}
                aria-label="Previous cutoff"
              >
                <ChevronLeft />
              </Link>
            }
          />
          <span className="min-w-40 px-1.5 text-center text-sm font-semibold tabular-nums">
            {cutoff.label}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            nativeButton={false}
            render={
              <Link
                href={`/admin/payroll?cutoff=${cutoff.next}`}
                aria-label="Next cutoff"
              >
                <ChevronRight />
              </Link>
            }
          />
        </div>

        {/* One chip per kind, because they are shaded differently on the
            calendar and paid differently here — a single red strip listing a
            special non-working day among the regular ones would say this
            cutoff has more double-pay days in it than it does. */}
        {((["REGULAR", "SPECIAL"] as const)
          .map((kind) => ({ kind, days: holidays.filter((h) => h.kind === kind) }))
          .filter((group) => group.days.length > 0)
        ).map((group) => (
          <span
            key={group.kind}
            title={HOLIDAY_STYLE[group.kind].payNote}
            className={cn(
              "inline-flex max-w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium",
              HOLIDAY_STYLE[group.kind].note
            )}
          >
            <CalendarDays className="size-3.5 shrink-0" />
            <span className="truncate">
              {group.days
                .map((holiday) => `${dayLabel(holiday.date)} ${holiday.name}`)
                .join(" · ")}
            </span>
          </span>
        ))}

        <div className="ml-auto flex items-center gap-2">
          {/* A plain anchor, so the browser owns the download and files it in
              its own list. The cutoff on screen travels with it — the office's
              copy is only ever of the run they are looking at. */}
          <a
            href={`/api/payroll/download?cutoff=${cutoff.day}`}
            className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
            title="The whole run as a spreadsheet"
          >
            <Download />
            <span className="hidden sm:inline">Download Excel</span>
          </a>

          {released ? (
            <div className="flex items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600/10 px-2.5 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400"
                title={`Released by ${released.byName} on ${releasedOn}`}
              >
                <CheckCircle2 className="size-3.5 shrink-0" />
                Released {releasedOn}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirming("unrelease")}
              >
                Unrelease
              </Button>
            </div>
          ) : (
            <Button size="lg" onClick={() => setConfirming("release")}>
              <Send />
              Release
            </Button>
          )}
        </div>
      </div>

      {!released && (
        <p className="text-xs text-muted-foreground">
          These figures are the office&rsquo;s working copy. Releasing publishes
          them to every employee&rsquo;s Payroll page, where they can read the
          summary and download the full computation.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Summary
          label="Staff on this run"
          value={String(totals.paid)}
          sub={`${totals.days} days worked`}
          icon={Users}
          tone="text-brand"
          wash="bg-brand/10"
        />
        <Summary
          label="Gross pay"
          value={peso(totals.gross)}
          icon={Banknote}
          tone="text-sky-600 dark:text-sky-400"
          wash="bg-sky-600/10"
        />
        <Summary
          label="Deductions"
          value={peso(totals.deductions)}
          sub="SSS · PhilHealth · Pag-IBIG"
          icon={MinusCircle}
          tone="text-amber-600 dark:text-amber-400"
          wash="bg-amber-600/10"
        />
        <Summary
          label="Net payout"
          value={peso(totals.net)}
          icon={Banknote}
          tone="text-emerald-600 dark:text-emerald-400"
          wash="bg-emerald-600/10"
        />
      </div>

      <div className="relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, ID or position"
          className="h-9 pl-8"
        />
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {rows.length === 0
            ? "Nobody is on the payroll yet."
            : "No one matches that search."}
        </p>
      ) : (
        <>
          <Card className="hidden overflow-hidden p-0 shadow-sm md:block">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-10">Employee</TableHead>
                    <TableHead className="h-10 text-right">
                      Days worked
                    </TableHead>
                    <TableHead className="h-10 text-right">Hours</TableHead>
                    <TableHead className="h-10 text-right">Overtime</TableHead>
                    <TableHead className="h-10 text-right">Night</TableHead>
                    <TableHead className="h-10 text-right">Holiday</TableHead>
                    <TableHead className="h-10 text-right">Gross</TableHead>
                    <TableHead className="h-10 text-right">Deductions</TableHead>
                    <TableHead className="h-10 pr-4 text-right">
                      Net pay
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((row) => (
                    <TableRow
                      key={row.employeeId}
                      onClick={() => setOpenFor(row)}
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") setOpenFor(row)
                      }}
                      className="cursor-pointer"
                    >
                      <TableCell className="py-2">
                        <span className="flex items-center gap-2.5">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
                            {initials(row.name)}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-medium">
                              {row.name}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {row.position}
                              {row.employeeNo && ` · ${row.employeeNo}`}
                              {row.openDays > 0 && (
                                <span className="text-amber-600 dark:text-amber-400">
                                  {" · "}
                                  {row.openDays} day
                                  {row.openDays === 1 ? "" : "s"} not timed out
                                </span>
                              )}
                            </span>
                          </span>
                        </span>
                      </TableCell>

                      <TableCell className="py-2 text-right tabular-nums">
                        {row.daysWorked}
                      </TableCell>
                      {/* Hours, not "Reg" — the column is the plain hours they
                          were paid for, before overtime. */}
                      <TableCell className="py-2 text-right tabular-nums">
                        {row.regularHours}
                        <span className="text-muted-foreground"> h</span>
                      </TableCell>
                      <TableCell
                        className={cn(
                          "py-2 text-right tabular-nums",
                          row.overtimeHours === 0 && "text-muted-foreground"
                        )}
                      >
                        {row.overtimeHours === 0 ? (
                          "—"
                        ) : (
                          <>
                            {row.overtimeHours}
                            <span className="text-muted-foreground"> h</span>
                          </>
                        )}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "py-2 text-right tabular-nums",
                          row.nightHours === 0 && "text-muted-foreground"
                        )}
                      >
                        {row.nightHours === 0 ? (
                          "—"
                        ) : (
                          <>
                            {row.nightHours}
                            <span className="text-muted-foreground"> h</span>
                          </>
                        )}
                      </TableCell>
                      <Amount
                        value={row.holidayPay}
                        className={
                          row.holidayPay > 0
                            ? "text-red-600 dark:text-red-400"
                            : undefined
                        }
                      />
                      <Amount value={row.gross} />
                      <TableCell className="py-2 text-right tabular-nums text-muted-foreground">
                        {row.deductions === 0 ? "—" : `−${peso(row.deductions)}`}
                      </TableCell>
                      <TableCell className="py-2 pr-4 text-right font-semibold tabular-nums">
                        {peso(row.net)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* Phone: net pay is the thing you came for, the rest supports it. */}
          <ul className="flex flex-col gap-2 md:hidden">
            {visible.map((row) => (
              <li key={row.employeeId}>
                <button
                  type="button"
                  onClick={() => setOpenFor(row)}
                  className="w-full rounded-xl border bg-card p-3 text-left shadow-sm"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
                      {initials(row.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {row.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {row.position}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-semibold tabular-nums">
                        {peso(row.net)}
                      </span>
                      <span className="block text-[11px] text-muted-foreground">
                        net
                      </span>
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t pt-2 text-[11px] text-muted-foreground tabular-nums">
                    <span>{row.daysWorked} days</span>
                    <span>{row.regularHours} h</span>
                    {row.overtimeHours > 0 && <span>+{row.overtimeHours} h OT</span>}
                    {row.nightHours > 0 && <span>{row.nightHours} h night</span>}
                    {row.holidayPay > 0 && (
                      <span className="text-red-600 dark:text-red-400">
                        {peso(row.holidayPay)} holiday
                      </span>
                    )}
                    <span className="ml-auto">
                      {peso(row.gross)} − {peso(row.deductions)}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Keyed per person: opening a different row mounts a new dialog rather
          than reusing one that still holds the last employee's figures. */}
      {openFor && (
        <PayslipDialog
          key={openFor.employeeId}
          employeeId={openFor.employeeId}
          cutoffDay={cutoff.day}
          cutoffLabel={cutoff.label}
          open
          onOpenChange={(next) => !next && setOpenFor(null)}
        />
      )}

      {confirming && (
        <ReleasePayrollDialog
          mode={confirming}
          open
          onOpenChange={(next) => !next && setConfirming(null)}
          cutoffDay={cutoff.day}
          cutoffLabel={cutoff.label}
          cutoffEnd={cutoff.end}
          // Everyone on the run and what it comes to — not the filtered view.
          // A search box narrowing the table must not narrow what the
          // confirmation says is about to be published.
          staffCount={rows.length}
          netTotal={rows.reduce((sum, row) => sum + row.net, 0)}
        />
      )}
    </div>
  )
}
