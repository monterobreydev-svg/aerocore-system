import "server-only"
import type { Prisma } from "@/app/generated/prisma/client"
import { dayOffset, workedMinutes } from "@/lib/attendance"
import type { AttendanceRow } from "@/components/attendance/admin-attendance"

// The columns a punch needs to be shown in full: the two photographs, the two
// positions, the paperwork and the overtime. Shared by the admin day log and by
// a person's own staff record so the two can't drift into showing different
// things about the same punch.
export const ATTENDANCE_DETAIL_SELECT = {
  id: true,
  employeeId: true,
  date: true,
  timeIn: true,
  timeOut: true,
  timeInSelfieKey: true,
  timeInLatitude: true,
  timeInLongitude: true,
  timeInAccuracy: true,
  timeOutSelfieKey: true,
  timeOutLatitude: true,
  timeOutLongitude: true,
  timeOutAccuracy: true,
  autoTimedOut: true,
  reportNote: true,
  reports: {
    select: {
      id: true,
      type: true,
      serialNo: true,
      fileKey: true,
      fileName: true,
      client: { select: { name: true } },
      branch: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  },
  employee: {
    select: { firstName: true, lastName: true, employeeNo: true },
  },
  overtime: {
    select: {
      id: true,
      hours: true,
      approvedHours: true,
      reason: true,
      status: true,
      requestedAt: true,
      reviewedAt: true,
      reviewNote: true,
      reviewedBy: {
        select: { employee: { select: { firstName: true, lastName: true } } },
      },
    },
  },
} satisfies Prisma.AttendanceSelect

export type AttendanceDetailRecord = Prisma.AttendanceGetPayload<{
  select: typeof ATTENDANCE_DETAIL_SELECT
}>

/** Database row to the shape the browser is given. Dates become ISO strings. */
export function toAttendanceRow(record: AttendanceDetailRecord): AttendanceRow {
  return {
    id: record.id,
    employeeId: record.employeeId,
    employeeName: `${record.employee.firstName} ${record.employee.lastName}`,
    employeeNo: record.employee.employeeNo,
    date: record.date.toISOString(),
    timeIn: record.timeIn.toISOString(),
    timeOut: record.timeOut?.toISOString() ?? null,
    minutes: workedMinutes(record.timeIn, record.timeOut),
    spansDays: record.timeOut ? dayOffset(record.timeIn, record.timeOut) : 0,
    timeInFix: {
      latitude: record.timeInLatitude,
      longitude: record.timeInLongitude,
      accuracy: record.timeInAccuracy,
    },
    // Both halves of a position are written together, so either both are there
    // or the punch is still open.
    timeOutFix:
      record.timeOutLatitude != null && record.timeOutLongitude != null
        ? {
            latitude: record.timeOutLatitude,
            longitude: record.timeOutLongitude,
            accuracy: record.timeOutAccuracy,
          }
        : null,
    timeInSelfieKey: record.timeInSelfieKey,
    timeOutSelfieKey: record.timeOutSelfieKey,
    autoTimedOut: record.autoTimedOut,
    reports: record.reports.map((report) => ({
      id: report.id,
      type: report.type,
      clientName: report.client.name,
      branchName: report.branch?.name ?? null,
      serialNo: report.serialNo,
      fileKey: report.fileKey,
      fileName: report.fileName,
    })),
    reportNote: record.reportNote,
    overtime: record.overtime
      ? {
          id: record.overtime.id,
          hours: Number(record.overtime.hours),
          approvedHours:
            record.overtime.approvedHours == null
              ? null
              : Number(record.overtime.approvedHours),
          reason: record.overtime.reason,
          status: record.overtime.status,
          requestedAt: record.overtime.requestedAt.toISOString(),
          reviewedAt: record.overtime.reviewedAt?.toISOString() ?? null,
          reviewNote: record.overtime.reviewNote,
          reviewedByName: record.overtime.reviewedBy
            ? `${record.overtime.reviewedBy.employee.firstName} ${record.overtime.reviewedBy.employee.lastName}`
            : null,
        }
      : null,
  }
}
