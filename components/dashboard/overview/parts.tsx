import Link from "next/link"
import { ArrowUpRight } from "lucide-react"

import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// The overview's vocabulary
// ---------------------------------------------------------------------------
//
// A small kit the whole front page is assembled from, so that a heading is the
// same heading everywhere, a figure sits on the same baseline, and every panel
// has the same edge, the same corner and the same internal rhythm.
//
// The unit is the panel: one subject, its own surface, a titled bar across the
// top with the way in on the right. Panels are what let the eye group and skip
// — the floor is one thing to read, the payroll is another, and the border
// between them says so before a single word is read. Depth is one hairline and
// one hair of shadow; anything heavier and eight panels start shouting over
// each other.
//
// Everything is a server component. Nothing on this page needs a click to
// reveal what it means, so nothing here ships JavaScript.

/** The small caps label. Used inside panels, never as a panel's own title. */
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
 * The surface everything on this page sits on.
 *
 * `overflow-hidden` is not decoration: the plot inside the floor panel runs to
 * the panel's edge, and the corner has to cut it.
 */
export function Panel({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm",
        className
      )}
    >
      {children}
    </section>
  )
}

/**
 * A panel's title bar: a tinted glyph, the subject, a line of context under it,
 * and the link to the page that owns the subject in full.
 *
 * The glyph is the one piece of colour a panel gets for free. It is doing
 * navigation work rather than decoration — at a glance down a column of panels
 * the shapes are what tell you which one is the money and which one is the
 * diary, faster than reading four titles.
 */
export function PanelHead({
  title,
  meta,
  href,
  action,
  icon: Icon,
  tone = "brand",
}: {
  title: string
  meta?: React.ReactNode
  href?: string
  /** What the link says on a wide screen. The arrow shows at every width. */
  action?: string
  icon?: React.ComponentType<{ className?: string }>
  tone?: "brand" | "warn"
}) {
  return (
    <div className="flex items-center gap-3 border-b px-4 py-3 sm:px-5">
      {Icon && (
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-[0.625rem]",
            tone === "warn"
              ? "bg-amber-500/12 text-amber-600 dark:text-amber-400"
              : "bg-brand/12 text-brand-strong dark:text-brand"
          )}
        >
          <Icon className="size-4" />
        </span>
      )}

      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm leading-tight font-semibold tracking-tight">
          {title}
        </h2>
        {meta && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground tabular-nums">
            {meta}
          </p>
        )}
      </div>

      {href && (
        // The label is spelled out for a screen reader whatever the width,
        // because the visible word is hidden on a phone and the arrow on its
        // own says nothing. `aria-label` rather than a second sr-only span —
        // that would have the wide layout announcing the destination twice.
        <Link
          href={href}
          aria-label={action ? `${action} — ${title}` : `Open ${title}`}
          className="-mr-1.5 inline-flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-brand-strong dark:hover:text-brand"
        >
          {action && <span className="hidden sm:inline">{action}</span>}
          <ArrowUpRight className="size-3.5" />
        </Link>
      )}
    </div>
  )
}

/** The padded region under a title bar. */
export function PanelBody({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("px-4 py-4 sm:px-5", className)}>{children}</div>
  )
}

/**
 * A figure and what it counts.
 *
 * The number carries the weight and the word under it stays quiet — the
 * opposite of the convention where a bold caption competes with the number it
 * is labelling. `tabular-nums` throughout, so a row of these does not shuffle
 * sideways when a count ticks over.
 */
export function Stat({
  value,
  label,
  note,
  tone = "plain",
  size = "md",
}: {
  value: React.ReactNode
  label: string
  note?: React.ReactNode
  tone?: "plain" | "live" | "quiet" | "warn"
  size?: "md" | "lg"
}) {
  return (
    <div className="min-w-0">
      <p
        className={cn(
          "leading-none font-semibold tracking-tight tabular-nums",
          size === "lg" ? "text-2xl sm:text-[1.75rem]" : "text-xl sm:text-2xl",
          tone === "live" && "text-brand-strong dark:text-brand",
          tone === "quiet" && "text-muted-foreground",
          tone === "warn" && "text-amber-600 dark:text-amber-400"
        )}
      >
        {value}
      </p>
      <p className="mt-2 truncate text-[0.6875rem] tracking-[0.08em] text-muted-foreground uppercase">
        {label}
      </p>
      {note && (
        <p className="mt-1 truncate text-[0.6875rem] text-muted-foreground/80">
          {note}
        </p>
      )}
    </div>
  )
}

