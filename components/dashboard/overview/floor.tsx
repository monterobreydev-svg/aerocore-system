import Link from "next/link"

import type { FloorRow, Overview } from "@/lib/dashboard"
import { minutesLabel } from "@/lib/attendance"
import { cn } from "@/lib/utils"
import { Empty, SectionHead } from "@/components/dashboard/overview/parts"

// ---------------------------------------------------------------------------
// The floor
// ---------------------------------------------------------------------------
//
// Everyone who is at work today, drawn against the clock.
//
// This is the one visualisation on the page, and it earns the space because it
// answers three questions at once that a row of counters cannot: who is still
// out, how long they have been out, and whether the day started when it was
// meant to. A bar that runs past the "now" line is somebody on the clock right
// this minute; a bar that stops early is a short day; a bar with an amber cap
// started late. Nothing here is decorative — remove any of it and a question
// goes unanswered.
//
// The axis is shared. Gridlines are drawn once over the whole list rather than
// per row, which is both the right rendering and a hundred fewer nodes on a
// twenty-person roster.

/** Ticks are placed on whole hours; this is the gap between them. */
const TICK_HOURS = 3

/** The strip always covers at least a working day, however short the punches. */
const DEFAULT_FROM = 6 * 60
const DEFAULT_TO = 19 * 60

function hhmm(minute: number) {
  const clamped = ((minute % 1440) + 1440) % 1440
  const hour = Math.floor(clamped / 60)
  const suffix = hour < 12 ? "am" : "pm"
  const shown = hour % 12 === 0 ? 12 : hour % 12
  const minutes = clamped % 60
  return minutes === 0
    ? `${shown}${suffix}`
    : `${shown}:${String(minutes).padStart(2, "0")}${suffix}`
}

function window(rows: FloorRow[], nowMinute: number) {
  const starts = rows.map((row) => row.startedAt ?? DEFAULT_FROM)
  const ends = rows.map((row) => row.endedAt ?? nowMinute)

  const from = Math.floor(Math.min(DEFAULT_FROM, ...starts) / 60) * 60
  const to = Math.ceil(Math.max(DEFAULT_TO, nowMinute, ...ends) / 60) * 60

  return { from, to, span: Math.max(60, to - from) }
}

export function Floor({
  floor,
  today,
}: {
  floor: Overview["floor"]
  today: string
}) {
  const { rows, nowMinute } = floor
  const { from, to, span } = window(rows, nowMinute)
  const at = (minute: number) => ((minute - from) / span) * 100

  const ticks: number[] = []
  for (
    let minute = Math.ceil(from / (TICK_HOURS * 60)) * (TICK_HOURS * 60);
    minute < to;
    minute += TICK_HOURS * 60
  ) {
    ticks.push(minute)
  }

  return (
    <section>
      <SectionHead
        title="On the floor"
        meta={`${floor.hoursToday} h on the clock today`}
        href={`/admin/attendance?day=${today}`}
        action="Attendance"
      />

      {rows.length === 0 ? (
        <Empty>Nobody has timed in yet today.</Empty>
      ) : (
        // The two column widths live here as custom properties so the axis
        // overlay and every row measure from the same numbers. Change one and
        // the gridlines follow, which is the whole reason they are not
        // hard-coded twice.
        <div className="relative mt-3 [--fig:3.25rem] [--name:5.5rem] sm:[--fig:4rem] sm:[--name:8rem]">
          {/* The axis: hour labels, the gridlines under them, and the line
              marking this minute. One overlay for the whole list. */}
          <div className="pointer-events-none absolute inset-y-5 left-[calc(var(--name)+0.75rem)] right-[calc(var(--fig)+0.75rem)]">
            {ticks.map((tick) => (
              <span
                key={tick}
                className="absolute inset-y-0 w-px bg-border"
                style={{ left: `${at(tick)}%` }}
              />
            ))}
            {nowMinute >= from && nowMinute <= to && (
              <span
                className="absolute inset-y-0 w-px bg-brand/45"
                style={{ left: `${at(nowMinute)}%` }}
              />
            )}
          </div>

          <div className="flex items-end gap-3">
            <span className="w-[var(--name)] shrink-0" />
            <span className="relative h-4 min-w-0 flex-1">
              {ticks.map((tick) => (
                <span
                  key={tick}
                  className="absolute -translate-x-1/2 text-[0.625rem] text-muted-foreground tabular-nums"
                  style={{ left: `${at(tick)}%` }}
                >
                  {hhmm(tick)}
                </span>
              ))}
            </span>
            <span className="w-[var(--fig)] shrink-0" />
          </div>

          <ul className="relative">
            {rows.map((row) => (
              <li key={row.employeeId} className="flex items-center gap-3 py-1">
                <Link
                  href={`/admin/attendance?day=${today}`}
                  className="w-[var(--name)] shrink-0 truncate text-[0.8125rem] transition-colors hover:text-brand-strong"
                  title={row.name}
                >
                  {row.name}
                </Link>

                <span className="relative h-5 min-w-0 flex-1">
                  {row.startedAt !== null && (
                    <span
                      className={cn(
                        "absolute top-1/2 h-2 -translate-y-1/2 rounded-[2px]",
                        row.state === "on-site"
                          ? "bg-brand"
                          : "bg-foreground/20",
                        // Closed by the sweep, not by the person — the open end
                        // says the finishing time is the system's guess.
                        row.autoClosed &&
                          "rounded-r-none border-r border-dashed border-foreground/50"
                      )}
                      style={{
                        left: `${at(row.startedAt)}%`,
                        width: `${Math.max(
                          0.6,
                          at(row.endedAt ?? nowMinute) - at(row.startedAt)
                        )}%`,
                      }}
                    />
                  )}

                  {/* Late, said on the bar where it happened rather than as a
                      badge at the end of the row. */}
                  {row.late && row.startedAt !== null && (
                    <span
                      className="absolute top-1/2 h-2 w-[3px] -translate-y-1/2 rounded-l-[2px] bg-amber-500"
                      style={{ left: `${at(row.startedAt)}%` }}
                    />
                  )}

                  {/* The leading edge of a punch still running. */}
                  {row.state === "on-site" && (
                    <span
                      className="absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand ring-2 ring-background"
                      style={{ left: `${at(nowMinute)}%` }}
                    />
                  )}
                </span>

                <span
                  className={cn(
                    "w-[var(--fig)] shrink-0 text-right text-[0.6875rem] tabular-nums",
                    row.state === "on-site"
                      ? "font-medium text-brand-strong dark:text-brand"
                      : "text-muted-foreground"
                  )}
                >
                  {row.state === "on-site"
                    ? hhmm(row.startedAt ?? 0)
                    : minutesLabel(row.minutes)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {floor.awayNames.length > 0 && (
        <p className="mt-3 border-t pt-2.5 text-xs leading-relaxed text-muted-foreground">
          <span className="text-foreground/70">
            No punch today ({floor.awayNames.length}):
          </span>{" "}
          {floor.awayNames.slice(0, 10).join(", ")}
          {floor.awayNames.length > 10 &&
            ` and ${floor.awayNames.length - 10} more`}
        </p>
      )}
    </section>
  )
}
