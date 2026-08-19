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


// ---------------------------------------------------------------------------
// What may be typed into a formatted field
// ---------------------------------------------------------------------------
//
// One definition each, shared by the input that filters keystrokes and the
// server action that validates the submission. Two copies of a rule like this
// drift, and the copy that matters is always the one nobody remembered to
// update — so the form and the action read the same functions.
//
// Phone numbers are Philippine numbers, so the country code is not something
// anyone should have to type, get wrong, or type twice. The field carries a
// fixed "+63" and the person fills in the rest.
//
// The lengths below are the real ones. A mobile subscriber number is 10 digits
// (9XX XXX XXXX); a landline is its area code plus a 7-or-8 digit number, which
// comes to 9 or 10 after the country code — Metro Manila 2 8XXX XXXX, Cebu
// 32 XXX XXXX. Nothing Philippine is longer than 10, which is why 20 digits
// should never have been possible to type.
export const PH_COUNTRY_CODE = "+63"
export const PH_SUBSCRIBER_MIN_DIGITS = 9
export const PH_SUBSCRIBER_MAX_DIGITS = 10

/** Just the digits, for counting them. */
export function phoneDigits(value: string) {
  return value.replace(/\D/g, "")
}

/**
 * Whatever was typed or pasted, reduced to the part that follows "+63".
 *
 * Handles the three ways a number arrives: already local ("917 123 4567"), in
 * national form with the trunk zero ("0917 123 4567"), or international
 * ("+63 917 123 4567"). The trunk zero and the country code are both dropped,
 * because "+63 0917" and "+63 63917" are the two mistakes this field exists to
 * make impossible.
 *
 * A leading "63" is only treated as the country code when the value was written
 * as international with a "+". Typed bare it is left alone — 63 is a plausible
 * start to a local number and guessing would corrupt it.
 *
 * Spaces survive, so numbers can still be grouped by hand. Digits past the
 * maximum are dropped rather than accepted and rejected later.
 */
export function toPhoneSubscriber(value: string) {
  const international = value.trimStart().startsWith("+")
  let rest = value.replace(/[^\d\s]/g, "")

  if (international) rest = rest.replace(/^(\s*)63/, "$1")
  rest = rest.replace(/^(\s*)0+/, "$1")

  // Trim from the right, counting digits only, so the spacing already typed is
  // preserved instead of being rebuilt.
  let digits = 0
  let cut = rest.length
  for (let index = 0; index < rest.length; index++) {
    if (/\d/.test(rest[index])) digits++
    if (digits > PH_SUBSCRIBER_MAX_DIGITS) {
      cut = index
      break
    }
  }
  return rest.slice(0, cut).replace(/^\s+/, "")
}

/** The subscriber part as it is stored: "+63 917 123 4567". */
export function toStoredPhone(subscriber: string) {
  const trimmed = subscriber.trim()
  return trimmed ? `${PH_COUNTRY_CODE} ${trimmed}` : ""
}

export function isValidPhone(value: string) {
  if (!value.startsWith(PH_COUNTRY_CODE)) return false
  const rest = value.slice(PH_COUNTRY_CODE.length)
  if (!/^[\d\s]*$/.test(rest)) return false
  const digits = phoneDigits(rest)
  return (
    digits.length >= PH_SUBSCRIBER_MIN_DIGITS &&
    digits.length <= PH_SUBSCRIBER_MAX_DIGITS
  )
}

/**
 * The longest of the four is 12 digits — PhilHealth and Pag-IBIG both, and a
 * TIN carrying a branch code. Nothing here is longer.
 */
export const GOV_ID_MAX_DIGITS = 12

/** Government IDs are digits with separators — never letters. */
export function sanitizeGovId(value: string) {
  const cleaned = value.replace(/[^\d\s-]/g, "").replace(/^\s+/, "")

  // Capped as it is typed, for the same reason the phone field is: a limit that
  // only fires on submit lets someone type twenty digits before finding out.
  let digits = 0
  for (let index = 0; index < cleaned.length; index++) {
    if (/\d/.test(cleaned[index])) digits++
    if (digits > GOV_ID_MAX_DIGITS) return cleaned.slice(0, index)
  }
  return cleaned
}

/**
 * Deliberately a range rather than the exact length of each ID.
 *
 * TIN, SSS, PhilHealth and Pag-IBIG each have a canonical digit count, but
 * records predating a format change would fail a strict check and there is no
 * way for whoever is typing to fix a number that is simply what the card says.
 * The character rule catches the mistake this exists for — a letter where a
 * digit belongs.
 */
export function isValidGovId(value: string) {
  if (!/^[\d\s-]*$/.test(value)) return false
  const digits = value.replace(/\D/g, "")
  return digits.length >= 6 && digits.length <= GOV_ID_MAX_DIGITS
}
