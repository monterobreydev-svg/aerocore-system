import "server-only"

import { renderPdf, monoColumns, type PdfBlock } from "@/lib/pdf"
import type { ReportData, Slice } from "@/lib/reports"

// ---------------------------------------------------------------------------
// The report, written out
// ---------------------------------------------------------------------------
//
// A downloaded report is read away from the screen — in a meeting, on a phone,
// by somebody who was not the one holding the filters. So every table is
// preceded by a sentence saying what it shows and what it says, composed from
// the same numbers rather than written once and left to rot.
//
// The sentences are deliberately plain and deliberately hedged where the data
// is thin: "too little data to call a trend" is more useful than a confident
// direction inferred from three days.

const BODY = 9
const COLUMNS = monoColumns(BODY)

function amount(value: number) {
  return value.toLocaleString("en-PH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

function leader(label: string, value: string, width = COLUMNS) {
  const room = Math.max(1, width - label.length - value.length - 2)
  return `${label} ${".".repeat(room)} ${value}`
}

function heading(text: string): PdfBlock[] {
  return [
    { kind: "space", height: 10 },
    { kind: "text", text, font: "sans-bold", size: 10.5 },
    { kind: "rule", light: true },
  ]
}

/** A paragraph of explanation, wrapped to the page. */
function prose(text: string): PdfBlock[] {
  const width = 96
  const words = text.split(" ")
  const lines: string[] = []
  let line = ""

  for (const word of words) {
    if ((line + " " + word).trim().length > width) {
      lines.push(line.trim())
      line = word
    } else {
      line = `${line} ${word}`
    }
  }
  if (line.trim()) lines.push(line.trim())

  return lines.map((text) => ({
    kind: "text" as const,
    text,
    font: "sans" as const,
    size: 9,
  }))
}

function sliceTable(
  rows: Slice[],
  noun: string,
  plural = `${noun}s`
): PdfBlock[] {
  const total = rows.reduce((sum, row) => sum + row.value, 0) || 1
  // The noun agrees with the number. "1 claims" in a document somebody takes
  // into a meeting reads as carelessness about everything else on the page.
  const width = Math.max(noun.length, plural.length)

  return rows.map((row) => ({
    kind: "text" as const,
    font: "mono" as const,
    size: BODY,
    text: leader(
      row.label,
      `${String(row.value).padStart(4)} ${(row.value === 1 ? noun : plural).padEnd(width)}  ${String(
        Math.round((row.value / total) * 100)
      ).padStart(3)}%`
    ),
  }))
}

/**
 * A label and a peso figure, right-aligned on the leader.
 *
 * Money gets its own table rather than going through sliceTable, which shares
 * out a percentage — a share of the total is a fair thing to say about a count
 * of claims and a misleading one about their value, where one large receipt can
 * carry most of the money.
 */
function moneyTable(rows: [string, number][]): PdfBlock[] {
  return rows.map(([label, value]) => ({
    kind: "text" as const,
    font: "mono" as const,
    size: BODY,
    text: leader(label, `PHP ${amount(value).padStart(12)}`),
  }))
}

/** "the busiest was Tuesday 12 August, at 34 hours" — the sentence-worthy fact. */
function peakDay(data: ReportData) {
  const worked = data.hoursByDay.filter((day) => day.hours > 0)
  if (worked.length === 0) return null
  return worked.reduce((best, day) => (day.hours > best.hours ? day : best))
}

function trendSentence(data: ReportData) {
  const worked = data.hoursByDay.filter((day) => day.hours > 0)
  if (worked.length < 6) {
    return "There are too few working days in this period to read a trend from; the daily figures are listed below as recorded."
  }

  const half = Math.floor(worked.length / 2)
  const first = worked.slice(0, half).reduce((s, d) => s + d.hours, 0) / half
  const second =
    worked.slice(half).reduce((s, d) => s + d.hours, 0) / (worked.length - half)
  const change = first === 0 ? 0 : Math.round(((second - first) / first) * 100)

  if (Math.abs(change) < 8) {
    return `Hours held roughly level across the period — the second half averaged ${Math.round(second)} hours a working day against ${Math.round(first)} in the first, a difference too small to read as a direction.`
  }
  return `Hours ${change > 0 ? "rose" : "fell"} across the period: the second half averaged ${Math.round(second)} hours a working day against ${Math.round(first)} in the first, ${change > 0 ? "up" : "down"} ${Math.abs(change)}%.`
}

export function reportBlocks(data: ReportData): PdfBlock[] {
  const { headline, flags } = data
  const blocks: PdfBlock[] = [
    { kind: "text", text: "AeroCoole", font: "sans-bold", size: 17 },
    { kind: "text", text: "Operations report", font: "sans", size: 11 },
    { kind: "space", height: 6 },
    { kind: "rule" },
    { kind: "space", height: 4 },
    { kind: "text", text: data.range.label, font: "sans-bold", size: 12 },
    {
      kind: "text",
      text: `${data.range.days} days · ${headline.staff} staff on the payroll`,
      size: 9.5,
    },
  ]

  // ---- the summary, in sentences ------------------------------------------

  blocks.push(...heading("In summary"))
  blocks.push(
    ...prose(
      `Across ${data.range.label}, staff worked ${headline.daysWorked} recorded days totalling ${headline.hoursWorked.toLocaleString()} hours on the clock, of which ${headline.overtimeHours} hours were approved overtime. Payroll for the period came to PHP ${amount(headline.grossPay)} gross and PHP ${amount(headline.netPay)} net of contributions and adjustments. ${headline.jobs} jobs were scheduled, ${headline.jobsCompleted} of them completed, and the crew filed ${headline.reportsFiled} reports from the field. ${headline.claims} expense claims were submitted, worth PHP ${amount(headline.claimsAmount)}.`
    )
  )

  // The same comparison the page puts under the headline figures, so the two
  // never tell different stories. Payroll is left out for the reason given in
  // lib/reports.ts: two windows of equal length rarely hold the same number of
  // cutoffs, so the percentage would describe the calendar, not the company.
  if (data.compare) {
    const before = data.compare
    const versus = (label: string, now: number, then: number) => {
      if (then === 0 && now === 0) return null
      if (then === 0) return `${label} rose from none`
      const change = Math.round(((now - then) / then) * 100)
      if (change === 0) return `${label} held level`
      return `${label} ${change > 0 ? "rose" : "fell"} ${Math.abs(change)}%`
    }

    const parts = [
      versus("hours on the clock", headline.hoursWorked, before.hoursWorked),
      versus("jobs scheduled", headline.jobs, before.jobs),
      versus("reports filed", headline.reportsFiled, before.reportsFiled),
    ].filter(Boolean) as string[]

    if (parts.length > 0) {
      const list =
        parts.length === 1
          ? parts[0]
          : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`
      blocks.push({ kind: "space", height: 6 })
      blocks.push(
        ...prose(
          `Against ${before.label}, the window of the same length immediately before this one, ${list}.`
        )
      )
    }
  }

  // "1 job(s) were cancelled" is the sort of sentence that makes a reader
  // distrust the numbers beside it, so the noun and the verb both agree.
  const count = (n: number, one: string, many: string, verb = true) =>
    `${n} ${n === 1 ? one : many} ${verb ? (n === 1 ? "was" : "were") : ""}`.trim()

  const attention: string[] = []
  if (flags.openPunches > 0)
    attention.push(`${count(flags.openPunches, "punch", "punches")} never closed`)
  if (flags.autoClosed > 0)
    attention.push(
      `${count(flags.autoClosed, "punch", "punches")} closed automatically at the end of the shift`
    )
  if (flags.unapprovedOvertime > 0)
    attention.push(
      `${flags.unapprovedOvertime} overtime ${flags.unapprovedOvertime === 1 ? "request is" : "requests are"} still awaiting a decision`
    )
  if (flags.pendingClaims > 0)
    attention.push(
      `${flags.pendingClaims} ${flags.pendingClaims === 1 ? "claim is" : "claims are"} awaiting review`
    )
  if (flags.cancelledJobs > 0)
    attention.push(`${count(flags.cancelledJobs, "job", "jobs")} cancelled`)

  if (attention.length > 0) {
    blocks.push({ kind: "space", height: 6 })
    // The note about missing evidence belongs only to the case it describes —
    // printing it whenever *anything* needs attention was telling readers a
    // photograph was missing on periods where nothing had been auto-closed.
    const caveat =
      flags.autoClosed > 0
        ? " An automatically closed punch carries no time-out photograph or position, so the office may want to confirm those hours."
        : ""
    blocks.push(...prose(`Worth attention: ${attention.join("; ")}.${caveat}`))
  }

  // ---- attendance ---------------------------------------------------------

  blocks.push(...heading("Hours on the clock"))
  blocks.push(
    ...prose(
      `This chart plots the hours recorded against each day of the period. Only closed punches count — a punch still open contributes nothing until the office closes it. ${trendSentence(data)}`
    )
  )

  const peak = peakDay(data)
  if (peak) {
    blocks.push({ kind: "space", height: 4 })
    blocks.push(
      ...prose(
        `The busiest day was ${new Date(peak.date).toLocaleDateString("en-PH", { weekday: "long", day: "numeric", month: "long" })}, at ${peak.hours} hours across ${peak.punches} ${peak.punches === 1 ? "punch" : "punches"}.`
      )
    )
  }

  blocks.push({ kind: "space", height: 6 })
  blocks.push({
    kind: "text",
    font: "mono-bold",
    size: BODY,
    text: leader("Day", "Hours  Punches"),
  })
  for (const day of data.hoursByDay.filter((d) => d.punches > 0)) {
    blocks.push({
      kind: "text",
      font: "mono",
      size: BODY,
      text: leader(day.date, `${String(day.hours).padStart(5)}  ${String(day.punches).padStart(7)}`),
    })
  }

  // ---- payroll ------------------------------------------------------------

  blocks.push(...heading("What payroll was made of"))
  const payrollTotal = data.payrollByCutoff.reduce(
    (sum, c) => sum + c.basic + c.overtime + c.night + c.holiday,
    0
  )
  const basicTotal = data.payrollByCutoff.reduce((s, c) => s + c.basic, 0)
  const share = payrollTotal > 0 ? Math.round((basicTotal / payrollTotal) * 100) : 0

  blocks.push(
    ...prose(
      `The stacked bars split each payroll cutoff into what earned it: basic pay for ordinary hours, approved overtime, night hours between 22:00 and 06:00 (paid at the hourly rate plus a further 10%), and holiday pay. Basic pay accounted for ${share}% of the total, with the remaining ${100 - share}% coming from premiums. A cutoff running noticeably above the others usually means either overtime or a holiday fell inside it — the columns below say which.`
    )
  )

  blocks.push({ kind: "space", height: 6 })
  blocks.push({
    kind: "text",
    font: "mono-bold",
    size: BODY,
    text: leader("Cutoff", "Basic   Overtime  Night  Holiday"),
  })
  for (const cutoff of data.payrollByCutoff) {
    blocks.push({
      kind: "text",
      font: "mono",
      size: BODY,
      text: leader(
        cutoff.label,
        `${amount(cutoff.basic).padStart(9)} ${amount(cutoff.overtime).padStart(9)} ${amount(cutoff.night).padStart(6)} ${amount(cutoff.holiday).padStart(8)}`
      ),
    })
  }

  // ---- schedules ----------------------------------------------------------

  blocks.push(...heading("Scheduled work"))
  const completed =
    headline.jobs > 0
      ? Math.round((headline.jobsCompleted / headline.jobs) * 100)
      : 0
  blocks.push(
    ...prose(
      `Of ${headline.jobs} jobs scheduled in the period, ${headline.jobsCompleted} were completed — ${completed}%. The remainder are either still pending, marked for a return visit, rescheduled, or cancelled; the breakdown follows. A high "Need to Return" count is worth reading alongside the backjob figure in the work types below, since the two usually move together.`
    )
  )
  blocks.push({ kind: "space", height: 4 })
  blocks.push(...sliceTable(data.scheduleStatus, "job"))

  if (data.workTypes.length > 0) {
    blocks.push({ kind: "space", height: 8 })
    blocks.push(
      ...prose(
        `The work carried out, by kind. A single job can carry more than one work type, so these figures total higher than the job count above — read them as "how often each kind of work was involved", not as a share of jobs.`
      )
    )
    blocks.push({ kind: "space", height: 4 })
    blocks.push(...sliceTable(data.workTypes, "job"))
  }

  if (data.topClients.length > 0) {
    blocks.push({ kind: "space", height: 8 })
    blocks.push(
      ...prose(
        `The busiest clients of the period, by jobs scheduled. This is a count of visits rather than of revenue — a client with many short calls will rank above one with a single long installation.`
      )
    )
    blocks.push({ kind: "space", height: 4 })
    blocks.push(...sliceTable(data.topClients, "job"))
  }

  // ---- filed reports ------------------------------------------------------

  blocks.push(...heading("Reports filed from the field"))
  blocks.push(
    ...prose(
      `Every PMS and service report the crew filed with a time-out in this period. Each one is stored against the client, branch and month it belongs to and can be found or downloaded from the Documents tab. ${headline.reportsFiled === 0 ? "None were filed in this period." : `${headline.reportsFiled} were filed in total.`}`
    )
  )
  if (data.reportTypes.length > 0) {
    blocks.push({ kind: "space", height: 4 })
    blocks.push(...sliceTable(data.reportTypes, "filed", "filed"))
  }

  // ---- claims -------------------------------------------------------------

  const claims = data.claims

  blocks.push(...heading("Expense claims"))

  if (claims.count === 0) {
    blocks.push(...prose("No liquidations were submitted in this period."))
  } else {
    const awaiting = claims.byStatus.find((s) => s.key === "PENDING_REVIEW")
    const approved = claims.byStatus.find((s) => s.key === "APPROVED")
    const rejected = claims.byStatus.find((s) => s.key === "REJECTED")

    blocks.push(
      ...prose(
        `${claims.count} ${claims.count === 1 ? "liquidation was" : "liquidations were"} submitted in the period, worth PHP ${amount(claims.total)} in total, of which PHP ${amount(approved?.amount ?? 0)} has been approved and PHP ${amount(rejected?.amount ?? 0)} refused. PHP ${amount(awaiting?.amount ?? 0)} is still awaiting review — money the company has not yet decided on, so a figure that grows from one period to the next is worth chasing. ${
          claims.turnaroundDays === null
            ? "Nothing filed in this period has been decided yet, so there is no turnaround to report."
            : `Claims that have been decided took ${claims.turnaroundDays} ${claims.turnaroundDays === 1 ? "day" : "days"} on average from filing to decision.`
        } ${
          claims.lateCount === 0
            ? "Every claim was filed inside the window."
            : `${claims.lateCount} of them ${claims.lateCount === 1 ? "was" : "were"} filed late, which is recorded against the claim at submission and does not change afterwards.`
        } The largest single claim was PHP ${amount(claims.largest)}.`
      )
    )

    blocks.push({ kind: "space", height: 6 })
    blocks.push(...moneyTable(claims.byStatus.map((s) => [s.label, s.amount])))

    if (claims.topClaimants.length > 0) {
      blocks.push({ kind: "space", height: 8 })
      blocks.push(
        ...prose(
          "Filed by, over the period — the value of what each person submitted, whatever was decided about it:"
        )
      )
      blocks.push({ kind: "space", height: 4 })
      blocks.push(
        ...moneyTable(claims.topClaimants.map((s) => [s.label, s.value]))
      )
    }

    if (claims.byClient.length > 0) {
      blocks.push({ kind: "space", height: 8 })
      blocks.push(
        ...prose(
          "Charged to clients. One receipt can cover more than one job, so these are the per-client shares recorded against each line rather than whole claims counted twice — they will not always add up to the total above, because a line tied to no client is charged to nobody:"
        )
      )
      blocks.push({ kind: "space", height: 4 })
      blocks.push(...moneyTable(claims.byClient.map((s) => [s.label, s.value])))
    }
  }

  // ---- footer -------------------------------------------------------------

  blocks.push({ kind: "space", height: 12 }, { kind: "rule" })
  blocks.push(
    ...prose(
      `Figures are computed from recorded attendance at the moment this report was generated. Payroll is not a snapshot — a punch corrected after this date will change the figures on a report generated again for the same period. Paid hours are whole hours capped at 8 a day; overtime pays only what was approved and actually worked.`
    )
  )

  return blocks
}

export function reportPdf(data: ReportData) {
  return renderPdf(reportBlocks(data))
}

export function reportFileName(data: ReportData) {
  const segment = (value: string) =>
    value
      .normalize("NFKD")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
  return `AeroCoole_Report_${segment(data.range.label)}.pdf`
}
