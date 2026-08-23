import "server-only"

import { renderPdf, type PdfBlock } from "@/lib/formats/pdf"
import {
  columns as columnChart,
  donut,
  donutHeight,
  stackedColumns,
  type Series,
} from "@/lib/formats/chart"
import {
  CYAN_RAMP,
  FOOTER,
  INK,
  LETTERHEAD,
  MONEY_RAMP,
  NAME_COLUMN,
  RUNNING_HEAD,
  STATUS_RAMP,
  VIZ,
  caption,
  figure,
  footer,
  heading,
  letterhead,
  prose,
  ranking,
  runningHead,
  subheading,
  table,
  type PaperHead,
  type PaperMeta,
} from "@/lib/reports/paper"
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  VAT_RATE,
} from "@/lib/projects"
import type { ProjectsReport } from "@/lib/projects/report"

// ---------------------------------------------------------------------------
// The year's project book, as a document
// ---------------------------------------------------------------------------
//
// The other half of the export. The workbook is for working with; this is for
// reading and for sending — what the year did, in the order somebody asks it:
// what came in, what it cost, what was left, and which jobs and clients account
// for it.
//
// Every chart is followed by the same figures in a sentence. That is not
// redundancy: a chart shows shape and hides magnitude, a sentence does the
// reverse, and this document gets forwarded to people who will quote a number
// out of it without ever seeing the picture. It also survives being printed in
// black and white, which a stacked bar does not.

const DOCUMENT = "Project Report"

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

/**
 * Whole pesos, labelled PHP.
 *
 * Not "₱": the standard PDF fonts are WinAnsi, which has no slot for the peso
 * sign, so one would mean embedding a font — a hundred kilobytes to save three
 * characters.
 */
/**
 * Rounded by magnitude, then signed.
 *
 * `Math.round` breaks ties toward positive infinity, so a cost of 3512.50 reads
 * as 3,513 and a loss of the same size reads as -3,512 — two figures from one
 * number that visibly fail to reconcile on the same page.
 */
function whole(value: number) {
  const rounded = Math.round(Math.abs(value))
  return value < 0 ? -rounded : rounded
}

function peso(value: number) {
  const rounded = whole(value)
  return rounded < 0
    ? `-PHP ${Math.abs(rounded).toLocaleString("en-PH")}`
    : `PHP ${rounded.toLocaleString("en-PH")}`
}

function amount(value: number) {
  return whole(value).toLocaleString("en-PH")
}

function compact(value: number) {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (Math.abs(value) >= 1_000) return `${Math.round(value / 1_000)}k`
  return String(Math.round(value))
}

function plural(count: number, one: string, many = `${one}s`) {
  return count === 1 ? one : many
}

/** A share, written the way a person says it. Null when there is no base. */
function percent(part: number, whole: number) {
  if (whole <= 0) return null
  return Math.round((part / whole) * 1000) / 10
}

function paperHead(report: ProjectsReport): PaperHead {
  const clients = new Set(report.projects.map((project) => project.clientName))
    .size

  return {
    document: DOCUMENT,
    periodLabel: report.periodLabel,
    // The filter, where there was one, in place of the roster count. What this
    // document covers matters more on the cover than how much of it there is,
    // and the count is in the first sentence either way.
    periodNote:
      report.filterNote ??
      `${report.totals.count} ${plural(report.totals.count, "project")} · ${clients} ${plural(clients, "client")}`,
  }
}

// ---------------------------------------------------------------------------

