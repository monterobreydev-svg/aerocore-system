"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { revalidateLabourCost } from "@/lib/labour-cost/query"
import { prisma } from "@/lib/db/prisma"
import { hashPassword } from "@/lib/auth/password"
import { canReachEmployee, verifySession } from "@/lib/auth"
import type { Role } from "@/app/generated/prisma/client"
import { assignableRoles, roleLabel } from "@/lib/auth/roles"
import {
  SKILL_OPTIONS,
  isValidGovId,
  isValidPhone,
  roundRate,
} from "@/lib/employee"

// Checkboxes arrive as repeated `skills` entries; nothing outside the fixed
// list is accepted, so a hand-rolled POST can't seed free-text values that
// would never match when filtering employees by capability.
const skillSet = z
  .array(z.enum(SKILL_OPTIONS), { error: "Unknown skill selected." })
  .optional()
  .transform((value) => value ?? [])

const optionalEmail = z
  .string()
  .trim()
  .optional()
  .refine((value) => !value || z.string().email().safeParse(value).success, {
    message: "Enter a valid email address.",
  })

const optionalCivilStatus = z
  .enum(["SINGLE", "MARRIED", "WIDOWED", "SEPARATED", "DIVORCED"])
  .optional()
  .or(z.literal("").transform(() => undefined))

const optionalEmploymentType = z
  .enum(["PROBATIONARY", "REGULAR", "CONTRACTUAL"])
  .optional()
  .or(z.literal("").transform(() => undefined))

// A blank money input must stay null rather than coercing to 0 — "not set"
// and "zero allowance" are different facts on a payslip.
const optionalMoney = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? Number(value) : null))
  .refine((value) => value === null || (Number.isFinite(value) && value >= 0), {
    message: "Enter a valid amount.",
  })

// The server never trusts the form's filtering — a hand-rolled POST skips it
// entirely, so the same rules from the same module are applied again here.
const optionalPhone = z
  .string()
  .trim()
  .optional()
  .refine((value) => !value || isValidPhone(value), {
    message:
      "Use digits only — spaces, dashes and a leading +63 are fine, letters are not.",
  })

const optionalGovId = z
  .string()
  .trim()
  .optional()
  .refine((value) => !value || isValidGovId(value), {
    message: "Use digits only — dashes and spaces are fine, letters are not.",
  })

const StaffSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required."),
  lastName: z.string().trim().min(1, "Last name is required."),
  middleName: z.string().trim().optional(),
  phoneNo: optionalPhone,
  email: optionalEmail,
  birthDate: z.string().trim().optional(),
  civilStatus: optionalCivilStatus,
  address: z.string().trim().optional(),
  employeeNo: z.string().trim().optional(),
  position: z.string().trim().min(1, "Position is required."),
  employmentType: optionalEmploymentType,
  dateHired: z.string().trim().optional(),
  // Kept to RATE_DECIMALS places rather than to the centavo: the rate is
  // what pay is derived from, not pay itself. See lib/employee.
  hourlyRate: z.coerce
    .number()
    .min(0, "Enter a valid hourly rate.")
    .transform(roundRate),
  skills: skillSet,
  emergencyContactPerson: z.string().trim().optional(),
  emergencyContactNo: optionalPhone,
  emergencyContactRelationship: z.string().trim().optional(),
  tinNo: optionalGovId,
  sssNo: optionalGovId,
  philhealthNo: optionalGovId,
  pagibigNo: optionalGovId,
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  role: z.enum(["DIRECTOR", "ADMINISTRATOR", "ENGINEER", "EMPLOYEE"], {
    error: "Select a role.",
  }),
})

export type StaffState =
  | {
      errors?: {
        firstName?: string[]
        lastName?: string[]
        middleName?: string[]
        phoneNo?: string[]
        email?: string[]
        birthDate?: string[]
        civilStatus?: string[]
        address?: string[]
        employeeNo?: string[]
        position?: string[]
        employmentType?: string[]
        dateHired?: string[]
        hourlyRate?: string[]
        skills?: string[]
        emergencyContactPerson?: string[]
        emergencyContactNo?: string[]
        emergencyContactRelationship?: string[]
        tinNo?: string[]
        sssNo?: string[]
        philhealthNo?: string[]
        pagibigNo?: string[]
        username?: string[]
        password?: string[]
        role?: string[]
      }
      message?: string
      success?: boolean
    }
  | undefined

