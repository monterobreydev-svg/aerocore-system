"use client"

import { useMemo, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Download,
  TriangleAlert,
} from "lucide-react"

import type { ReportData } from "@/lib/reports"
import type { Preset } from "@/lib/reports/range"
import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import { RangePicker } from "@/components/reports/range-picker"
import {
  AreaTrend,
  BarRows,
  Block,
  CalendarHeatmap,
  CompositionBar,
  DivergingBar,
  DotPlot,
  Leaderboard,
  Legend,
  Meter,
  StackedRows,
  WeekdayProfile,
  hours,
  peso,
} from "@/components/reports/charts"

// ---------------------------------------------------------------------------
// The palette
// ---------------------------------------------------------------------------
//
// Four categorical slots in fixed order, assigned by entity and never by rank,
// plus a five-step ordinal ramp for job status — which is a lifecycle, so it
// gets one hue in graded steps rather than five unrelated colours.
//
// Slot 1 is the app's own --brand token to the digit, and the other three are
// stepped to sit beside it: a warm orange, a violet and a green. Every value
// here was computed and then checked with the validator rather than picked by
// eye — worst adjacent CVD ΔE 19.4 against a target of 8, every slot inside the
// lightness band, every slot over 3:1 on its surface, in both modes. The ramp
// passes monotonicity, step-gap and light-end contrast in both modes too.
//
// Dark is keyed off `.dark`, which is how this codebase switches themes (see
// the @custom-variant in globals.css) — not a media query, and not a data
// attribute. It is selected, not flipped: its own steps, validated against the
// dark card surface.
const PALETTE = `
.viz {
  --viz-1: #0092b7;
  --viz-2: #dc631e;
  --viz-3: #7935c6;
  --viz-4: #0e9254;
  --viz-o1: #6213ab;
  --viz-o2: #7a3dc5;
  --viz-o3: #9260da;
  --viz-o4: #aa83ea;
  --viz-o5: #bfa4f0;
  --viz-h1: #6cc2da;
  --viz-h2: #19adcc;
  --viz-h3: #0092b7;
  --viz-h4: #00769b;
  --viz-h5: #005b7b;
  --viz-grid: color-mix(in oklab, currentColor 12%, transparent);
  --viz-track: color-mix(in oklab, currentColor 8%, transparent);
  --viz-muted: color-mix(in oklab, currentColor 55%, transparent);
  --viz-surface: var(--card);
}
.dark .viz {
  --viz-1: #00a4c7;
  --viz-2: #db703b;
  --viz-3: #9867e1;
  --viz-4: #38a065;
  --viz-o1: #763ebd;
  --viz-o2: #8c5ad3;
  --viz-o3: #a17adf;
  --viz-o4: #b59be6;
  --viz-o5: #cbbaeb;
  --viz-h1: #90d0e2;
  --viz-h2: #48bbd9;
  --viz-h3: #00a4c7;
  --viz-h4: #008cb1;
  --viz-h5: #007394;
}
`

/** Each section owns a hue, and its figure up in the masthead wears the same. */
const ACCENT = {
  attendance: "var(--viz-1)",
  payroll: "var(--viz-2)",
  scheduling: "var(--viz-3)",
  claims: "var(--viz-4)",
} as const

const PAYROLL_SERIES = [
  { key: "basic", label: "Basic", color: "var(--viz-1)" },
  { key: "overtime", label: "Overtime", color: "var(--viz-2)" },
  { key: "night", label: "Night differential", color: "var(--viz-3)" },
  { key: "holiday", label: "Holiday premium", color: "var(--viz-4)" },
]

/**
 * Status in lifecycle order, darkest first — not in count order.
 *
 * The order is fixed so that filtering the period can never repaint the
 * statuses that survive: a reader who learned that solid violet means
 * "completed" keeps that reading in every period they look at.
 */
const STATUS_ORDER = [
  "COMPLETED",
  "PENDING",
  "NEED_TO_RETURN",
  "RESCHEDULED",
  "CANCELLED",
] as const
const RAMP = [
  "var(--viz-o1)",
  "var(--viz-o2)",
  "var(--viz-o3)",
  "var(--viz-o4)",
  "var(--viz-o5)",
]

