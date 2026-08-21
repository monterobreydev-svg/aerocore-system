"use client"

import { useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import {
  FolderOpen,
  LayoutList,
  Loader2,
  Plus,
  Search,
  Table2,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react"
import { MONTH_NAMES } from "@/lib/documents"
import {
  amount,
  percent,
  pesoAmount,
  summariseMonth,
  type ProjectMonth,
  type ProjectRow,
  type ProjectTotals,
} from "@/lib/projects"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SearchSelect } from "@/components/ui/search-select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PeriodPicker } from "@/components/projects/period-picker"

// The job-by-job ledger and the add/edit form: neither is needed to read the
// company sheet, which is what this page opens on, so both arrive on the tap
// that asks for them.
const ProjectsLedger = dynamic(() =>
  import("@/components/projects/projects-ledger").then((m) => m.ProjectsLedger)
)
const ProjectDialog = dynamic(() =>
  import("@/components/projects/project-dialog").then((m) => m.ProjectDialog)
)

export type ClientOption = { id: string; name: string }

type Filters = {
  clientId: string
  from: string
  to: string
  query: string
}

/** A blank selection keeps its identity between renders. */
const NO_PROJECT: ProjectRow | null = null

/** Clearing the client filter needs an option of its own — see the note below. */
const ALL_CLIENTS = { value: "", label: "All clients" }

function profitTone(value: number) {
  return value < 0
    ? "text-rose-700 dark:text-rose-400"
    : "text-emerald-700 dark:text-emerald-400"
}

/**
 * One headline figure.
 *
 * Four of these, not nine. The nine-column breakdown belongs in the tables,
 * where a figure sits under a heading and beside its neighbours; up here it
 * was a wall of numbers that had to be read to find the one that mattered.
 */
function SummaryCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "plain",
}: {
  icon: React.ElementType
  label: string
  value: string
  hint?: string
  tone?: "plain" | "profit" | "loss"
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border bg-card p-3 shadow-xs">
      <div className="min-w-0">
        <p className="text-[0.6875rem] font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        <p
          className={cn(
            "mt-1.5 truncate text-lg leading-none font-semibold tabular-nums",
            tone === "profit" && "text-emerald-700 dark:text-emerald-400",
            tone === "loss" && "text-rose-700 dark:text-rose-400"
          )}
          title={value}
        >
          {value}
        </p>
        {hint && (
          <p className="mt-1.5 truncate text-xs text-muted-foreground">
            {hint}
          </p>
        )}
      </div>
      <div
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-xl",
          tone === "profit" && "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
          tone === "loss" && "bg-rose-600/10 text-rose-700 dark:text-rose-400",
          tone === "plain" && "bg-sky-600/10 text-sky-700 dark:text-sky-400"
        )}
      >
        <Icon className="size-4" />
      </div>
    </div>
  )
}

/**
 * The company sheet: a month a row, and what the business made in it.
 *
 * Deliberately short. The ledger next door answers "what is this project
 * worth"; this answers "how did the company do in March", which is a different
 * question and gets a different table rather than more columns on the same one.
 */