export async function createStaffAccount(
  _state: StaffState,
  formData: FormData
): Promise<StaffState> {
  const session = await verifySession()

  if (session.role !== "DIRECTOR" && session.role !== "ADMINISTRATOR") {
    return { message: "You don't have permission to create staff accounts." }
  }

  const validatedFields = StaffSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    middleName: formData.get("middleName"),
    phoneNo: formData.get("phoneNo"),
    email: formData.get("email"),
    birthDate: formData.get("birthDate"),
    civilStatus: formData.get("civilStatus"),
    address: formData.get("address"),
    employeeNo: formData.get("employeeNo"),
    position: formData.get("position"),
    employmentType: formData.get("employmentType"),
    dateHired: formData.get("dateHired"),
    hourlyRate: formData.get("hourlyRate"),
    skills: formData.getAll("skills"),
    emergencyContactPerson: formData.get("emergencyContactPerson"),
    emergencyContactNo: formData.get("emergencyContactNo"),
    emergencyContactRelationship: formData.get(
      "emergencyContactRelationship"
    ),
    tinNo: formData.get("tinNo"),
    sssNo: formData.get("sssNo"),
    philhealthNo: formData.get("philhealthNo"),
    pagibigNo: formData.get("pagibigNo"),
    username: formData.get("username"),
    password: formData.get("password"),
    role: formData.get("role"),
  })

  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors }
  }

  const {
    firstName,
    lastName,
    middleName,
    phoneNo,
    email,
    birthDate,
    civilStatus,
    address,
    employeeNo,
    position,
    employmentType,
    dateHired,
    hourlyRate,
    skills,
    emergencyContactPerson,
    emergencyContactNo,
    emergencyContactRelationship,
    tinNo,
    sssNo,
    philhealthNo,
    pagibigNo,
    username,
    password,
    role,
  } = validatedFields.data

  // Server-side enforcement, independent of what the form UI offers: an
  // Administrator can only ever create plain Employee accounts. Only a
  // Director can hand out elevated roles.
  if (!assignableRoles(session.role).includes(role)) {
    return {
      errors: { role: ["You're only allowed to create Employee accounts."] },
    }
  }

  const existingAccount = await prisma.userAccount.findUnique({
    where: { username },
  })
  if (existingAccount) {
    return { errors: { username: ["That username is already taken."] } }
  }

  if (employeeNo) {
    const existingEmployeeNo = await prisma.employee.findUnique({
      where: { employeeNo },
    })
    if (existingEmployeeNo) {
      return {
        errors: { employeeNo: ["That employee ID is already in use."] },
      }
    }
  }


  await prisma.$transaction(async (tx) => {
    const employee = await tx.employee.create({
      data: {
        firstName,
        lastName,
        middleName: middleName || null,
        phoneNo: phoneNo || null,
        email: email || null,
        birthDate: birthDate ? new Date(birthDate) : null,
        civilStatus: civilStatus || null,
        address: address || null,
        employeeNo: employeeNo || null,
        position,
        employmentType: employmentType || null,
        dateHired: dateHired ? new Date(dateHired) : null,
        hourlyRate,
            skills,
        emergencyContactPerson: emergencyContactPerson || null,
        emergencyContactNo: emergencyContactNo || null,
        emergencyContactRelationship: emergencyContactRelationship || null,
        tinNo: tinNo || null,
        sssNo: sssNo || null,
        philhealthNo: philhealthNo || null,
        pagibigNo: pagibigNo || null,
        createdById: session.accountId,
      },
    })

    await tx.userAccount.create({
      data: {
        employeeId: employee.id,
        username,
        passwordHash: hashPassword(password),
        role,
      },
    })
  })

  revalidatePath("/admin/accounts/staff")
  // The hourly rate is the multiplier under every wage figure on a project.
  revalidateLabourCost()

  return { success: true }
}

const UpdateStaffSchema = z.object({
  employeeId: z.string().min(1),
  firstName: z.string().trim().min(1, "First name is required."),
  lastName: z.string().trim().min(1, "Last name is required."),
  middleName: z.string().trim().optional(),
  phoneNo: optionalPhone,
  email: optionalEmail,
  birthDate: z.string().trim().optional(),
  civilStatus: optionalCivilStatus,
  address: z.string().trim().optional(),
  employeeNo: z.string().trim().optional(),
  position: z.string().trim().min(1, "Position is required."),
  employmentType: optionalEmploymentType,
  dateHired: z.string().trim().optional(),
  // Kept to RATE_DECIMALS places rather than to the centavo: the rate is
  // what pay is derived from, not pay itself. See lib/employee.
  hourlyRate: z.coerce
    .number()
    .min(0, "Enter a valid hourly rate.")
    .transform(roundRate),
  skills: skillSet,
  emergencyContactPerson: z.string().trim().optional(),
  emergencyContactNo: optionalPhone,
  emergencyContactRelationship: z.string().trim().optional(),
  tinNo: optionalGovId,
  sssNo: optionalGovId,
  philhealthNo: optionalGovId,
  pagibigNo: optionalGovId,
})

