import Link from "next/link"
import { Activity } from "lucide-react"

import type { FloorRow, Overview } from "@/lib/dashboard"
import { minutesLabel } from "@/lib/attendance"
import { cn } from "@/lib/utils"
import { Empty, Panel, PanelHead } from "@/components/dashboard/overview/parts"

// ---------------------------------------------------------------------------
// The floor
// ---------------------------------------------------------------------------
//
// Everyone who is at work today, drawn against the clock.
//
// This is the one real plot on the page and it earns its space because it
// answers three questions at once that a row of counters cannot: who is still
// out, how long they have been out, and whether the day started when it was
// meant to. A bar crossing the "now" line is somebody on the clock this minute;
// a bar that stops early is a short day; a bar with an amber cap started late.
// Remove any part of it and a question goes unanswered.
//
// The axis is drawn once over the whole list rather than per row — both the
// right rendering and a hundred fewer nodes on a twenty-person roster. The two
// column widths are custom properties so the overlay and every row measure from
// the same numbers; change one and the gridlines follow.

/** Ticks sit on whole hours; this is the gap between them. */
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

/** What each mark means, said once under the plot rather than in every row. */
function Key({ swatch, children }: { swatch: string; children: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
      <span
        className="h-1.5 w-4 shrink-0 rounded-full"
        style={{ background: swatch }}
      />
      {children}
    </span>
  )
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

  const late = rows.filter((row) => row.late).length

  return (
    <Panel>
      <PanelHead
        icon={Activity}
        title="On the floor"
        meta={`${floor.hoursToday} h on the clock · ${floor.onSite} still working${late > 0 ? ` · ${late} started late` : ""}`}
        href={`/admin/attendance?day=${today}`}
        action="Day log"
      />

      {rows.length === 0 ? (
        <Empty>Nobody has timed in yet today.</Empty>
      ) : (
        <div className="px-4 pt-4 pb-3 sm:px-5 [--fig:3.25rem] [--name:5.5rem] sm:[--fig:4rem] sm:[--name:8.5rem]">
          {/* The hour labels, on their own line above the plot so no row has to
              make room for them. */}
          <div className="flex items-end gap-3 pb-2">
            <span className="w-[var(--name)] shrink-0" />
            <span className="relative h-3 min-w-0 flex-1">
              {ticks.map((tick) => (
                <span
                  key={tick}
                  className="absolute -translate-x-1/2 text-[0.625rem] leading-none text-muted-foreground tabular-nums"
                  style={{ left: `${at(tick)}%` }}
                >
                  {hhmm(tick)}
                </span>
              ))}
            </span>
            <span className="w-[var(--fig)] shrink-0" />
          </div>

          <div className="relative">
            {/* One overlay for the whole list: the gridlines, and the line
                marking this minute with a cap so it reads as a marker rather
                than as another gridline. */}
            <div
              aria-hidden
              className="pointer-events-none absolute top-0 bottom-0 left-[calc(var(--name)+0.75rem)] right-[calc(var(--fig)+0.75rem)]"
            >
              {ticks.map((tick) => (
                <span
                  key={tick}
                  className="absolute inset-y-0 w-px"
                  style={{ left: `${at(tick)}%`, background: "var(--viz-grid)" }}
                />
              ))}
              {nowMinute >= from && nowMinute <= to && (
                <span
                  className="absolute inset-y-0 w-px"
                  style={{
                    left: `${at(nowMinute)}%`,
                    background:
                      "color-mix(in oklab, var(--viz-1) 45%, transparent)",
                  }}
                >
                  <span
                    className="absolute -top-0.5 left-1/2 size-1.5 -translate-x-1/2 rounded-full"
                    style={{ background: "var(--viz-1)" }}
                  />
                </span>
              )}
            </div>

            <ul className="relative">
              {rows.map((row) => (
                <li key={row.employeeId}>
                  {/* The whole row is the target, and the highlight runs into
                      the panel's padding so it reads as a band across the panel
                      rather than as a box drawn inside it. */}
                  <Link
                    href={`/admin/attendance?day=${today}`}
                    title={`${row.name} — ${hhmm(row.startedAt ?? 0)}${
                      row.endedAt === null
                        ? " onwards, still on the clock"
                        : ` to ${hhmm(row.endedAt)}`
                    }, ${minutesLabel(row.minutes)}${row.late ? ", late start" : ""}${
                      row.jobs > 0
                        ? ` · ${row.jobs} job${row.jobs === 1 ? "" : "s"}`
                        : ""
                    }`}
                    className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-1 transition-colors hover:bg-muted/70"
                  >
                    {/* Just the name. How many jobs they carry is in the row's
                        tooltip rather than as a chip here — a bare figure next
                        to a name reads as a rank, and this column's subject is
                        time. */}
                    <span className="w-[var(--name)] shrink-0 truncate text-[0.8125rem]">
                      {row.name}
                    </span>

                    <span className="relative h-5 min-w-0 flex-1">
                      {row.startedAt !== null && (
                        <span
                          className={cn(
                            "absolute top-1/2 h-2 -translate-y-1/2 rounded-full",
                            // Closed by the sweep, not by the person — the open
                            // end says the finishing time is the system's guess.
                            row.autoClosed &&
                              "rounded-r-none border-r-2 border-dashed"
                          )}
                          style={{
                            left: `${at(row.startedAt)}%`,
                            width: `${Math.max(0.8, at(row.endedAt ?? nowMinute) - at(row.startedAt))}%`,
                            background:
                              row.state === "on-site"
                                ? "var(--viz-1)"
                                : "var(--viz-muted)",
                            borderColor: "var(--viz-muted)",
                          }}
                        />
                      )}

                      {/* Late, said on the bar where it happened rather than as
                          a badge at the end of the row. */}
                      {row.late && row.startedAt !== null && (
                        <span
                          className="absolute top-1/2 h-2 w-[3px] -translate-y-1/2 rounded-l-full bg-amber-500"
                          style={{ left: `${at(row.startedAt)}%` }}
                        />
                      )}

                      {/* The leading edge of a punch still running. The ring is
                          the surface, so it stays legible where it crosses the
                          now line. */}
                      {row.state === "on-site" && (
                        <span
                          className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card"
                          style={{
                            left: `${at(nowMinute)}%`,
                            background: "var(--viz-1)",
                          }}
                        />
                      )}
                    </span>

                    <span
                      className={cn(
                        "w-[var(--fig)] shrink-0 text-right text-[0.6875rem] tabular-nums",
                        row.late
                          ? "font-medium text-amber-600 dark:text-amber-400"
                          : row.state === "on-site"
                            ? "font-medium text-foreground"
                            : "text-muted-foreground"
                      )}
                    >
                      {row.state === "on-site"
                        ? hhmm(row.startedAt ?? 0)
                        : minutesLabel(row.minutes)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t pt-3">
            <Key swatch="var(--viz-1)">On the clock</Key>
            <Key swatch="var(--viz-muted)">Finished</Key>
            <Key swatch="var(--color-amber-500)">Late start</Key>
          </div>
        </div>
      )}

      {floor.awayNames.length > 0 && (
        <p className="border-t bg-muted/40 px-4 py-3 text-xs leading-relaxed text-muted-foreground sm:px-5">
          <span className="font-medium text-foreground/75">
            No punch today ({floor.awayNames.length}):
          </span>{" "}
          {floor.awayNames.slice(0, 10).join(", ")}
          {floor.awayNames.length > 10 &&
            ` and ${floor.awayNames.length - 10} more`}
        </p>
      )}
    </Panel>
  )
}
