import type { WorkType, ScheduleStatus } from "@/app/generated/prisma/client"

export type ScheduleAssignmentRecord = {
  id: string
  employeeId: string
  employeeName: string
}

export type ScheduleRecord = {
  id: string
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
  branch: { id: string; name: string; address: string } | null
  assignments: ScheduleAssignmentRecord[]
}

export type BranchOption = { id: string; name: string; address: string }

export type ClientOption = {
  id: string
  name: string
  address: string
  branches: BranchOption[]
}

export type EmployeeOption = {
  id: string
  firstName: string
  lastName: string
  position: string
  // Drives which employees float to the top for a job's work types.
  skills: string[]
}