export type UpdateStaffState =
  | {
      errors?: {
        role?: string[]
        firstName?: string[]
        lastName?: string[]
        middleName?: string[]
        phoneNo?: string[]
        email?: string[]
        birthDate?: string[]
        civilStatus?: string[]
        address?: string[]
        employeeNo?: string[]
        position?: string[]
        employmentType?: string[]
        dateHired?: string[]
        hourlyRate?: string[]
        skills?: string[]
        emergencyContactPerson?: string[]
        emergencyContactNo?: string[]
        emergencyContactRelationship?: string[]
        tinNo?: string[]
        sssNo?: string[]
        philhealthNo?: string[]
        pagibigNo?: string[]
      }
      message?: string
      success?: boolean
      /**
       * Future jobs this save took them off, when it switched them off.
       *
       * Reported so the form can say it happened. Somebody deactivating a
       * resigned crew member has no reason to expect the calendar to change
       * underneath them, and four jobs quietly losing a body is the kind of
       * thing that is discovered by a client ringing on the day.
       */
      droppedJobs?: number
    }
  | undefined

function normalize(value: string | null | undefined) {
  return value?.trim() || null
}

export async function updateStaffAccount(
  _state: UpdateStaffState,
  formData: FormData
): Promise<UpdateStaffState> {
  const session = await verifySession()

  if (session.role !== "DIRECTOR" && session.role !== "ADMINISTRATOR") {
    return { message: "You don't have permission to edit staff accounts." }
  }

  const validatedFields = UpdateStaffSchema.safeParse({
    employeeId: formData.get("employeeId"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    middleName: formData.get("middleName"),
    phoneNo: formData.get("phoneNo"),
    email: formData.get("email"),
    birthDate: formData.get("birthDate"),
    civilStatus: formData.get("civilStatus"),
    address: formData.get("address"),
    employeeNo: formData.get("employeeNo"),
    position: formData.get("position"),
    employmentType: formData.get("employmentType"),
    dateHired: formData.get("dateHired"),
    hourlyRate: formData.get("hourlyRate"),
    skills: formData.getAll("skills"),
    emergencyContactPerson: formData.get("emergencyContactPerson"),
    emergencyContactNo: formData.get("emergencyContactNo"),
    emergencyContactRelationship: formData.get(
      "emergencyContactRelationship"
    ),
    tinNo: formData.get("tinNo"),
    sssNo: formData.get("sssNo"),
    philhealthNo: formData.get("philhealthNo"),
    pagibigNo: formData.get("pagibigNo"),
  })

  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors }
  }

  // Nor anyone above them. The staff list already withholds Directors, but this
  // action takes an employeeId straight off the form and would otherwise act on
  // whatever id it was handed.
  if (!(await canReachEmployee(session.role, validatedFields.data.employeeId))) {
    return { message: "You don't have permission to edit that account." }
  }

  // An Administrator can't edit their own record (e.g. to quietly bump their
  // own hourly rate) — only a Director can make changes to it. Enforced here
  // too, not just by hiding the form, since this is called directly.
  if (
    session.role === "ADMINISTRATOR" &&
    validatedFields.data.employeeId === session.employeeId
  ) {
    return { message: "You can't edit your own account." }
  }

  // ---- access level ------------------------------------------------------
  //
  // Read separately from everything else, and only for a Director. An
  // Administrator may edit staff records all day but must not be able to
  // promote themselves or anyone else — the whole point of the role is that
  // somebody above them set it.
  //
  // Nobody changes their own, including a Director. That single rule is what
  // guarantees the company can never be left without one: the person making
  // the change is a Director by definition, so demoting anybody else still
  // leaves them standing.
  const requestedRole = formData.get("role")
  let nextRole: Role | null = null

  if (requestedRole != null && requestedRole !== "") {
    if (session.role !== "DIRECTOR") {
      return { message: "Only a Director can change an access level." }
    }

    const parsed = z
      .enum(["DIRECTOR", "ADMINISTRATOR", "ENGINEER", "EMPLOYEE"])
      .safeParse(requestedRole)
    if (!parsed.success) {
      return { errors: { role: ["That isn't a role."] } }
    }

    if (validatedFields.data.employeeId === session.employeeId) {
      return {
        message:
          "You can't change your own access level — ask another Director.",
      }
    }

    nextRole = parsed.data
  }


  const {
    employeeId,
    firstName,
    lastName,
    middleName,
    phoneNo,
    email,
    birthDate,
    civilStatus,
    address,
    employeeNo,
    position,
    employmentType,
    dateHired,
    hourlyRate,
    skills,
    emergencyContactPerson,
    emergencyContactNo,
    emergencyContactRelationship,
    tinNo,
    sssNo,
    philhealthNo,
    pagibigNo,
  } = validatedFields.data

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: { account: true },
  })

  if (!employee || !employee.account) {
    return { message: "Staff account not found." }
  }

  // Whether somebody still works here is the same class of decision as what
  // they can reach, so it is gated the same way and for the same reason: it
  // ends a person's access to the whole system, and an Administrator editing
  // a colleague's phone number has no business ending it.
  //
  // Absent means "leave it as it is" — a form that never rendered the control
  // posts nothing, and that must read as no change rather than as a default.
  const requestedActive = formData.get("isActive")
  let nextIsActive = employee.account.isActive

  if (requestedActive != null && requestedActive !== "") {
    if (session.role !== "DIRECTOR") {
      return { message: "Only a Director can activate or deactivate an account." }
    }

    const parsed = z.enum(["true", "false"]).safeParse(requestedActive)
    if (!parsed.success) {
      return { message: "That isn't a status." }
    }

    // The same exclusion the access level carries, and for a sharper reason.
    // Switching yourself off signs you out on the next request and locks you
    // out of the login that would undo it — and if you were the last Director,
    // nobody left can turn anybody back on. Somebody leaving is recorded by
    // whoever remains.
    if (
      parsed.data === "false" &&
      validatedFields.data.employeeId === session.employeeId
    ) {
      return {
        message:
          "You can't deactivate your own account — ask another Director.",
      }
    }

    nextIsActive = parsed.data === "true"
  }

  if (employeeNo && employeeNo !== employee.employeeNo) {
    const clash = await prisma.employee.findUnique({ where: { employeeNo } })
    if (clash) {
      return {
        errors: { employeeNo: ["That employee ID is already in use."] },
      }
    }
  }

  const changes: { field: string; oldValue: string; newValue: string }[] = []

  function diff(field: string, oldValue: string | null, newValue: string | null) {
    if ((oldValue ?? "") !== (newValue ?? "")) {
      changes.push({
        field,
        oldValue: oldValue ?? "",
        newValue: newValue ?? "",
      })
    }
  }

  const nextBirthDate = birthDate ? new Date(birthDate) : null
  const nextDateHired = dateHired ? new Date(dateHired) : null
  const nextCivilStatus = civilStatus || null
  const nextEmploymentType = employmentType || null

  diff("firstName", employee.firstName, firstName)
  diff("lastName", employee.lastName, lastName)
  diff("middleName", employee.middleName, normalize(middleName))
  diff("phoneNo", employee.phoneNo, normalize(phoneNo))
  diff("email", employee.email, normalize(email))
  diff(
    "birthDate",
    employee.birthDate ? employee.birthDate.toISOString().slice(0, 10) : null,
    nextBirthDate ? nextBirthDate.toISOString().slice(0, 10) : null
  )
  diff("civilStatus", employee.civilStatus, nextCivilStatus)
  diff("address", employee.address, normalize(address))
  diff("employeeNo", employee.employeeNo, normalize(employeeNo))
  diff("position", employee.position, position)
  diff("employmentType", employee.employmentType, nextEmploymentType)
  diff(
    "dateHired",
    employee.dateHired ? employee.dateHired.toISOString().slice(0, 10) : null,
    nextDateHired ? nextDateHired.toISOString().slice(0, 10) : null
  )
  diff("hourlyRate", String(employee.hourlyRate), String(hourlyRate))
  diff("skills", employee.skills.join(", "), skills.join(", "))
  diff(
    "emergencyContactPerson",
    employee.emergencyContactPerson,
    normalize(emergencyContactPerson)
  )
  diff(
    "emergencyContactNo",
    employee.emergencyContactNo,
    normalize(emergencyContactNo)
  )
  diff(
    "emergencyContactRelationship",
    employee.emergencyContactRelationship,
    normalize(emergencyContactRelationship)
  )
  diff("tinNo", employee.tinNo, normalize(tinNo))
  diff("sssNo", employee.sssNo, normalize(sssNo))
  diff("philhealthNo", employee.philhealthNo, normalize(philhealthNo))
  diff("pagibigNo", employee.pagibigNo, normalize(pagibigNo))
  // True only on the switch off, not on every save of an already-off account:
  // re-saving a resigned employee's phone number must not go hunting through
  // the calendar again.
  const deactivating = employee.account.isActive && !nextIsActive
  // How many future jobs lost them, so the form can say what it just did.
  let droppedJobs: { count: number } | undefined

  if (employee.account.isActive !== nextIsActive) {
    changes.push({
      field: "isActive",
      oldValue: String(employee.account.isActive),
      newValue: String(nextIsActive),
    })
  }

  // Who can reach what is the single most consequential thing on this form, so
  // it lands in the same edit log as everything else — with both roles named,
  // not as ids nobody reads back.
  const roleChanged = nextRole !== null && nextRole !== employee.account.role
  if (roleChanged) {
    changes.push({
      field: "role",
      oldValue: roleLabel(employee.account.role),
      newValue: roleLabel(nextRole!),
    })
  }

  if (changes.length > 0) {
    await prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id: employeeId },
        data: {
          firstName,
          lastName,
          middleName: normalize(middleName),
          phoneNo: normalize(phoneNo),
          email: normalize(email),
          birthDate: nextBirthDate,
          civilStatus: nextCivilStatus,
          address: normalize(address),
          employeeNo: normalize(employeeNo),
          position,
          employmentType: nextEmploymentType,
          dateHired: nextDateHired,
          hourlyRate,
                skills,
          emergencyContactPerson: normalize(emergencyContactPerson),
          emergencyContactNo: normalize(emergencyContactNo),
          emergencyContactRelationship: normalize(
            emergencyContactRelationship
          ),
          tinNo: normalize(tinNo),
          sssNo: normalize(sssNo),
          philhealthNo: normalize(philhealthNo),
          pagibigNo: normalize(pagibigNo),
        },
      })

      await tx.userAccount.update({
        where: { id: employee.account!.id },
        data: {
          isActive: nextIsActive,
          ...(roleChanged ? { role: nextRole! } : {}),
          // A role change signs them out everywhere.
          //
          // Every page gate reads the role from the database, so a demotion
          // takes hold on the next request either way. A *promotion* would
          // not: proxy.ts can only see the JWT, and a token still claiming
          // EMPLOYEE gets bounced off /admin however senior the account has
          // just become. Forcing a fresh sign-in is what makes both directions
          // work the moment they are saved.
          //
          // Truncated to the second for the same reason changePassword does
          // it — a JWT's `iat` has no sub-second part.
          ...(roleChanged
            ? { sessionsRevokedAt: new Date(Math.floor(Date.now() / 1000) * 1000) }
            : {}),
        },
      })

      await tx.staffEditLog.createMany({
        data: changes.map((change) => ({
          employeeId,
          editedById: session.accountId,
          field: change.field,
          oldValue: change.oldValue,
          newValue: change.newValue,
        })),
      })

      // Switching somebody off is the office saying they have left, and
      // somebody who has left is not turning up to a job next Tuesday. Every
      // roster already refuses to offer them — the payroll run, the attendance
      // sheet, the crew picker — but a job they were put on *before* today
      // kept their name on the calendar, and the crew going to that site would
      // have been one short with nothing on screen saying so.
      //
      // Only work that has not happened yet. Past assignments are evidence:
      // they are what attendance was recorded against, and they are the
      // weights that split a day's wage across the projects it was worked on
      // (see lib/labour-cost). Deleting those would silently rewrite what
      // finished jobs cost — a resignation today changing last quarter's
      // margins. So the cut is today's date, and history is left alone.
      //
      // The job itself stays. A visit with nobody on it is a real state the
      // schedules page already counts and shows, and it is exactly the
      // prompt the office needs: this one needs redeploying.
      if (deactivating) {
        const today = new Date()
        today.setHours(0, 0, 0, 0)

        droppedJobs = await tx.scheduleAssignment.deleteMany({
          where: {
            employeeId,
            schedule: {
              date: { gte: today },
              // A cancelled job is not work anybody was going to do, so
              // removing them from it says nothing and would only make the
              // count below overstate what actually changed.
              status: { notIn: ["CANCELLED", "RESCHEDULED"] },
            },
          },
        })
      }
    })
  }

  revalidatePath("/admin/accounts/staff")
  if (deactivating) {
    revalidatePath("/admin/schedules")
    revalidatePath("/employee/schedule")
  }
  // The hourly rate is the multiplier under every wage figure on a project.
  revalidateLabourCost()

  return { success: true, droppedJobs: droppedJobs?.count ?? 0 }
}
