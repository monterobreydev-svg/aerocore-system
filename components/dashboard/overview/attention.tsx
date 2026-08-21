import Link from "next/link"
import {
  CalendarClock,
  CheckCheck,
  ChevronRight,
  Clock3,
  Receipt,
  Timer,
  TriangleAlert,
} from "lucide-react"

import type { Overview } from "@/lib/dashboard"
import { cn } from "@/lib/utils"
import { Panel, PanelHead } from "@/components/dashboard/overview/parts"

// ---------------------------------------------------------------------------
// Needs attention
// ---------------------------------------------------------------------------
//
// The only panel on the page that is a list of things to do rather than a
// picture of what happened. Everything else here answers "how is today going";
// this answers "and what do I have to touch".
//
// It is built by exception: a line appears because its count is above zero and
// disappears the moment it is dealt with. A queue that shows five zeroes is a
// queue people stop reading, and then miss the day one of them is a three.
//
// Order is by how much it costs to leave alone, not by subject. An unclosed
// punch pays nobody until it is fixed, so it outranks a claim that has been
// waiting an afternoon.

type Item = {
  key: string
  href: string
  count: number
  label: string
  note: string
  icon: React.ComponentType<{ className?: string }>
  /** Costs money or breaks a rule if ignored. Everything else is just work. */
  urgent: boolean
}

export function Attention({ overview }: { overview: Overview }) {
  const { floor, diary, payroll, claims, overtime } = overview

  const autoClosed = floor.rows.filter((row) => row.autoClosed).length

  const items: Item[] = [
    payroll &&
      payroll.openDays > 0 && {
        key: "open-punches",
        href: `/admin/attendance?day=${overview.today}`,
        count: payroll.openDays,
        label: `Punch${payroll.openDays === 1 ? "" : "es"} never closed`,
        note: "This cutoff. They pay nothing until they close.",
        icon: TriangleAlert,
        urgent: true,
      },
    overtime.waiting > 0 && {
      key: "overtime",
      href: "/admin/attendance?tab=overtime",
      count: overtime.waiting,
      label: `Overtime request${overtime.waiting === 1 ? "" : "s"}`,
      note: "Unanswered hours are worked hours that pay nothing.",
      icon: Timer,
      urgent: true,
    },
    claims &&
      claims.waiting > 0 && {
        key: "claims",
        href: "/admin/reimbursements",
        count: claims.waiting,
        label: `Claim${claims.waiting === 1 ? "" : "s"} to review`,
        note:
          claims.oldestDays !== null && claims.oldestDays >= 3
            ? `Oldest has been waiting ${claims.oldestDays} days.`
            : "Waiting on a decision.",
        icon: Receipt,
        urgent: (claims.oldestDays ?? 0) >= 3,
      },
    floor.late > 0 && {
      key: "late",
      href: `/admin/attendance?day=${overview.today}`,
      count: floor.late,
      label: `Late arrival${floor.late === 1 ? "" : "s"}`,
      note: "Timed in after the first job was due to start.",
      icon: Clock3,
      urgent: false,
    },
    autoClosed > 0 && {
      key: "auto-closed",
      href: `/admin/attendance?day=${overview.today}`,
      count: autoClosed,
      label: `Closed by the sweep`,
      note: "Nobody timed out — the finishing time is a guess.",
      icon: TriangleAlert,
      urgent: false,
    },
    diary.unclosed > 0 && {
      key: "unclosed-jobs",
      href: `/admin/schedules?day=${overview.today}`,
      count: diary.unclosed,
      label: `Job${diary.unclosed === 1 ? "" : "s"} still pending`,
      note: "Booked for today with no outcome recorded yet.",
      icon: CalendarClock,
      urgent: false,
    },
  ].filter(Boolean) as Item[]

  const urgent = items.filter((item) => item.urgent).length

  return (
    <Panel>
      <PanelHead
        title="Needs attention"
        icon={urgent > 0 ? TriangleAlert : CheckCheck}
        tone={urgent > 0 ? "warn" : "brand"}
        meta={
          items.length === 0
            ? "Nothing outstanding"
            : `${items.length} thing${items.length === 1 ? "" : "s"} open${urgent > 0 ? ` · ${urgent} costing money` : ""}`
        }
      />

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-8 text-center sm:px-5">
          <span className="grid size-9 place-items-center rounded-full bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
            <CheckCheck className="size-4.5" />
          </span>
          <p className="text-sm text-muted-foreground">
            Nothing is waiting on you.
          </p>
        </div>
      ) : (
        <ul className="divide-y">
          {items.map((item) => (
            <li key={item.key}>
              <Link
                href={item.href}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60 sm:px-5"
              >
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-[0.625rem]",
                    item.urgent
                      ? "bg-amber-500/14 text-amber-600 dark:text-amber-400"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  <item.icon className="size-4" />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-1.5">
                    <span
                      className={cn(
                        "text-sm leading-none font-semibold tabular-nums",
                        item.urgent && "text-amber-600 dark:text-amber-400"
                      )}
                    >
                      {item.count}
                    </span>
                    <span className="min-w-0 truncate text-sm">
                      {item.label}
                    </span>
                  </span>
                  <span className="mt-1 block truncate text-xs text-muted-foreground">
                    {item.note}
                  </span>
                </span>

                <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