function blocks(report: ProjectsReport): PdfBlock[] {
  const out: PdfBlock[] = []
  const { totals } = report

  // Numbered as they are emitted, so a section that has nothing to say leaves
  // no gap behind it. A report that runs 1, 2, 3, 5, 7 reads as one with pages
  // missing.
  let section = 0
  const next = () => (section += 1)

  const margin = percent(totals.grossProfit, totals.accrualRevenue)
  const collected = percent(totals.cashCollection, totals.projectAmount)
  const overhead = [...report.opexByMonth.values()].reduce((a, b) => a + b, 0)

  // ---- 1. the year in one paragraph ---------------------------------------

  out.push({
    kind: "keep",
    blocks: [
      ...heading(next(), `${report.periodLabel} at a glance`, VIZ.claims),
      ...prose(
        totals.count === 0
          ? `No projects were booked in ${report.periodLabel}${report.filterNote ? ` matching this selection (${report.filterNote})` : ""}. Nothing below has anything to report on.`
          : `${totals.count} ${plural(totals.count, "project was", "projects were")} booked in ${report.periodLabel}, worth ${peso(totals.projectAmount)} in total. Against them the company has recognised ${peso(totals.accrualRevenue)} of revenue and collected ${peso(totals.cashCollection)} in cash${
              collected === null
                ? ""
                : ` — ${collected}% of what was booked`
            }. The work cost ${peso(totals.cogs)}, leaving a gross ${
              totals.grossProfit < 0
                ? `loss of ${peso(Math.abs(totals.grossProfit))}`
                : `profit of ${peso(totals.grossProfit)}`
            }${
              margin === null
                ? ""
                : ` and a margin of ${margin}% on recognised revenue`
            }. Overhead for the year, which belongs to no single job, came to ${peso(overhead)}.`
      ),
    ],
  })

  if (totals.count === 0) return out

  out.push({ kind: "space", height: 6 })
  out.push(
    ...caption(
      `Cost here is everything charged to a sales order: what employees liquidated against it, what the office paid directly, and the wages of the crews for the hours they were scheduled on it. VAT is taken at ${Math.round(VAT_RATE * 100)}%.${
        totals.accrualRevenue === 0
          ? " No revenue has been recognised against these projects yet, so the year reads as a loss of exactly what has been spent, and the sections that rank by revenue are left out until there is some."
          : ""
      }`
    )
  )

  // ---- 2. revenue against cost, month by month ----------------------------

  const months = [...report.monthTotals.keys()].sort((a, b) => a - b)
  const series: Series[] = [
    { label: "Cost of the work", color: MONEY_RAMP[1] },
    { label: "Gross profit", color: MONEY_RAMP[0] },
  ]

  if (months.length > 0) {
    // Ranked by revenue where there is some, by cost where there is not —
    // otherwise every month ties at zero and "busiest" names whichever came
    // first in the list.
    const rank = (month: number) => {
      const row = report.monthTotals.get(month)
      if (!row) return 0
      return totals.accrualRevenue > 0 ? row.accrualRevenue : row.cogs
    }
    const best = months.reduce((top, month) =>
      rank(month) > rank(top) ? month : top
    )
    const bestTotals = report.monthTotals.get(best)!

    out.push({
      kind: "keep",
      blocks: [
        ...heading(next(), "Revenue against what it cost", VIZ.payroll),
        ...prose(
          `Each month of the period that had a project starting in it, with recognised revenue split into the cost of doing the work and what was left as gross profit. The two bands together are the revenue; the orange one is what it took to earn it.`
        ),
        { kind: "space", height: 8 },
        figure(178, (box) =>
          stackedColumns({
            box,
            height: 170,
            groups: months.map((month) => {
              const row = report.monthTotals.get(month)!
              return {
                label: MONTHS[month],
                // Profit can be negative on a job that overran; the chart
                // cannot draw a negative band, so it is floored here and the
                // sentence underneath carries the real figure.
                values: [row.cogs, Math.max(0, row.grossProfit)],
              }
            }),
            series,
            ink: INK,
            format: compact,
            axisLabel: "PHP",
          })
        ),
        ...caption(
          `${
            totals.accrualRevenue > 0
              ? `Busiest month was ${MONTHS[best]}, with ${peso(bestTotals.accrualRevenue)} of revenue across ${bestTotals.count} ${plural(bestTotals.count, "project")} and ${peso(bestTotals.cogs)} of cost.`
              : `Costliest month so far was ${MONTHS[best]}, at ${peso(bestTotals.cogs)} across ${bestTotals.count} ${plural(bestTotals.count, "project")}. With no revenue recognised yet there is nothing above the cost band to draw.`
          } ${
            totals.grossProfit < 0
              ? "The year is at a loss overall, so a month with no profit band above the cost is a month whose jobs cost more than they earned."
              : `Across the year the cost band is ${percent(totals.cogs, totals.accrualRevenue) ?? 0}% of recognised revenue.`
          }`
        ),
      ],
    })
  }

  // ---- 3. where the money went -------------------------------------------

  const liquidations = report.expenses
    .filter((line) => line.source === "Liquidation" && line.status === "Approved")
    .reduce((sum, line) => sum + line.amount, 0)
  const office = report.expenses
    .filter((line) => line.source === "Office")
    .reduce((sum, line) => sum + line.amount, 0)
  const labour = report.expenses
    .filter((line) => line.source === "Labour")
    .reduce((sum, line) => sum + line.amount, 0)

  const segments = [
    { label: "Crew wages", value: labour, color: CYAN_RAMP[0] },
    { label: "Liquidated expenses", value: liquidations, color: CYAN_RAMP[2] },
    { label: "Paid by the office", value: office, color: CYAN_RAMP[4] },
  ].filter((segment) => segment.value > 0)

  if (segments.length > 0) {
    const biggest = segments.reduce((top, segment) =>
      segment.value > top.value ? segment : top
    )

    out.push({
      kind: "keep",
      blocks: [
        ...heading(next(), "What the work cost", VIZ.attendance),
        ...prose(
          `The ${peso(totals.cogs)} above, by where it came from. Crew wages are worked out from the hours each person was scheduled on a job and what payroll paid them for those hours; the other two are receipts.`
        ),
        { kind: "space", height: 8 },
        // A ring rather than a strip: three or four large parts, a third of a
        // page to put them in, and the total belongs in the middle. Where the
        // parts run to six or more, compositionBar is still the better shape —
        // see the note on it in lib/formats/chart.
        figure(donutHeight(), (box) =>
          donut({
            box,
            segments,
            ink: INK,
            format: amount,
            centre: { value: compact(totals.cogs), label: "total cost" },
          })
        ),
        ...caption(
          `${biggest.label} is the largest share at ${peso(biggest.value)}, ${percent(biggest.value, totals.cogs) ?? 0}% of the total cost. ${
            report.unallocatedWages > 0
              ? `A further ${peso(report.unallocatedWages)} of crew wages could not be charged to any job, because no schedule placed those hours against a sales order. That sits in overhead instead — a figure worth watching, since every peso of it is missing from some job's cost.`
              : "Every peso of crew time in the year was scheduled against a sales order, so none of it fell into overhead."
          }`
        ),
      ],
    })
  }

  // ---- 4. the jobs that carried the year ----------------------------------

  const byProfit = [...report.projects]
    .sort((a, b) => b.grossProfit - a.grossProfit)
    .slice(0, 8)

  if (byProfit.length > 0 && byProfit[0].grossProfit > 0) {
    const top = byProfit[0]
    const share = percent(top.grossProfit, totals.grossProfit)

    out.push({
      kind: "keep",
      blocks: [
        ...heading(next(), "The jobs that carried the year", VIZ.scheduling),
        ...prose(
          `By gross profit — recognised revenue less what the job cost. Ranked rather than listed, because on most years a handful of jobs account for most of the result and the rest are noise around them.`
        ),
        { kind: "space", height: 8 },
        ranking(
          byProfit.map((project) => ({
            label: `${project.salesOrderNo} · ${project.clientName}`,
            value: Math.max(0, project.grossProfit),
            display: peso(project.grossProfit),
          })),
          STATUS_RAMP[1],
          NAME_COLUMN
        ),
        ...caption(
          `${top.salesOrderNo} for ${top.clientName} is the largest at ${peso(top.grossProfit)}${
            share === null ? "" : `, ${share}% of the year's gross profit`
          }. ${
            report.projects.some((project) => project.grossProfit < 0)
              ? `${report.projects.filter((project) => project.grossProfit < 0).length} ${plural(report.projects.filter((p) => p.grossProfit < 0).length, "job")} finished at a loss and ${plural(report.projects.filter((p) => p.grossProfit < 0).length, "is", "are")} listed in the table below rather than the chart, which cannot draw a negative bar.`
              : "No job in the year finished at a loss."
          }`
        ),
      ],
    })
  }

  // ---- 5. clients ---------------------------------------------------------

  const byClient = new Map<string, number>()
  for (const project of report.projects) {
    byClient.set(
      project.clientName,
      (byClient.get(project.clientName) ?? 0) + project.accrualRevenue
    )
  }
  const clients = [...byClient.entries()]
    .map(([label, value]) => ({ label, value, display: peso(value) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)

  // Every bar would be zero until revenue is recognised, and a ranking of
  // nothing with a "largest" named at the top of it is worse than no section.
  if (clients.length > 0 && totals.accrualRevenue > 0) {
    const leader = clients[0]
    const leaderShare = percent(leader.value, totals.accrualRevenue)

    out.push({
      kind: "keep",
      blocks: [
        ...heading(next(), "Where the revenue came from", VIZ.claims),
        ...prose(
          "By recognised revenue rather than by job count: one large installation is worth more to the year than a dozen short service calls, and this is the view that says so."
        ),
        { kind: "space", height: 8 },
        ranking(clients, CYAN_RAMP, NAME_COLUMN),
        ...caption(
          `${leader.label} is the largest at ${peso(leader.value)}${
            leaderShare === null ? "" : `, ${leaderShare}% of the year's revenue`
          }.${
            leaderShare !== null && leaderShare > 40
              ? " That is a concentration worth being aware of — a single client account that large is also a single point of failure."
              : ""
          }`
        ),
      ],
    })
  }

  // ---- 6. status ----------------------------------------------------------

  const statusCounts = PROJECT_STATUSES.map((status) => ({
    label: PROJECT_STATUS_LABELS[status],
    value: report.projects.filter((project) => project.status === status).length,
  })).filter((row) => row.value > 0)

  if (statusCounts.length > 0) {
    const closed = report.projects.filter(
      (project) => project.status === "CLOSED"
    ).length
    const openStatuses = totals.count - closed
    const outstanding = totals.accrualRevenue - totals.cashCollection

    out.push({
      kind: "keep",
      blocks: [
        ...heading(next(), "Where the projects stand", VIZ.scheduling),
        ...prose(
          `Every project of the year by the state it is in now, in lifecycle order rather than by size, so the same colour means the same thing in every report.`
        ),
        { kind: "space", height: 8 },
        figure(donutHeight(), (box) =>
          donut({
            box,
            segments: statusCounts.map((row, index) => ({
              ...row,
              color: STATUS_RAMP[index % STATUS_RAMP.length],
            })),
            ink: INK,
            format: (value) => String(Math.round(value)),
            centre: { value: String(totals.count), label: "projects" },
          })
        ),
        ...caption(
          `${closed} of ${totals.count} ${plural(totals.count, "project")} ${plural(closed, "is", "are")} closed and ${openStatuses} ${plural(openStatuses, "is", "are")} still open. ${peso(outstanding)} of recognised revenue is still uncollected — the difference between what has been earned and what has actually been received.`
        ),
      ],
    })
  }

  // ---- clients, by how much work they bring -------------------------------

  const jobsPerClient = new Map<string, number>()
  for (const project of report.projects) {
    jobsPerClient.set(
      project.clientName,
      (jobsPerClient.get(project.clientName) ?? 0) + 1
    )
  }
  const busiest = [...jobsPerClient.entries()]
    .map(([label, value]) => ({ label, value, display: `${value} ${plural(value, "project")}` }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)

  // Only worth a section once somebody has come back. With one project each
  // it is a list of clients in arbitrary order under a heading that promises a
  // ranking, which is worse than leaving it out.
  const repeat = [...jobsPerClient.values()].filter((count) => count > 1).length

  if (busiest.length > 1 && repeat > 0) {

    out.push({
      kind: "keep",
      blocks: [
        ...heading(next(), "Who keeps the company busiest", VIZ.attendance),
        ...prose(
          "By number of projects rather than by their value — a different question from the one above, and often a different answer. This is the view that says who comes back, which is what a client relationship is actually made of."
        ),
        { kind: "space", height: 8 },
        ranking(busiest, CYAN_RAMP, NAME_COLUMN),
        ...caption(
          `${busiest[0].label} has the most at ${busiest[0].value} ${plural(busiest[0].value, "project")}. ${repeat} ${plural(repeat, "client has", "clients have")} more than one project in the period — repeat work, which costs nothing to win.`
        ),
      ],
    })
  }

  // ---- is the company actually doing well? --------------------------------

  {
    const netProfit = report.yearSummary.netProfit
    const netMargin = percent(netProfit, totals.accrualRevenue)
    const costShare = percent(totals.cogs, totals.accrualRevenue)
    const overheadShare = percent(overhead, totals.accrualRevenue)
    const uncollected = totals.accrualRevenue - totals.cashCollection

    // Three bars against one axis: what came in, and the two things that take
    // it away. Columns rather than a ring — these are separate quantities
    // being compared, not parts of one whole, and a ring would claim they were.
    const bars = [
      { label: "Revenue", value: Math.max(0, totals.accrualRevenue) },
      { label: "Cost of work", value: Math.max(0, totals.cogs) },
      { label: "Overhead", value: Math.max(0, overhead) },
    ]

    const verdict =
      totals.accrualRevenue === 0
        ? `No revenue has been recognised in ${report.periodLabel}, so there is nothing yet to judge the spending against. What the period shows is ${peso(totals.cogs + overhead)} spent — ${peso(totals.cogs)} on the jobs and ${peso(overhead)} on running the company — against work that has not been billed. The figure to watch is not the spending but the ${peso(totals.projectAmount)} of booked work waiting to be recognised.`
        : netProfit > 0
          ? `The period is profitable. After ${peso(totals.cogs)} of job cost and ${peso(overhead)} of overhead, ${peso(netProfit)} is left on ${peso(totals.accrualRevenue)} of revenue — a net margin of ${netMargin}%. Cost of work takes ${costShare}% of every peso earned and overhead takes ${overheadShare}%.`
          : `The period is at a loss. ${peso(totals.accrualRevenue)} of revenue did not cover ${peso(totals.cogs)} of job cost and ${peso(overhead)} of overhead, leaving ${peso(netProfit)}. ${
              costShare !== null && costShare > 100
                ? "The jobs themselves cost more than they earned, so the problem is in pricing or in what the work actually took — not in overhead."
                : `The jobs earned more than they cost, but not by enough to carry ${peso(overhead)} of overhead. The gap is ${peso(Math.abs(netProfit))}.`
            }`

    out.push({
      kind: "keep",
      blocks: [
        ...heading(next(), "Is the company doing well?", VIZ.payroll),
        ...prose(verdict),
        { kind: "space", height: 8 },
        figure(150, (box) =>
          columnChart({
            box,
            height: 142,
            points: bars,
            color: VIZ.claims,
            ink: INK,
            format: compact,
            axisLabel: "PHP",
          })
        ),
        ...caption(
          `Revenue is what has been recognised, not what has been collected — ${peso(uncollected)} of it is still outstanding. Overhead is struck after gross profit, so a period can show a healthy job margin and still lose money if it is carrying more office than the work supports.`
        ),
      ],
    })
  }

  // ---- the ledger ---------------------------------------------------------

  out.push(...heading(next(), "Every project, in full", VIZ.payroll))
  out.push(
    ...prose(
      `All ${totals.count} ${plural(totals.count, "project")} of ${report.periodLabel}, oldest first. The workbook export carries these same rows with the VAT columns and every expense behind the cost.`
    )
  )
  out.push({ kind: "space", height: 8 })
  out.push(
    table(
      [58, 132, 150, 74, 74, 74],
      ["S.O.", "Client", "Project", "Amount", "Cost", "Profit"],
      [
        ...report.projects.map((project) => ({
          cells: [
            project.salesOrderNo,
            project.clientName,
            project.name,
            amount(project.projectAmount),
            amount(project.cogs),
            amount(project.grossProfit),
          ],
        })),
        {
          cells: [
            "",
            `${totals.count} ${plural(totals.count, "project")}`,
            "",
            amount(totals.projectAmount),
            amount(totals.cogs),
            amount(totals.grossProfit),
          ],
          strong: true,
        },
      ],
      ["left", "left", "left", "right", "right", "right"]
    )
  )

  // ---- 8. overhead --------------------------------------------------------

  const opexMonths = [...report.opexByMonth.entries()].sort((a, b) => a[0] - b[0])
  if (opexMonths.length > 0) {
    out.push({
      kind: "keep",
      blocks: [
        ...subheading("Overhead, month by month"),
        ...prose(
          `Overhead belongs to no single job: the admin side's wages, what the office recorded directly, and any crew time that no schedule placed against a sales order. It is not in the cost figures above, and gross profit is struck before it.`
        ),
        { kind: "space", height: 8 },
        ranking(
          opexMonths.map(([month, value]) => ({
            label: MONTHS[month],
            value,
            display: peso(value),
          })),
          VIZ.payroll,
          60
        ),
        ...caption(
          `${peso(overhead)} across the year. The jobs returned a gross ${
            totals.grossProfit < 0
              ? `loss of ${peso(Math.abs(totals.grossProfit))}`
              : `profit of ${peso(totals.grossProfit)}`
          }, so ${
            totals.grossProfit > overhead
              ? `the jobs covered it with ${peso(totals.grossProfit - overhead)} to spare.`
              : `the jobs did not cover it — the year is short by ${peso(overhead - totals.grossProfit)} before anything else is counted.`
          }`
        ),
      ],
    })
  }

  return out
}

export function projectsReportPdf(report: ProjectsReport, meta: PaperMeta) {
  const head = paperHead(report)

  return renderPdf(blocks(report), {
    firstPageInset: LETTERHEAD - 48 + 16,
    pageInset: RUNNING_HEAD,
    footerInset: FOOTER,
    decorate: (page, total) => [
      ...(page === 1 ? letterhead(head) : runningHead(head)),
      ...footer(meta, page, total),
    ],
  })
}

export function projectsReportFileName(report: ProjectsReport) {
  const slug = report.periodLabel
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return `Aerocoole_Project_Report_${slug}.pdf`
}
