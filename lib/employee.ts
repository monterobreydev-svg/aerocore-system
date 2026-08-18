import type {
  CivilStatus,
  EmploymentType,
  WorkType,
} from "@/app/generated/prisma/client"

const CIVIL_STATUS_LABELS: Record<CivilStatus, string> = {
  SINGLE: "Single",
  MARRIED: "Married",
  WIDOWED: "Widowed",
  SEPARATED: "Separated",
  DIVORCED: "Divorced",
}

export function civilStatusLabel(status: CivilStatus) {
  return CIVIL_STATUS_LABELS[status]
}

export const CIVIL_STATUS_OPTIONS = Object.keys(
  CIVIL_STATUS_LABELS
) as CivilStatus[]

const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  PROBATIONARY: "Probationary",
  REGULAR: "Regular",
  CONTRACTUAL: "Contractual",
}

export function employmentTypeLabel(type: EmploymentType) {
  return EMPLOYMENT_TYPE_LABELS[type]
}

export const EMPLOYMENT_TYPE_OPTIONS = Object.keys(
  EMPLOYMENT_TYPE_LABELS
) as EmploymentType[]

// The fixed set of employee capabilities. Employee.skills is a String[] rather
// than an enum, so these exact labels are what gets stored — display code can
// print what's saved without a lookup, and adding a capability later needs no
// migration. Deliberately kept separate from WorkType in lib/schedule.ts:
// they overlap but aren't the same list (no "Testing & Commissioning" work
// type, and that enum says "Troubleshoot" where a skill says "Troubleshooting").
export const SKILL_OPTIONS = [
  "Installation",
  "Repair",
  "Maintenance",
  "Troubleshooting",
  "Inspection",
  "Survey",
  "Cleaning",
  "Testing & Commissioning",
] as const

export type Skill = (typeof SKILL_OPTIONS)[number]

// Which capability a job's work type calls for, so the employee picker can
// float the people who can actually do it to the top.
//
// Five of the eight skills map onto a WorkType. "Testing & Commissioning"
// never had a matching job type; "Survey" and "Troubleshooting" stopped having
// one when those work types were retired in favour of BACKJOB. All three are
// kept as skills — people genuinely have them, and deleting them would erase
// that from staff records — they simply don't promote anyone any more.
//
// BACKJOB maps to Repair: a backjob is a return visit to redo work, so the
// people to float up are the ones who could have done it the first time. Point
// it at a "Backjob" skill of its own if that turns out to be too broad.
export const WORK_TYPE_SKILL: Record<WorkType, Skill> = {
  INSTALLATION: "Installation",
  REPAIR: "Repair",
  MAINTENANCE: "Maintenance",
  CLEANING: "Cleaning",
  INSPECTION: "Inspection",
  BACKJOB: "Repair",
}

// How many of the job's work types a person is actually qualified for.
export function skillMatchCount(skills: readonly string[], workTypes: WorkType[]) {
  if (workTypes.length === 0) return 0
  const owned = new Set(skills)
  return workTypes.filter((type) => owned.has(WORK_TYPE_SKILL[type])).length
}

// Standard Philippine full-time assumption: 8 hours a day over 26 paid days.
// The monthly figure is a projection shown while entering an hourly rate —
// it is never stored, so payroll stays the single source of truth.
export const HOURS_PER_DAY = 8
export const PAID_DAYS_PER_MONTH = 26

export function monthlyFromHourly(hourlyRate: number) {
  return hourlyRate * HOURS_PER_DAY * PAID_DAYS_PER_MONTH
}

export const MONTHLY_RATE_BASIS = `${HOURS_PER_DAY} hrs/day × ${PAID_DAYS_PER_MONTH} days`

// "E-0114" → "E-0115". Falls back to E-0001 when nothing is numbered yet.
export function nextEmployeeNo(current: string | null | undefined) {
  const match = current?.match(/^E-(\d+)$/)
  const next = match ? Number(match[1]) + 1 : 1
  return `E-${String(next).padStart(4, "0")}`
}