/**
 * How this figure compares with the window before.
 *
 * Deliberately colourless. Green-up/red-down would be a judgement, and it is
 * the wrong one about half the time here — more hours on the clock can mean a
 * busy month or an overtime problem, and the page has no way to know which.
 * The arrow carries the direction; the reader carries the opinion.
 */
function Delta({
  current,
  previous,
  period,
}: {
  current: number
  previous: number | undefined
  period: string
}) {
  if (previous === undefined) return null
  if (previous === 0 && current === 0) return null

  const shared =
    "mt-2 flex items-center gap-1 truncate text-[11px] text-muted-foreground"
  const tooltip = `${previous.toLocaleString()} in the previous period, ${period}`

  if (previous === 0) {
    return (
      <p className={shared} title={tooltip}>
        <ArrowUpRight className="size-3 shrink-0" />
        up from none
      </p>
    )
  }

  const change = Math.round(((current - previous) / previous) * 100)
  if (change === 0) {
    return (
      <p className={shared} title={tooltip}>
        <ArrowRight className="size-3 shrink-0" />
        level with last period
      </p>
    )
  }

  const Icon = change > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <p className={shared} title={tooltip}>
      <Icon className="size-3 shrink-0" />
      <span className="tabular-nums">{Math.abs(change)}%</span>
      <span className="truncate">vs last period</span>
    </p>
  )
}

/**
 * A masthead figure. The rule above it is its section's hue, so the number and
 * the detail further down the sheet are visibly the same subject.
 *
 * Proportional figures, not tabular — equal-width digits make a large
 * standalone number look loose. `tabular-nums` is for columns.
 */
function Figure({
  label,
  value,
  hint,
  accent,
  children,
}: {
  label: string
  value: string
  hint: string
  accent: string
  children?: React.ReactNode
}) {
  return (
    <div className="min-w-0">
      <span
        className="block h-[3px] w-7 rounded-full"
        style={{ background: accent }}
      />
      <p className="mt-2.5 truncate text-[11px] tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 truncate text-2xl leading-none font-semibold sm:text-[1.75rem]">
        {value}
      </p>
      <p className="mt-1.5 truncate text-[11px] text-muted-foreground">{hint}</p>
      {children}
    </div>
  )
}

/**
 * A band of the sheet.
 *
 * Numbered, ruled, and carrying its own headline figure on the right — the way
 * a printed report is set, rather than as another rounded box in a grid. The
 * page the reader downloads is a document, so the page they read is one too.
 */
function Section({
  index,
  title,
  accent,
  summary,
  children,
}: {
  index: string
  title: string
  accent: string
  summary: string
  children: React.ReactNode
}) {
  return (
    <section className="border-t px-4 py-6 sm:px-6">
      <header className="flex items-center gap-3">
        <span
          className="text-[11px] font-semibold tabular-nums"
          style={{ color: accent }}
        >
          {index}
        </span>
        <h3 className="text-xs font-semibold tracking-[0.14em] uppercase">
          {title}
        </h3>
        <span className="h-px min-w-4 flex-1 bg-border" />
        <span className="shrink-0 truncate text-xs text-muted-foreground">
          {summary}
        </span>
      </header>
      <div className="mt-5">{children}</div>
    </section>
  )
}

