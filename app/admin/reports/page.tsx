import { requireManager } from "@/lib/auth"
import { buildReport } from "@/lib/reports"
import { buildPresets, dayValue, parseDay } from "@/lib/report-range"
import { ReportsView } from "@/components/reports/reports-view"

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------
//
// The one page that reads across the whole system rather than one corner of it:
// attendance, payroll, schedules, filed reports and claims for a chosen period.
//
// Everything is aggregated on the server — see lib/reports.ts — so what crosses
// the wire is a few dozen numbers rather than the punches, jobs and payslips
// they were counted from. The date presets are built here too, against server
// time, so the picker never has to consult the phone's clock.

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function AdminReportsPage({
  searchParams,
}: PageProps<"/admin/reports">) {
  await requireManager()
  const params = await searchParams

  // This month to date, which is the period somebody opening this almost always
  // wants and the only one that needs no explaining.
  const today = new Date()
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

  const from = parseDay(one(params.from), monthStart)
  const to = parseDay(one(params.to), today)

  const data = await buildReport({ from, to })

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Reports</h2>
        <p className="text-sm text-muted-foreground">
          Attendance, payroll, schedules, filed reports and claims for a period
          you choose.
        </p>
      </div>

      <ReportsView
        data={data}
        from={dayValue(from)}
        to={dayValue(to)}
        today={dayValue(today)}
        presets={buildPresets(today)}
      />
    </div>
  )
}