/**
 * A quantity split into its parts, drawn as one bar.
 *
 * One hue in graded steps rather than a colour per part, because this is not
 * five things — it is one payroll divided up, and a categorical palette would
 * imply a relationship between the segments that does not exist. The steps come
 * from the validated ordinal ramp in globals.css; the 2px gaps are surface
 * showing through, which is what keeps two adjacent steps readable as two.
 *
 * Beyond the ramp's five steps the remainder folds into "Other" rather than
 * generating a sixth colour. A palette that grows to fit its data is a palette
 * that has stopped being checked.
 */
export function Composition({
  segments,
  format,
  className,
}: {
  segments: { label: string; amount: number }[]
  /** How an amount is written in the legend. */
  format: (amount: number) => string
  className?: string
}) {
  const total = segments.reduce((sum, segment) => sum + segment.amount, 0)
  if (total <= 0) return null

  const RAMP = [
    "var(--viz-h5)",
    "var(--viz-h4)",
    "var(--viz-h3)",
    "var(--viz-h2)",
    "var(--viz-h1)",
  ]

  const named = segments.slice(0, RAMP.length)
  const rest = segments.slice(RAMP.length)
  const parts = [
    ...named.map((segment, index) => ({ ...segment, fill: RAMP[index] })),
    ...(rest.length > 0
      ? [
          {
            label: "Other",
            amount: rest.reduce((sum, segment) => sum + segment.amount, 0),
            fill: "var(--viz-track)",
          },
        ]
      : []),
  ]

  const share = (amount: number) => Math.round((amount / total) * 100)

  return (
    <div className={className}>
      <div className="flex h-2 w-full gap-[2px] overflow-hidden rounded-full">
        {parts.map((part) => (
          <span
            key={part.label}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${(part.amount / total) * 100}%`,
              background: part.fill,
            }}
            title={`${part.label} — ${format(part.amount)} (${share(part.amount)}%)`}
          />
        ))}
      </div>

      {/* Direct labels rather than a key off to one side: at this width the
          segments are too narrow to label in place, and a legend the eye has to
          travel to is a legend nobody reads. */}
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
        {parts.map((part) => (
          <li
            key={part.label}
            className="flex min-w-0 items-center gap-1.5 text-[0.6875rem]"
          >
            <span
              className="size-2 shrink-0 rounded-[2px]"
              style={{ background: part.fill }}
            />
            <span className="min-w-0 truncate text-muted-foreground">
              {part.label}
            </span>
            <span className="ml-auto shrink-0 font-medium tabular-nums">
              {share(part.amount)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * One proportion, drawn as an arc with the figure inside it.
 *
 * Reserved for a fraction of a known whole — how far into a cutoff the day is,
 * and nothing else. A ring is a poor way to compare quantities and a good way
 * to show one quantity's progress towards a limit, which is exactly the
 * question the payroll panel asks.
 */
export function Ring({
  fraction,
  primary,
  secondary,
  size = 68,
  width = 6,
}: {
  fraction: number
  primary: string
  secondary?: string
  size?: number
  width?: number
}) {
  const clamped = Math.min(1, Math.max(0, fraction))
  const radius = (size - width) / 2
  const circumference = 2 * Math.PI * radius

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${Math.round(clamped * 100)} per cent`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--viz-track)"
          strokeWidth={width}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--viz-1)"
          strokeWidth={width}
          strokeLinecap="round"
          strokeDasharray={`${circumference * clamped} ${circumference}`}
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="text-sm font-semibold tabular-nums">{primary}</span>
        {secondary && (
          <span className="mt-0.5 text-[0.5625rem] tracking-[0.08em] text-muted-foreground uppercase">
            {secondary}
          </span>
        )}
      </span>
    </div>
  )
}

/** Nothing to show, said in the panel's own voice rather than as an error. */
export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-4 py-8 text-center text-sm text-muted-foreground sm:px-5">
      {children}
    </p>
  )
}
