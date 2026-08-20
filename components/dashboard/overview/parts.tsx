import Link from "next/link"
import { ArrowUpRight } from "lucide-react"

import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// The overview's vocabulary
// ---------------------------------------------------------------------------
//
// Five pieces, and the page is built from nothing else. They exist so the
// dashboard reads as one document rather than as a collection of widgets: a
// label is the same label everywhere, a figure sits on the same baseline, and
// the only thing that ever separates two regions is a hairline or space.
//
// What is deliberately absent: a Card. Every section on this page is defined by
// its heading and the rule under it, the way a column in a newspaper is. Boxing
// each one would put nine borders on the screen and flatten the hierarchy the
// type is doing the work of establishing.

/** The small caps label above everything. The page's most repeated element. */
export function Eyebrow({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        "text-[0.6875rem] font-medium tracking-[0.12em] text-muted-foreground uppercase",
        className
      )}
    >
      {children}
    </span>
  )
}

/**
 * A section heading: label on the left, an optional link out on the right,
 * with the rule under it that stands in for a card's top edge.
 */
export function SectionHead({
  title,
  href,
  action,
  meta,
}: {
  title: string
  href?: string
  /** What the link says. Defaults to the plain arrow. */
  action?: string
  /** A figure or note that belongs to the heading rather than the body. */
  meta?: React.ReactNode
}) {
  return (
    <div className="flex items-baseline gap-3 border-b pb-2">
      <Eyebrow>{title}</Eyebrow>
      {meta && (
        <span className="min-w-0 truncate text-xs text-muted-foreground tabular-nums">
          {meta}
        </span>
      )}
      {href && (
        <Link
          href={href}
          className="ml-auto inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-muted-foreground transition-colors hover:text-brand-strong"
        >
          {action ?? "Open"}
          <ArrowUpRight className="size-3" />
        </Link>
      )}
    </div>
  )
}

/**
 * A headline number and what it counts.
 *
 * The figure carries the weight and the word underneath stays quiet — the
 * opposite of the dashboard convention where a caption in bold competes with
 * the number it labels. `tabular-nums` throughout so a column of these does not
 * shuffle sideways when a count ticks over.
 */
export function Figure({
  value,
  label,
  tone = "plain",
  note,
}: {
  value: React.ReactNode
  label: string
  tone?: "plain" | "live" | "quiet" | "warn"
  note?: string
}) {
  return (
    <div className="min-w-0">
      <p
        className={cn(
          "text-[1.75rem] leading-none font-semibold tracking-tight tabular-nums",
          tone === "live" && "text-brand-strong dark:text-brand",
          tone === "quiet" && "text-muted-foreground",
          tone === "warn" && "text-amber-600 dark:text-amber-400"
        )}
      >
        {value}
      </p>
      <p className="mt-1.5 text-[0.6875rem] tracking-[0.1em] text-muted-foreground uppercase">
        {label}
      </p>
      {note && (
        <p className="mt-0.5 text-[0.6875rem] text-muted-foreground/80">
          {note}
        </p>
      )}
    </div>
  )
}

/**
 * A proportional bar, drawn as segments of one line rather than as a chart.
 *
 * Used for what a payroll is made of. It is 6px tall and has no axis, no
 * legend of its own and no rounded ends, because the question it answers —
 * "is this cutoff mostly basic pay, or is overtime running away with it" — is
 * answered by the proportions and by nothing else.
 */
export function Meter({
  segments,
  className,
}: {
  segments: { label: string; amount: number }[]
  className?: string
}) {
  const total = segments.reduce((sum, segment) => sum + segment.amount, 0)
  if (total <= 0) return null

  // Five steps down the chart ramp, in a fixed order. Not a palette per
  // segment — the ramp is one hue family, so the bar reads as one quantity
  // divided up rather than as five unrelated things.
  const FILL = [
    "bg-[var(--chart-1)]",
    "bg-[var(--chart-2)]",
    "bg-[var(--chart-3)]",
    "bg-[var(--chart-4)]",
    "bg-[var(--chart-5)]",
  ]

  return (
    <div className={className}>
      <div className="flex h-1.5 w-full overflow-hidden rounded-[2px] bg-muted">
        {segments.map((segment, index) => (
          <span
            key={segment.label}
            className={FILL[index % FILL.length]}
            style={{ width: `${(segment.amount / total) * 100}%` }}
          />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {segments.map((segment, index) => (
          <li
            key={segment.label}
            className="flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground"
          >
            <span
              className={cn("size-1.5 rounded-[1px]", FILL[index % FILL.length])}
            />
            {segment.label}
            <span className="tabular-nums text-foreground/70">
              {Math.round((segment.amount / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Nothing to show, said in the section's own voice rather than as an error. */
export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-3 text-sm text-muted-foreground">{children}</p>
}
