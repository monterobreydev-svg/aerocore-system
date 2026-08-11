// Shapes the admin attendance screens pass around.
//
// Its own module so the light parts of the page — the table, the tab strip —
// don't drag the detail dialog's chunk in behind a type import. Same reason
// `admin-claim.ts` exists next door.

export type PunchFix = {
  latitude: number
  longitude: number
  /** Metres the device reported. Null when it never said. */
  accuracy: number | null
}

export type OvertimeSummary = {
  id: string
  /** What was asked for. */
  hours: number
  /** What the office granted, when that differs. Null means "as asked". */
  approvedHours: number | null
  reason: string
  status: "PENDING" | "APPROVED" | "REJECTED"
  requestedAt: string
  reviewedByName: string | null
  reviewedAt: string | null
  reviewNote: string | null
}

/** The hours that actually count — what was granted, falling back to what was asked. */
export function grantedHours(overtime: {
  hours: number
  approvedHours: number | null
}) {
  return overtime.approvedHours ?? overtime.hours
}

export type ReportType = "PMS" | "SERVICE"

export const REPORT_TYPE_LABEL: Record<ReportType, string> = {
  PMS: "PMS",
  SERVICE: "Service",
}

/** One filed report — one form, from one site visited during the shift. */
export type AttendanceReportRow = {
  id: string
  type: ReportType
  clientName: string
  branchName: string | null
  serialNo: string
  fileKey: string
  fileName: string
}

/** One person's day. `timeOut` null means they're still on the clock. */
export type AttendanceRow = {
  id: string
  employeeId: string
  employeeName: string
  employeeNo: string | null
  date: string
  timeIn: string
  timeOut: string | null
  /** Whole minutes on the clock, or null while the day is open. */
  minutes: number | null
  /** 1 when the time out landed after midnight, 0 for an ordinary shift. */
  spansDays: number
  timeInFix: PunchFix
  timeOutFix: PunchFix | null
  timeInSelfieKey: string
  timeOutSelfieKey: string | null
  /** Every form filed for the day, one per site visited. */
  reports: AttendanceReportRow[]
  reportNote: string | null
  overtime: OvertimeSummary | null
}

/** Someone with no punch at all on the day being looked at. */
export type MissingRow = {
  id: string
  name: string
  employeeNo: string | null
}

/** A person's totals across the timesheet period. */
export type TimesheetRow = {
  employeeId: string
  employeeName: string
  employeeNo: string | null
  /** Days with a punch, closed or not. */
  days: number
  /** Days still missing a time out — these contribute no hours. */
  openDays: number
  minutes: number
  /** Approved overtime only. Pending hours aren't owed yet. */
  overtimeHours: number
}

export type OvertimeQueueRow = {
  id: string
  employeeName: string
  employeeNo: string | null
  date: string
  hours: number
  reason: string
  requestedAt: string
  shiftEndsAt: string
  timeIn: string
  timeOut: string | null
}

export type AdminAttendanceTab = "day" | "timesheet" | "overtime"

export type AttendancePaging = {
  tab: AdminAttendanceTab
  /** The day the log tab is showing, as YYYY-MM-DD. */
  date: string
  /** Timesheet window, both YYYY-MM-DD and inclusive. */
  from: string
  to: string
  /**
   * Today according to the server — the same clock that stamps a punch. Read
   * from the browser instead it would disagree across a timezone boundary, and
   * disagree *during* hydration, which React reports as a mismatch.
   */
  today: string
}

// A day's board is bounded by the payroll roster, so it isn't paged — but it
// still gets a ceiling rather than trusting that to stay true.
export const DAY_ROW_LIMIT = 200

// The timesheet reduces to one row per person on the server; this caps the raw
// rows it reads to get there. 92 days of a 60-person roster is well inside it.
export const TIMESHEET_ROW_LIMIT = 5000

/** Longest timesheet window. A quarter covers any pay period anyone runs. */
export const MAX_TIMESHEET_DAYS = 92

/** Days per page on a person's own attendance record. */
export const STAFF_ATTENDANCE_PAGE_SIZE = 15

/**
 * How far back the totals on a staff record reach. A punch history grows
 * forever, and the summary reads every row of it to add up the hours — this is
 * the ceiling AGENTS.md asks for on anything unbounded.
 */
export const STAFF_SUMMARY_DAYS = 365

/** Totals across a person's whole recorded history, not just the page shown. */
export type StaffAttendanceSummary = {
  days: number
  openDays: number
  minutes: number
  overtimeHours: number
  /** Null when they have never punched. */
  firstDay: string | null
  lastDay: string | null
}

export type StaffAttendancePage = {
  rows: AttendanceRow[]
  total: number
  page: number
  pages: number
  summary: StaffAttendanceSummary
}
