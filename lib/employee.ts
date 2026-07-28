import type {
  CivilStatus,
  EmploymentType,
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

// "Jose", "Dela Cruz" → "jose.delacruz@aerocoole.ph"
export function suggestUsername(firstName: string, lastName: string) {
  const clean = (value: string) =>
    value
      .normalize("NFD")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")

  const first = clean(firstName)
  const last = clean(lastName)
  if (!first && !last) return ""
  return `${[first, last].filter(Boolean).join(".")}@aerocoole.ph`
}
