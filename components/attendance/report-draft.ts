// A report as it exists in the browser, before the punch that files it.
//
// Its own module so the time-out flow's light parts can name this type without
// pulling in the form that builds one.

import type { ReportType } from "@/components/attendance/admin-attendance"

export type DraftReport = {
  /** Local only — the row's React key and what the remove button targets. */
  id: string
  type: ReportType
  clientId: string
  clientName: string
  branchId: string | null
  branchName: string | null
  serialNo: string
  /** Already in storage: the file is uploaded as it's attached, not on submit. */
  fileKey: string
  fileName: string
}

export const REPORT_TYPES: { value: ReportType; label: string; hint: string }[] =
  [
    {
      value: "PMS",
      label: "PMS",
      hint: "Scheduled preventive maintenance",
    },
    {
      value: "SERVICE",
      label: "Service",
      hint: "Repair, complaint or install",
    },
  ]

/** How a report reads in a list: "Jollibee — Ayala" or just the client. */
export function siteLabel(report: {
  clientName: string
  branchName: string | null
}) {
  return report.branchName
    ? `${report.clientName} — ${report.branchName}`
    : report.clientName
}
