import type { WorkType, ScheduleStatus } from "@/app/generated/prisma/client"

export type ScheduleAssignmentRecord = {
  id: string
  employeeId: string
  employeeName: string
}

export type ScheduleRecord = {
  id: string
  /**
   * The job this visit was booked against. Null only on schedules created
   * before sales orders reached the model — every new one carries one.
   */
  salesOrderNo: string | null
  date: string
  startTime: string
  endTime: string
  workTypes: WorkType[]
  status: ScheduleStatus
  contactPerson: string | null
  contactNumber: string | null
  remarks: string | null
  createdAt: string
  createdByName: string | null
  client: { id: string; name: string; address: string }
  /** Null means head office — the client's own address. */
  branch: { id: string; name: string; address: string } | null
  assignments: ScheduleAssignmentRecord[]
}

export type BranchOption = { id: string; name: string; address: string }

export type ClientOption = {
  id: string
  name: string
  address: string
}

export type EmployeeOption = {
  id: string
  firstName: string
  lastName: string
  position: string
  // Drives which employees float to the top for a job's work types.
  skills: string[]
}
