import Link from "next/link"
import { ArrowUpRight } from "lucide-react"

import type { Overview } from "@/lib/dashboard"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// The masthead
// ---------------------------------------------------------------------------
//
// The band across the top: the date, who is on the clock right now, and the
// roster split into the three states a person can be in today.
//
// It is the one dark surface on the page, and it is dark on purpose. The
// navigation rail is dark; making the banner match ties the two ends of the
// screen together and gives the eye an anchor to start from, which a page of
// eight white panels otherwise lacks. It also settles the hierarchy without
// having to shout with type size — one dark thing among light things is read
// first whatever size it is set in.
//
// Its colours come from the sidebar tokens rather than from the chart palette.
// This is chrome, not a chart: the chart palette is validated against the card
// surface, and none of it is validated against a navy this dark.

/** Minutes on the clock, written the way somebody says it out loud. */
function hoursLabel(hours: number) {
  return `${hours} h`
}

export function Masthead({
  overview,
  firstName,
  now,
}: {
  overview: Overview
  firstName: string
  /** Built once by the page, so the date here and the "now" line on the floor
      plot are the same instant rather than two calls a query apart. */
  now: Date
}) {
  const { floor, diary } = overview

  // The three states, in the order the day moves through them. The bar and the
  // figures under it are generated from one list, so a segment can never end up
  // labelled as something it is not.
  const split = [
    {
      key: "on-site",
      value: floor.onSite,
      label: "On site",
      note: floor.onSite === 1 ? "1 person working" : undefined,
      fill: "var(--sidebar-primary)",
      live: floor.onSite > 0,
    },
    {
      key: "done",
      value: floor.done,
      label: "Finished",
      fill: "color-mix(in oklab, var(--sidebar-foreground) 42%, transparent)",
      live: false,
    },
    {
      key: "away",
      value: floor.away,
      label: "No punch",
      fill: "color-mix(in oklab, var(--sidebar-foreground) 14%, transparent)",
      live: false,
    },
  ]

  const headcount = Math.max(1, floor.headcount)

  return (
    <section className="relative isolate overflow-hidden rounded-2xl bg-sidebar px-4 py-5 text-sidebar-foreground sm:px-6 sm:py-6">
      {/* The same wash the rail wears, out of the same corner. Painted as a
          layer rather than as a background shorthand so the panel keeps its
          flat token colour underneath if gradients are unavailable. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "radial-gradient(120% 130% at 0% 0%, color-mix(in oklab, var(--sidebar-primary) 20%, transparent) 0%, transparent 58%), radial-gradient(80% 100% at 100% 0%, color-mix(in oklab, var(--sidebar-primary) 9%, transparent) 0%, transparent 62%)",
        }}
      />

      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2">
            <span className="text-[0.6875rem] font-medium tracking-[0.14em] text-sidebar-foreground/55 uppercase">
              Today
            </span>
            {overview.restDay && (
              <span className="rounded-full bg-sidebar-foreground/12 px-2 py-0.5 text-[0.625rem] font-medium tracking-[0.1em] text-sidebar-foreground/80 uppercase">
                Rest day
              </span>
            )}
          </p>

          <h1 className="mt-1.5 text-xl leading-tight font-semibold tracking-tight sm:text-2xl">
            {now.toLocaleDateString(undefined, {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </h1>

          <p className="mt-1 text-xs text-sidebar-foreground/55">
            {now.getFullYear()} · {firstName}&apos;s desk
          </p>
        </div>

        {/* When this was true, not what was true — the counts below already say
            that, and repeating one of them here would waste the most prominent
            spot on the page. Everything on this page is of a single instant and
            nothing on it refreshes itself, so the instant is worth naming. The
            dot breathes only while somebody is actually on the clock. */}
        <div className="ml-auto flex items-center gap-2 rounded-full bg-sidebar-foreground/8 px-3 py-1.5 ring-1 ring-sidebar-foreground/10">
          <span className="relative flex size-2">
            {floor.onSite > 0 && (
              <span
                className="absolute inline-flex size-full animate-ping rounded-full opacity-70 motion-reduce:hidden"
                style={{ background: "var(--sidebar-primary)" }}
              />
            )}
            <span
              className="relative inline-flex size-2 rounded-full"
              style={{
                background:
                  floor.onSite > 0
                    ? "var(--sidebar-primary)"
                    : "color-mix(in oklab, var(--sidebar-foreground) 30%, transparent)",
              }}
            />
          </span>
          <span className="text-xs font-medium tabular-nums">
            As of{" "}
            {now.toLocaleTimeString(undefined, {
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
        </div>
      </div>

      {/* ---- the roster ----------------------------------------------------
          One bar, three segments, and the counts read as its key. Proportion is
          the question here — "is half the company still out?" — and a bar
          answers it before any of the three numbers have been read. */}
      <div className="mt-6">
        <div className="flex h-2 gap-[3px]">
          {split.map((part) => (
            <span
              key={part.key}
              className="h-full rounded-full transition-[width]"
              style={{
                width: `${Math.max(part.value > 0 ? 2 : 0, (part.value / headcount) * 100)}%`,
                background: part.fill,
              }}
              title={`${part.label} — ${part.value} of ${floor.headcount}`}
            />
          ))}
          {/* Whatever the three do not account for. There should be nothing
              here; if there is, the bar shows it as a gap rather than quietly
              scaling the segments up to fill the width. */}
          <span className="h-full flex-1 rounded-full bg-sidebar-foreground/8" />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-5 sm:gap-x-6">
          {split.map((part) => (
            <div key={part.key} className="min-w-0">
              <p className="text-[1.625rem] leading-none font-semibold tracking-tight tabular-nums">
                {part.value}
              </p>
              <p className="mt-2 flex items-center gap-1.5 text-[0.6875rem] tracking-[0.08em] text-sidebar-foreground/60 uppercase">
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ background: part.fill }}
                />
                <span className="min-w-0 truncate">{part.label}</span>
              </p>
            </div>
          ))}

          {/* Two figures that are not part of the split and so get no dot —
              the absence of one is what says they belong to a different
              question. */}
          <div className="min-w-0">
            <p className="text-[1.625rem] leading-none font-semibold tracking-tight tabular-nums">
              {hoursLabel(floor.hoursToday)}
            </p>
            <p className="mt-2 truncate text-[0.6875rem] tracking-[0.08em] text-sidebar-foreground/60 uppercase">
              On the clock
            </p>
          </div>

          <div className="min-w-0">
            <p
              className={cn(
                "text-[1.625rem] leading-none font-semibold tracking-tight tabular-nums",
                diary.total === 0 && "text-sidebar-foreground/45"
              )}
            >
              {diary.total}
            </p>
            <p className="mt-2 truncate text-[0.6875rem] tracking-[0.08em] text-sidebar-foreground/60 uppercase">
              Jobs today
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-sidebar-foreground/12 pt-4 text-xs text-sidebar-foreground/60">
        <span className="tabular-nums">
          {floor.headcount} on the payroll
        </span>
        <Link
          href={`/admin/attendance?day=${overview.today}`}
          className="ml-auto inline-flex items-center gap-1 font-medium text-sidebar-foreground/85 transition-colors hover:text-sidebar-primary"
        >
          Open the day log
          <ArrowUpRight className="size-3.5" />
        </Link>
      </div>
    </section>
  )
}