function CompanySheet({
  months,
  yearTotals,
  year,
}: {
  months: ProjectMonth[]
  yearTotals: ProjectTotals
  year: number
}) {
  // Derived from totals already on screen rather than fetched again — there is
  // nothing here the ledger's own figures don't already contain.
  const rows = useMemo(
    () => months.map((month) => summariseMonth(month.month, month.totals)),
    [months]
  )
  const total = useMemo(() => summariseMonth(null, yearTotals), [yearTotals])

  return (
    <section className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-xs">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b px-3 py-2.5">
        <h3 className="text-sm font-semibold">{year} by month</h3>
        {/* Said out loud rather than left for somebody to work out from a
            column of dashes: net profit currently equals gross profit because
            there is no OPEX to take off it yet. */}
        <p className="text-xs text-muted-foreground">
          OPEX isn&apos;t recorded in the system yet — net profit is gross
          profit until it is.
        </p>
      </header>

      <div className="overflow-x-auto">
        <table
          className="w-full table-fixed border-collapse text-[0.8125rem]"
          style={{ minWidth: 780 }}
        >
          <colgroup>
            <col style={{ width: 160 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 160 }} />
            <col style={{ width: 160 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 160 }} />
            <col style={{ width: 120 }} />
          </colgroup>

          <thead>
            <tr className="border-b bg-muted/40 text-[0.6875rem] tracking-wide text-muted-foreground uppercase">
              <th scope="col" className="h-8 px-3 text-left font-semibold">
                Month
              </th>
              <th scope="col" className="h-8 px-2.5 text-right font-semibold">
                Projects
              </th>
              <th scope="col" className="h-8 px-2.5 text-right font-semibold">
                Accrual revenue
              </th>
              <th scope="col" className="h-8 px-2.5 text-right font-semibold">
                Gross profit
              </th>
              <th scope="col" className="h-8 px-2.5 text-right font-semibold">
                OPEX
              </th>
              <th scope="col" className="h-8 px-2.5 text-right font-semibold">
                Net profit
              </th>
              <th scope="col" className="h-8 px-3 text-right font-semibold">
                Net margin
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => (
              <tr key={row.month} className="border-b last:border-b-0">
                <td className="px-3 py-1.5 font-medium">
                  {MONTH_NAMES[row.month!]}
                </td>
                <td className="px-2.5 py-1.5 text-right tabular-nums">
                  {row.projects}
                </td>
                <td className="px-2.5 py-1.5 text-right tabular-nums">
                  {amount(row.accrualRevenue)}
                </td>
                <td
                  className={cn(
                    "px-2.5 py-1.5 text-right tabular-nums",
                    profitTone(row.grossProfit)
                  )}
                >
                  {amount(row.grossProfit)}
                </td>
                <td className="px-2.5 py-1.5 text-right text-muted-foreground tabular-nums">
                  {row.opex === 0 ? "—" : amount(row.opex)}
                </td>
                <td
                  className={cn(
                    "px-2.5 py-1.5 text-right font-medium tabular-nums",
                    profitTone(row.netProfit)
                  )}
                >
                  {amount(row.netProfit)}
                </td>
                <td className="px-3 py-1.5 text-right font-medium tabular-nums">
                  {percent(row.netMargin)}
                </td>
              </tr>
            ))}
          </tbody>

          <tfoot className="bg-muted">
            <tr className="font-semibold">
              <td className="px-3 py-2">{year} total</td>
              <td className="px-2.5 py-2 text-right tabular-nums">
                {total.projects}
              </td>
              <td className="px-2.5 py-2 text-right tabular-nums">
                {amount(total.accrualRevenue)}
              </td>
              <td
                className={cn(
                  "px-2.5 py-2 text-right tabular-nums",
                  profitTone(total.grossProfit)
                )}
              >
                {amount(total.grossProfit)}
              </td>
              <td className="px-2.5 py-2 text-right text-muted-foreground tabular-nums">
                {total.opex === 0 ? "—" : amount(total.opex)}
              </td>
              <td
                className={cn(
                  "px-2.5 py-2 text-right tabular-nums",
                  profitTone(total.netProfit)
                )}
              >
                {amount(total.netProfit)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {percent(total.netMargin)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}

/**
 * The project tracker.
 *
 * Filters live in the URL rather than in state: the server does the filtering,
 * so the monthly totals and the yearly summary are totals of what was asked
 * for, not of the rows that happen to be on screen. It also means a filtered
 * view can be sent to somebody or reached with the back button.
 *
 * The two sheets do not: switching between the company summary and the ledger
 * is a different reading of figures already in the browser, and sending it
 * back to the server would cost a round trip to show data that never changed.
 */
export function ProjectsView({
  year,
  years,
  months,
  yearTotals,
  clients,
  nextNumber,
  filters,
}: {
  year: number
  years: number[]
  months: ProjectMonth[]
  yearTotals: ProjectTotals
  clients: ClientOption[]
  nextNumber: string
  filters: Filters
}) {
  const router = useRouter()
  const [tab, setTab] = useState<string>("summary")
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<ProjectRow | null>(NO_PROJECT)

  // What's in the search box, which runs ahead of the URL while somebody is
  // still typing. The dates need no such state: they are applied from the
  // period popover, in one go, when the range is submitted.
  const [term, setTerm] = useState(filters.query)
  const [searching, setSearching] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Adopting a query that arrived from outside — the back button, Clear
  // filters — during render rather than in an effect, which would cost a
  // second pass and trip the lint rule against synchronous setState there.
  const [seen, setSeen] = useState(filters.query)
  if (filters.query !== seen) {
    setSeen(filters.query)
    setSearching(false)
    setTerm(filters.query)
  }

  function go(patch: Partial<Filters & { year: number }>) {
    const next = {
      year,
      clientId: filters.clientId,
      from: filters.from,
      to: filters.to,
      query: filters.query,
      ...patch,
    }

    // A date range belongs to the year it was typed against. Carrying "1 Jan
    // to 31 Mar 2026" into 2027 leaves a page that is empty for a reason
    // nothing on screen explains, so changing year drops the range.
    if (patch.year != null && patch.year !== year) {
      next.from = ""
      next.to = ""
    }

    const params = new URLSearchParams()
    if (next.year) params.set("y", String(next.year))
    if (next.clientId) params.set("c", next.clientId)
    if (next.from) params.set("from", next.from)
    if (next.to) params.set("to", next.to)
    if (next.query) params.set("q", next.query)

    router.push(`/admin/projects?${params.toString()}`)
  }

  function search(next: string) {
    setTerm(next)
    if (timer.current) clearTimeout(timer.current)
    // Long enough that a typed word is one request rather than six.
    timer.current = setTimeout(() => {
      setSearching(next.trim() !== filters.query)
      go({ query: next.trim() })
    }, 350)
  }

  const filtered = Boolean(
    filters.clientId || filters.from || filters.to || filters.query
  )

  // "All clients" is a real option rather than a placeholder: without one, a
  // picked client can be swapped but never taken off, and the only way back to
  // the whole year was to clear every other filter with it.
  const clientOptions = useMemo(
    () => [
      ALL_CLIENTS,
      ...clients.map((client) => ({ value: client.id, label: client.name })),
    ],
    [clients]
  )

  const clearFilters = () => router.push(`/admin/projects?y=${year}`)

  const empty = (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <FolderOpen className="size-5 text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-medium">
          {filtered
            ? "No projects match these filters"
            : `Nothing booked in ${year} yet`}
        </p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
          {filtered
            ? "Clear the filters to see the whole year."
            : "Add a project and it lands under the month it starts in, with its sales order number issued for you."}
        </p>
      </div>
      {filtered ? (
        <Button variant="outline" size="sm" onClick={clearFilters}>
          <X />
          Clear filters
        </Button>
      ) : (
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus />
          Add project
        </Button>
      )}
    </div>
  )

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {/* ---------------------------------------------------------------
          Filters. The period is one control — the same shape the reports page
          uses — and the client and the search box sit beside it. Three things
          on one line, each of which says what it is holding.
          --------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 rounded-xl border bg-card p-2.5 shadow-xs">
        <PeriodPicker
          year={year}
          years={years}
          from={filters.from}
          to={filters.to}
          onChange={go}
        />

        <div className="min-w-40 flex-1 sm:max-w-56 [&_[data-slot=search-select-trigger]]:h-9">
          <SearchSelect
            options={clientOptions}
            value={filters.clientId}
            onValueChange={(value) => go({ clientId: value })}
            placeholder="All clients"
            searchPlaceholder="Search clients…"
            emptyMessage="No client by that name."
          />
        </div>

        <label className="relative min-w-48 flex-1 sm:max-w-72">
          <span className="sr-only">Search projects</span>
          {searching ? (
            <Loader2 className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : (
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          )}
          <Input
            value={term}
            onChange={(event) => search(event.target.value)}
            placeholder="S.O. no., project, client, S.I. no."
            className="h-9 pl-8"
          />
        </label>

        <div className="ml-auto flex items-center gap-2">
          {filtered && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9">
              <X />
              Clear
            </Button>
          )}
          <Button onClick={() => setAdding(true)} className="h-9">
            <Plus />
            Add project
          </Button>
        </div>
      </div>

      {/* ---------------------------------------------------------------
          The four figures worth a glance. Everything else is a column.
          --------------------------------------------------------------- */}
      <div className="grid min-w-0 grid-cols-2 gap-2.5 xl:grid-cols-4">
        <SummaryCard
          icon={LayoutList}
          label="Projects"
          value={String(yearTotals.count)}
          hint={`across ${months.length} month${months.length === 1 ? "" : "s"}${
            filtered ? " · filtered" : ""
          }`}
        />
        <SummaryCard
          icon={Wallet}
          label="Project amount"
          value={pesoAmount(yearTotals.projectAmount)}
          hint="VAT inclusive, as quoted"
        />
        <SummaryCard
          icon={TrendingUp}
          label="Accrual revenue"
          value={pesoAmount(yearTotals.accrualRevenue)}
          hint="earned, whether or not collected"
        />
        <SummaryCard
          icon={TrendingUp}
          label="Gross profit"
          value={pesoAmount(yearTotals.grossProfit)}
          hint="accrual revenue less COGS"
          tone={yearTotals.grossProfit < 0 ? "loss" : "profit"}
        />
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as string)}>
        <TabsList
          variant="line"
          className="w-full min-w-0 justify-start overflow-x-auto border-b"
        >
          <TabsTrigger value="summary" className="flex-none gap-1.5 px-3">
            <Table2 className="size-4" />
            Company sheet
          </TabsTrigger>
          <TabsTrigger value="ledger" className="flex-none gap-1.5 px-3">
            <FolderOpen className="size-4" />
            Projects
            {yearTotals.count > 0 && (
              <span className="ml-1 rounded-full bg-muted px-1.5 text-xs tabular-nums">
                {yearTotals.count}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="pt-4">
          {months.length === 0 ? (
            empty
          ) : (
            <CompanySheet months={months} yearTotals={yearTotals} year={year} />
          )}
        </TabsContent>

        <TabsContent value="ledger" className="pt-4">
          {months.length === 0
            ? empty
            : // Rendered only once the tab is open, so its chunk is fetched on
              // the tap that needs it rather than with the page.
              tab === "ledger" && (
                <ProjectsLedger
                  months={months}
                  year={year}
                  yearTotals={yearTotals}
                  onOpen={setEditing}
                />
              )}
        </TabsContent>
      </Tabs>

      {/* Mounted only while open, for the same reason. */}
      {(adding || editing) && (
        <ProjectDialog
          key={editing?.id ?? "new"}
          project={editing}
          clients={clients}
          nextNumber={nextNumber}
          open
          onOpenChange={(next) => {
            if (!next) {
              setAdding(false)
              setEditing(NO_PROJECT)
            }
          }}
        />
      )}
    </div>
  )
}
