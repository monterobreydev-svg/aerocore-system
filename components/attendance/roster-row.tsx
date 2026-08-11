"use client"

import { AlertTriangle, FileText, LogIn, LogOut, Timer } from "lucide-react"
import {
  clockTime,
  COARSE_FIX_METRES,
  dayLabel,
  durationLabel,
  minutesLabel,
} from "@/lib/attendance"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import {
  grantedHours,
  type AttendanceRow,
} from "@/components/attendance/admin-attendance"

const OVERTIME_CHIP: Record<string, string> = {
  PENDING: "bg-amber-600/10 text-amber-700 dark:text-amber-400",
  APPROVED: "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
  REJECTED: "bg-rose-600/10 text-rose-700 dark:text-rose-400",
}

/** True when the device admitted it was only guessing. */
function isCoarse(accuracy: number | null | undefined) {
  return accuracy != null && accuracy > COARSE_FIX_METRES
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? "") + (parts.at(-1)?.[0] ?? "")).toUpperCase()
}

/**
 * One punch as a list row, shared by the day log and by a person's own record.
 *
 * A list rather than a table row: the shape of a punch is a pair of times with
 * a span between them, which reads better as a line than as five columns — and
 * survives a narrow screen without scrolling sideways.
 *
 * The whole row is the button. A "View" control at the end made the row look
 * like a table when it behaves like a link, and gave a thumb one small target
 * instead of the full width.
 */
export function RosterRow({
  row,
  now,
  onOpen,
  /** "roster" is a single day and names the person; "record" is one person across days and names the date. */
  variant = "roster",
}: {
  row: AttendanceRow
  now: number
  onOpen: () => void
  variant?: "roster" | "record"
}) {
  const open = !row.timeOut
  const coarse =
    isCoarse(row.timeInFix.accuracy) || isCoarse(row.timeOutFix?.accuracy)

  return (
    <li className="relative">
      {/* The status rail. Colour is the fastest read here: green is someone
          still on site, and that's what is being scanned for. */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 z-10 w-1",
          open ? "bg-emerald-500" : "bg-transparent"
        )}
      />

      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-start gap-3 py-3.5 pr-4 pl-4 text-left transition-colors outline-none hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
      >
        {variant === "roster" ? (
          <span
            aria-hidden
            className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-xs font-semibold text-brand"
          >
            {initials(row.employeeName)}
          </span>
        ) : (
          // A person's own record is already about them, so the slot says
          // *when* instead of *who*.
          <span
            aria-hidden
            className="mt-0.5 flex size-9 shrink-0 flex-col items-center justify-center rounded-xl bg-muted"
          >
            <span className="text-[9px] leading-none font-medium tracking-wide text-muted-foreground uppercase">
              {new Date(row.date).toLocaleDateString(undefined, {
                month: "short",
              })}
            </span>
            <span className="mt-0.5 text-sm leading-none font-semibold tabular-nums">
              {new Date(row.date).getDate()}
            </span>
          </span>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <p className="min-w-0 truncate text-sm font-medium">
              {variant === "roster" ? (
                <>
                  {row.employeeName}
                  {row.employeeNo && (
                    <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
                      {row.employeeNo}
                    </span>
                  )}
                </>
              ) : (
                dayLabel(row.date, true)
              )}
            </p>

            {/* An open day has no length yet. Showing the elapsed time as if it
                were the total is how an unclosed punch gets paid — so it's
                muted, and labelled "so far". */}
            <p
              className={cn(
                "shrink-0 text-sm font-semibold tabular-nums",
                open && "text-xs font-normal text-muted-foreground"
              )}
            >
              {row.minutes != null
                ? minutesLabel(row.minutes)
                : now === 0
                  ? "—"
                  : `${durationLabel(row.timeIn, null)} so far`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-1.5">
                <LogIn className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span className="font-medium tabular-nums">
                  {clockTime(row.timeIn)}
                </span>
              </span>

              <span aria-hidden className="h-px w-5 bg-border sm:w-8" />

              {open ? (
                <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                    <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                  </span>
                  <span className="text-xs font-medium">on the clock</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <LogOut className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="font-medium tabular-nums">
                    {clockTime(row.timeOut!)}
                  </span>
                  {/* Without this, a 22:00 → 06:00 shift reads as eight hours
                      backwards through the same day. */}
                  {row.spansDays > 0 && (
                    <span className="rounded bg-violet-600/10 px-1 py-0.5 text-[10px] font-semibold text-violet-700 dark:text-violet-400">
                      +{row.spansDays}d
                    </span>
                  )}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {row.overtime && (
                <Badge className={cn("gap-1", OVERTIME_CHIP[row.overtime.status])}>
                  <Timer className="size-3" />+{grantedHours(row.overtime)}h
                </Badge>
              )}
              {row.reports.length > 0 && (
                <Badge variant="secondary" className="gap-1">
                  <FileText className="size-3" />
                  {row.reports.length}{" "}
                  {row.reports.length === 1 ? "report" : "reports"}
                </Badge>
              )}
              {row.reports.length === 0 && row.reportNote && (
                <Badge variant="secondary" className="gap-1">
                  <FileText className="size-3" />
                  note
                </Badge>
              )}
              {coarse && (
                <Badge className="gap-1 bg-amber-600/10 text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="size-3" />
                  rough fix
                </Badge>
              )}
            </div>
          </div>
        </div>
      </button>
    </li>
  )
}
