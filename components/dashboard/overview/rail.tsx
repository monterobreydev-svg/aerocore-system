import Link from "next/link"
import { ArrowUpRight } from "lucide-react"

import type { Overview } from "@/lib/dashboard"
import { cn } from "@/lib/utils"
import { Eyebrow, Meter } from "@/components/dashboard/overview/parts"

// ---------------------------------------------------------------------------
// The margin
// ---------------------------------------------------------------------------
//
// The narrow column down the right: money, queues and paperwork. Everything
// here is something the office acts on rather than watches — a claim that has
// been waiting six days, an overtime request nobody has answered — so each
// block is a figure, the thing it is about, and a way in.
//
// It is a margin in the typographic sense. It carries no boxes and no fills of
// its own; a single rule separates one block from the next, and the whole
// column is set against the main text by the vertical rule the page puts
// between them.

/** Whole pesos. The centavos on a fortnight's payroll are noise at this size. */
function pesos(amount: number) {
  return `₱${Math.round(amount).toLocaleString("en-PH")}`
}

function Block({
  title,
  href,
  children,
}: {
  title: string
  href?: string
  children: React.ReactNode
}) {
  return (
    <section className="border-b py-4 first:pt-0 last:border-b-0 lg:py-5">
      <div className="flex items-baseline gap-2">
        <Eyebrow>{title}</Eyebrow>
        {href && (
          <Link
            href={href}
            className="ml-auto text-muted-foreground transition-colors hover:text-brand-strong"
            aria-label={`Open ${title.toLowerCase()}`}
          >
            <ArrowUpRight className="size-3.5" />
          </Link>
        )}
      </div>
      <div className="mt-2.5">{children}</div>
    </section>
  )
}

/** A queue row: who and what, then how long it has been sitting there. */
function QueueRow({
  primary,
  secondary,
  trailing,
  urgent,
}: {
  primary: string
  secondary: string
  trailing: string
  urgent?: boolean
}) {
  return (
    <li className="flex items-baseline justify-between gap-2 py-1">
      <span className="min-w-0">
        <span className="block truncate text-[0.8125rem]">{primary}</span>
        <span className="block truncate text-[0.6875rem] text-muted-foreground">
          {secondary}
        </span>
      </span>
      <span
        className={cn(
          "shrink-0 text-[0.6875rem] tabular-nums",
          urgent
            ? "font-medium text-amber-600 dark:text-amber-400"
            : "text-muted-foreground"
        )}
      >
        {trailing}
      </span>
    </li>
  )
}

export function Rail({ overview }: { overview: Overview }) {
  const { payroll, claims, overtime, documents } = overview

  return (
    <div className="flex flex-col">
      {payroll && (
        <Block title="Payroll" href={`/admin/payroll?cutoff=${payroll.day}`}>
          <p className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {payroll.label}
            </span>
            <span
              className={cn(
                "text-[0.625rem] tracking-[0.1em] uppercase",
                payroll.released
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-muted-foreground"
              )}
            >
              {payroll.released ? "Released" : "Open"}
            </span>
          </p>

          <p className="mt-2 text-2xl leading-none font-semibold tracking-tight tabular-nums">
            {pesos(payroll.gross)}
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">
            {pesos(payroll.net)} net · {payroll.headcount} paid
          </p>

          {/* Where the cutoff has got to. A payroll figure with no sense of
              how much of the period it covers invites the wrong comparison
              with the last one. */}
          <p className="mt-3 flex items-center gap-2 text-[0.6875rem] text-muted-foreground tabular-nums">
            <span className="h-px flex-1 bg-border">
              <span
                className="block h-px bg-foreground/40"
                style={{
                  width: `${Math.min(100, (payroll.dayOfCutoff / payroll.daysInCutoff) * 100)}%`,
                }}
              />
            </span>
            day {payroll.dayOfCutoff} of {payroll.daysInCutoff}
          </p>

          <Meter segments={payroll.parts} className="mt-4" />

          {payroll.openDays > 0 && (
            <p className="mt-3 text-[0.6875rem] text-amber-600 dark:text-amber-400">
              {payroll.openDays} punch{payroll.openDays === 1 ? "" : "es"} in
              this cutoff never closed — they pay nothing until they do.
            </p>
          )}
        </Block>
      )}

      {claims && (
        <Block title="Claims waiting" href="/admin/reimbursements">
          <p className="flex items-baseline gap-2">
            <span className="text-2xl leading-none font-semibold tabular-nums">
              {claims.waiting}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {pesos(claims.amount)}
            </span>
            {claims.oldestDays !== null && claims.oldestDays >= 3 && (
              <span className="ml-auto text-[0.6875rem] text-amber-600 tabular-nums dark:text-amber-400">
                oldest {claims.oldestDays}d
              </span>
            )}
          </p>

          {claims.rows.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Nothing in the queue.
            </p>
          ) : (
            <ul className="mt-2 divide-y">
              {claims.rows.map((row) => (
                <QueueRow
                  key={row.id}
                  primary={row.employeeName}
                  secondary={`${row.referenceNo} · ${pesos(row.amount)}${row.late ? " · filed late" : ""}`}
                  trailing={row.waitingDays === 0 ? "today" : `${row.waitingDays}d`}
                  urgent={row.waitingDays >= 3}
                />
              ))}
            </ul>
          )}
        </Block>
      )}

      {overtime.waiting > 0 && (
        <Block title="Overtime" href="/admin/attendance">
          <p className="flex items-baseline gap-2">
            <span className="text-2xl leading-none font-semibold tabular-nums">
              {overtime.waiting}
            </span>
            <span className="text-xs text-muted-foreground">
              request{overtime.waiting === 1 ? "" : "s"} awaiting a decision
            </span>
          </p>
          <p className="mt-1.5 text-[0.6875rem] text-muted-foreground">
            Unanswered hours are worked hours that pay nothing.
          </p>
        </Block>
      )}

      <Block title="Documents" href="/admin/documents">
        <p className="flex items-baseline gap-2">
          <span className="text-2xl leading-none font-semibold tabular-nums">
            {documents.today}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            filed today · {documents.week} this week
          </span>
        </p>

        {documents.rows.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            No reports filed in the last seven days.
          </p>
        ) : (
          <ul className="mt-2 divide-y">
            {documents.rows.map((row) => (
              <QueueRow
                key={row.id}
                primary={row.clientName}
                secondary={`${row.type} · ${row.serialNo}`}
                trailing={new Date(row.filedAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              />
            ))}
          </ul>
        )}
      </Block>
    </div>
  )
}