export function ReportsView({
  data,
  from,
  to,
  today,
  presets,
}: {
  data: ReportData
  from: string
  to: string
  /** Server-local today, so nothing here reads the phone's clock. */
  today: string
  presets: Preset[]
}) {
  const { headline, compare, flags, claims } = data
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  // Held in a transition so the sheet keeps its previous render while the next
  // period loads — no skeleton, no layout jump, no flash.
  const select = (range: { from: string; to: string }) => {
    startTransition(() => {
      router.push(`/admin/reports?from=${range.from}&to=${range.to}`)
    })
  }

  const preset = presets.find((entry) => entry.from === from && entry.to === to)

  // Both derived from the array the trend already needed, so the shape of the
  // week and the busiest day cost nothing extra over the wire.
  const weekday = useMemo(() => {
    const totals = [0, 0, 0, 0, 0, 0, 0]
    for (const day of data.hoursByDay) {
      totals[new Date(`${day.date}T00:00:00`).getDay()] += day.hours
    }
    return totals
  }, [data.hoursByDay])

  const busiest = useMemo(
    () =>
      data.hoursByDay.reduce<ReportData["hoursByDay"][number] | null>(
        (best, day) => (day.hours > (best?.hours ?? 0) ? day : best),
        null
      ),
    [data.hoursByDay]
  )

  const workedDays = data.hoursByDay.filter((day) => day.hours > 0).length

  // Fixed lifecycle order, and only the statuses that actually occurred.
  const statusSeries = STATUS_ORDER.map((key, index) => ({
    key,
    label: data.scheduleStatus.find((s) => s.key === key)?.label ?? key,
    color: RAMP[index],
  })).filter((entry) => data.scheduleStatus.some((s) => s.key === entry.key))
  const statusValues = statusSeries.map(
    (entry) => data.scheduleStatus.find((s) => s.key === entry.key)?.value ?? 0
  )

  const payrollTotals = PAYROLL_SERIES.map((_, slot) =>
    data.payrollByCutoff.reduce(
      (total, cutoff) =>
        total + [cutoff.basic, cutoff.overtime, cutoff.night, cutoff.holiday][slot],
      0
    )
  )

  // Each of these is a thing somebody has to go and do, so each one is a link
  // to the page where they'd do it rather than a sentence about it.
  const attention = [
    flags.openPunches > 0 && {
      href: "/admin/attendance",
      text: `${flags.openPunches} punch${flags.openPunches === 1 ? "" : "es"} never closed`,
    },
    flags.unapprovedOvertime > 0 && {
      href: "/admin/attendance",
      text: `${flags.unapprovedOvertime} overtime request${flags.unapprovedOvertime === 1 ? "" : "s"} waiting`,
    },
    flags.autoClosed > 0 && {
      href: "/admin/attendance",
      text: `${flags.autoClosed} closed automatically`,
    },
    flags.pendingClaims > 0 && {
      href: "/admin/reimbursements",
      text: `${flags.pendingClaims} claim${flags.pendingClaims === 1 ? "" : "s"} to review`,
    },
    flags.cancelledJobs > 0 && {
      href: "/admin/schedules",
      text: `${flags.cancelledJobs} job${flags.cancelledJobs === 1 ? "" : "s"} cancelled`,
    },
  ].filter(Boolean) as { href: string; text: string }[]

  return (
    <div className="viz flex flex-col gap-4">
      <style>{PALETTE}</style>

      {/* One row, above everything it scopes. Full-bleed and sticky under the
          app header, so the period stays visible while you read down. */}
      <div
        className={cn(
          "sticky top-16 z-10 -mx-3 flex flex-wrap items-center gap-2 border-b px-3 py-2.5 sm:-mx-4 sm:px-4 md:-mx-6 md:px-6",
          "bg-background/85 backdrop-blur-md supports-backdrop-filter:bg-background/70"
        )}
      >
        <RangePicker
          from={from}
          to={to}
          label={data.range.label}
          presetLabel={preset?.label ?? null}
          presets={presets}
          today={today}
          onSelect={select}
          pending={pending}
        />

        <span className="hidden text-xs text-muted-foreground lg:inline">
          {data.range.days} {data.range.days === 1 ? "day" : "days"} ·{" "}
          {headline.staff} on the payroll
        </span>

        {/* A plain anchor wearing the button's clothes, so the browser owns the
            download. Styled with buttonVariants rather than rendered through
            <Button>, because this is a link and not a button: Base UI's Button
            expects a native <button> underneath, and swapping the element out
            from under it strips the semantics it advertises. The range travels
            with the href — a report is only ever of the period on screen. */}
        <a
          href={`/api/reports/download?from=${from}&to=${to}`}
          className={cn(buttonVariants({ size: "sm" }), "ml-auto h-9")}
        >
          <Download />
          <span className="hidden sm:inline">Download report</span>
          <span className="sm:hidden">Report</span>
        </a>
      </div>

      {/* The sheet. One container for the whole report rather than a card per
          chart — the sections are ruled, not boxed. */}
      <div
        className={cn(
          "overflow-hidden rounded-2xl border bg-card shadow-sm transition-opacity duration-150",
          pending && "pointer-events-none opacity-60"
        )}
      >
        {/* ---- masthead ---- */}
        <div
          className="px-4 py-5 sm:px-6 sm:py-6"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in oklab, var(--brand) 11%, var(--card)) 0%, var(--card) 58%)",
          }}
        >
          <p className="text-[11px] tracking-[0.2em] text-muted-foreground uppercase">
            Operations report
          </p>
          <h3 className="mt-1.5 text-xl font-semibold sm:text-2xl">
            {data.range.label}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {preset ? `${preset.label} · ` : ""}
            {data.range.days} {data.range.days === 1 ? "day" : "days"} ·{" "}
            {headline.staff} {headline.staff === 1 ? "person" : "people"} on the
            payroll
          </p>

          <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-6 sm:grid-cols-4">
            <Figure
              label="On the clock"
              value={hours(headline.hoursWorked)}
              hint={`${headline.daysWorked} day${headline.daysWorked === 1 ? "" : "s"} · ${headline.overtimeHours} h overtime`}
              accent={ACCENT.attendance}
            >
              <Delta
                current={headline.hoursWorked}
                previous={compare?.hoursWorked}
                period={compare?.label ?? ""}
              />
            </Figure>

            {/* No delta here on purpose — see the note in lib/reports.ts. Pay is
                earned per cutoff, and two arbitrary windows rarely hold the same
                number of them. */}
            <Figure
              label="Gross payroll"
              value={peso(headline.grossPay)}
              hint={`${peso(headline.netPay)} net of deductions`}
              accent={ACCENT.payroll}
            />

            <Figure
              label="Jobs scheduled"
              value={headline.jobs.toLocaleString()}
              hint={`${headline.jobsCompleted} completed${
                headline.jobs > 0
                  ? ` · ${Math.round((headline.jobsCompleted / headline.jobs) * 100)}%`
                  : ""
              }`}
              accent={ACCENT.scheduling}
            >
              <Delta
                current={headline.jobs}
                previous={compare?.jobs}
                period={compare?.label ?? ""}
              />
            </Figure>

            <Figure
              label="Expenses claimed"
              value={peso(claims.total)}
              hint={`${claims.count} claim${claims.count === 1 ? "" : "s"} · ${headline.reportsFiled} report${headline.reportsFiled === 1 ? "" : "s"} filed`}
              accent={ACCENT.claims}
            />
          </div>
        </div>

        {attention.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 sm:px-6">
            <span className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
              <TriangleAlert className="size-3.5 shrink-0" />
              Worth a look
            </span>
            {attention.map((item) => (
              <Link
                key={item.text}
                href={item.href}
                className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-background/60 px-2.5 py-1 text-xs transition-colors hover:bg-background"
              >
                {item.text}
                <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        )}

        {/* ---- 01 attendance ---- */}
        <Section
          index="01"
          title="Attendance"
          accent={ACCENT.attendance}
          summary={`${hours(headline.hoursWorked)} across ${workedDays} working ${workedDays === 1 ? "day" : "days"}`}
        >
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_13rem]">
            <Block
              caption="Hours by the day the punch was filed under. Weekends are shaded; a punch still open contributes nothing until the office closes it."
              columns={["Day", "Hours", "Punches"]}
              rows={data.hoursByDay.map((d) => [d.date, d.hours, d.punches])}
              empty="Nobody punched in during this period."
            >
              <AreaTrend
                points={data.hoursByDay}
                height={210}
                color={ACCENT.attendance}
              />
            </Block>

            <div className="flex flex-col gap-4 lg:border-l lg:pl-6">
              <div>
                <p className="text-xs font-medium">The shape of the week</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Total hours by weekday.
                </p>
              </div>
              <WeekdayProfile values={weekday} color={ACCENT.attendance} />
              <dl className="flex flex-col gap-2 border-t pt-3 text-xs">
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-muted-foreground">Busiest day</dt>
                  <dd className="truncate font-medium">
                    {busiest && busiest.hours > 0 ? busiest.date.slice(5) : "—"}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-muted-foreground">Average a day</dt>
                  <dd className="font-medium tabular-nums">
                    {workedDays > 0
                      ? `${Math.round(headline.hoursWorked / workedDays)} h`
                      : "—"}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="mt-7 grid gap-6 border-t pt-6 lg:grid-cols-[minmax(0,1fr)_13rem]">
            <Block
              title="Every day in the period"
              caption="One square a day, a column a week. An empty square is a day nobody punched — which a line chart hides, because it draws straight through a zero."
              columns={["Day", "Hours", "Punches"]}
              rows={data.hoursByDay.map((d) => [d.date, d.hours, d.punches])}
              empty="Nobody punched in during this period."
            >
              <CalendarHeatmap points={data.hoursByDay} />
            </Block>

            {/* Reports are filed against a punch, so this is where they live —
                not in a paperwork drawer at the bottom of the page. */}
            <Block
              title="Reports filed"
              caption="Against the punches above."
              columns={["Kind", "Filed"]}
              rows={data.reportTypes.map((s) => [s.label, s.value])}
              empty="No reports were filed in this period."
              className="lg:border-l lg:pl-6"
            >
              <BarRows
                rows={data.reportTypes.map((s) => ({
                  label: s.label,
                  value: s.value,
                }))}
                color={ACCENT.attendance}
              />
            </Block>
          </div>
        </Section>

        {/* ---- 02 payroll ---- */}
        <Section
          index="02"
          title="Payroll"
          accent={ACCENT.payroll}
          summary={`${peso(headline.grossPay)} gross · ${data.payrollByCutoff.length} cutoff${data.payrollByCutoff.length === 1 ? "" : "s"}`}
        >
          <Block
            caption="What earned the pay — ordinary hours, overtime, the night differential and holiday premium. The wide bar is the whole period; the rows below split it by cutoff, each drawn against the largest."
            columns={["Cutoff", "Basic", "Overtime", "Night", "Holiday"]}
            rows={data.payrollByCutoff.map((c) => [
              c.label,
              peso(c.basic),
              peso(c.overtime),
              peso(c.night),
              peso(c.holiday),
            ])}
            empty="No payroll fell in this period."
          >
            <div className="flex flex-col gap-4">
              <CompositionBar
                series={PAYROLL_SERIES}
                values={payrollTotals}
                format={peso}
              />
              <Legend series={PAYROLL_SERIES} />
              <div className="mt-1 border-t pt-4">
                <StackedRows
                  series={PAYROLL_SERIES}
                  rows={data.payrollByCutoff.map((c) => ({
                    label: c.label,
                    values: [c.basic, c.overtime, c.night, c.holiday],
                  }))}
                  format={peso}
                />
              </div>
            </div>
          </Block>
        </Section>

        {/* ---- 03 scheduling ---- */}
        <Section
          index="03"
          title="Scheduling"
          accent={ACCENT.scheduling}
          summary={`${headline.jobs} job${headline.jobs === 1 ? "" : "s"} · ${headline.jobsCompleted} completed`}
        >
          <div className="flex flex-col gap-7">
            <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
              {/* One ratio against its limit is a meter, not a chart — and
                  certainly not a two-slice pie. */}
              <div className="lg:border-r lg:pr-6">
                <Meter
                  value={headline.jobsCompleted}
                  total={headline.jobs}
                  label="of scheduled work completed"
                  color={ACCENT.scheduling}
                />
              </div>

              <Block
                caption="Every job in the period by where it ended up, in lifecycle order — solid is done, faded is not."
                columns={["Status", "Jobs"]}
                rows={statusSeries.map((s, index) => [
                  s.label,
                  statusValues[index],
                ])}
                empty="Nothing was scheduled in this period."
              >
                <div className="flex flex-col gap-3">
                  <CompositionBar
                    series={statusSeries}
                    values={statusValues}
                    format={(value) => `${value} job${value === 1 ? "" : "s"}`}
                    height={28}
                  />
                  <Legend series={statusSeries} />
                </div>
              </Block>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <Block
                title="Work carried out"
                caption="A job can carry more than one kind of work, so these total higher than the job count."
                columns={["Work type", "Jobs"]}
                rows={data.workTypes.map((s) => [s.label, s.value])}
                empty="No work types were recorded."
              >
                <DotPlot
                  rows={data.workTypes.map((s) => ({
                    label: s.label,
                    value: s.value,
                  }))}
                  color={ACCENT.scheduling}
                />
              </Block>

              <Block
                title="Busiest clients"
                caption="By jobs scheduled in the period."
                columns={["Client", "Jobs"]}
                rows={data.topClients.map((s) => [s.label, s.value])}
                empty="No clients were serviced in this period."
              >
                <Leaderboard
                  rows={data.topClients.map((s) => ({
                    label: s.label,
                    value: s.value,
                  }))}
                  color={ACCENT.scheduling}
                />
              </Block>
            </div>
          </div>
        </Section>

        {/* ---- 04 reimbursements ---- */}
        <Section
          index="04"
          title="Reimbursements"
          accent={ACCENT.claims}
          summary={`${peso(claims.total)} claimed · ${claims.count} claim${claims.count === 1 ? "" : "s"}`}
        >
          {claims.count === 0 ? (
            <p className="text-sm text-muted-foreground">
              No claims were submitted in this period.
            </p>
          ) : (
            <div className="flex flex-col gap-7">
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_15rem]">
                <Block
                  title="Where the claims landed"
                  caption="Approved and rejected are opposite answers to the same question, so they are drawn either side of one axis rather than end to end. Money, not row counts."
                  columns={["Status", "Claims", "Amount"]}
                  rows={claims.byStatus.map((s) => [
                    s.label,
                    s.count,
                    peso(s.amount),
                  ])}
                >
                  <DivergingBar
                    left={{
                      label: "Rejected",
                      value:
                        claims.byStatus.find((s) => s.key === "REJECTED")
                          ?.amount ?? 0,
                      color: "var(--viz-2)",
                    }}
                    right={{
                      label: "Approved",
                      value:
                        claims.byStatus.find((s) => s.key === "APPROVED")
                          ?.amount ?? 0,
                      color: "var(--viz-4)",
                    }}
                    format={peso}
                  />
                </Block>

                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs lg:grid-cols-1 lg:border-l lg:pl-6">
                  {[
                    {
                      term: "Awaiting review",
                      value: peso(
                        claims.byStatus.find((s) => s.key === "PENDING_REVIEW")
                          ?.amount ?? 0
                      ),
                    },
                    {
                      term: "Average decision",
                      value:
                        claims.turnaroundDays === null
                          ? "nothing decided yet"
                          : `${claims.turnaroundDays} day${claims.turnaroundDays === 1 ? "" : "s"}`,
                    },
                    { term: "Largest claim", value: peso(claims.largest) },
                    {
                      term: "Filed late",
                      value: `${claims.lateCount} of ${claims.count}`,
                    },
                  ].map((stat) => (
                    <div key={stat.term} className="flex flex-col gap-0.5">
                      <dt className="text-muted-foreground">{stat.term}</dt>
                      <dd className="truncate font-medium">{stat.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div className="grid gap-6 border-t pt-6 sm:grid-cols-2">
                <Block
                  title="Who claimed"
                  caption="By the value of what they filed in the period."
                  columns={["Employee", "Claimed"]}
                  rows={claims.topClaimants.map((s) => [s.label, peso(s.value)])}
                  empty="Nobody filed a claim in this period."
                >
                  <Leaderboard
                    rows={claims.topClaimants.map((s) => ({
                      label: s.label,
                      value: s.value,
                    }))}
                    color={ACCENT.claims}
                    format={peso}
                  />
                </Block>

                <Block
                  title="Charged to"
                  caption="One receipt can cover two jobs, so these are the stored per-client shares rather than whole claims counted twice."
                  columns={["Client", "Charged"]}
                  rows={claims.byClient.map((s) => [s.label, peso(s.value)])}
                  empty="No claim line was charged to a client."
                >
                  <DotPlot
                    rows={claims.byClient.map((s) => ({
                      label: s.label,
                      value: s.value,
                    }))}
                    color={ACCENT.claims}
                    format={peso}
                  />
                </Block>
              </div>
            </div>
          )}
        </Section>

        <p className="border-t bg-muted/30 px-4 py-3 text-[11px] leading-relaxed text-muted-foreground sm:px-6">
          Payroll is recomputed from attendance every time this page opens, so a
          corrected punch shows here on the next load. Figures against the
          previous period are left off payroll on purpose — pay is earned per
          cutoff, and two windows of the same length rarely hold the same number
          of them. Download the report for these same figures with the working
          written out in sentences.
        </p>
      </div>
    </div>
  )
}
