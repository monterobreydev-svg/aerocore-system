import Link from "next/link"
import { CalendarDays } from "lucide-react"

import type { Overview } from "@/lib/dashboard"
import { Panel, PanelHead } from "@/components/dashboard/overview/parts"

// ---------------------------------------------------------------------------
// The week ahead
// ---------------------------------------------------------------------------
//
// Seven counts, drawn as seven columns. The only question this page asks of
// next week is "which day is heavy", and a column chart answers it in the space
// a sentence would take.
//
// One series, so one colour and no legend — the panel's title names it. Every
// column is labelled with its own figure rather than hanging off an axis: with
// seven bars the labels are cheaper than a scale, and reading an exact count
// off a bar's height is something nobody can do anyway.
//
// The track behind each column is the busiest day. Without it a week where
// every day has three or four jobs draws as seven bars of near-identical
// height with nothing to measure them against.

export function WeekAhead({ diary }: { diary: Overview["diary"] }) {
  const busiest = Math.max(1, ...diary.ahead.map((day) => day.jobs))
  const total = diary.ahead.reduce((sum, day) => sum + day.jobs, 0)

  return (
    <Panel>
      <PanelHead
        icon={CalendarDays}
        title="The week ahead"
        meta={
          total === 0
            ? "Nothing booked in the next seven days"
            : `${total} job${total === 1 ? "" : "s"} booked · busiest day has ${busiest}`
        }
        href="/admin/schedules"
        action="Calendar"
      />

      <div className="px-4 py-4 sm:px-5">
        <ul className="flex items-end gap-1.5 sm:gap-2">
          {diary.ahead.map((day) => (
            <li key={day.day} className="min-w-0 flex-1">
              <Link
                href={`/admin/schedules?day=${day.day}`}
                className="group flex flex-col items-center gap-2 rounded-lg py-1 transition-colors hover:bg-muted/60"
                title={`${day.jobs} job${day.jobs === 1 ? "" : "s"} booked`}
              >
                <span className="text-[0.6875rem] leading-none font-medium tabular-nums">
                  {day.jobs === 0 ? (
                    <span className="text-muted-foreground/50">—</span>
                  ) : (
                    day.jobs
                  )}
                </span>

                <span
                  className="flex h-16 w-full items-end justify-center rounded-[3px] sm:h-20"
                  style={{ background: "var(--viz-track)" }}
                >
                  {day.jobs > 0 && (
                    <span
                      className="w-full rounded-[3px] transition-opacity group-hover:opacity-85"
                      style={{
                        height: `${Math.max(8, (day.jobs / busiest) * 100)}%`,
                        background: "var(--viz-1)",
                      }}
                    />
                  )}
                </span>

                <span className="flex flex-col items-center gap-0.5 leading-none">
                  <span className="text-[0.625rem] text-muted-foreground uppercase">
                    {day.weekday}
                  </span>
                  <span className="text-[0.6875rem] font-medium tabular-nums">
                    {day.date}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  )
}
