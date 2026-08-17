"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { hashPassword, verifyPassword } from "@/lib/password"
import { verifySession } from "@/lib/auth"
import { createSession } from "@/lib/session"
import { canEditOwnIdentity } from "@/lib/roles"

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

/**
 * Who someone *is*, as opposed to how to reach them.
 *
 * Only a Director may change this about themselves — see `canEditOwnIdentity`.
 * Parsed separately because for everyone else these fields never leave the
 * browser: the form renders them as text, so requiring them here would reject a
 * perfectly valid save of somebody's new phone number.
 */
const IdentitySchema = z.object({
  firstName: z.string().trim().min(1, "First name is required."),
  lastName: z.string().trim().min(1, "Last name is required."),
  middleName: z.string().trim().optional(),
  birthDate: z.string().trim().optional(),
  civilStatus: optionalCivilStatus,
})

// Deliberately excludes position, employment type, date hired, pay, employee
// number, role and account status. Those are HR facts an admin sets and the
// staff edit log audits — letting someone edit their own would defeat both.
const ProfileSchema = z.object({
  phoneNo: z.string().trim().optional(),
  email: optionalEmail,
  address: z.string().trim().optional(),
  emergencyContactPerson: z.string().trim().optional(),
  emergencyContactNo: z.string().trim().optional(),
  emergencyContactRelationship: z.string().trim().optional(),
  tinNo: z.string().trim().optional(),
  sssNo: z.string().trim().optional(),
  philhealthNo: z.string().trim().optional(),
  pagibigNo: z.string().trim().optional(),
})

export type ProfileState =
  | {
      errors?: {
        firstName?: string[]
        lastName?: string[]
        middleName?: string[]
        birthDate?: string[]
        civilStatus?: string[]
        phoneNo?: string[]
        email?: string[]
        address?: string[]
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
    }
  | undefined

function normalize(value: string | null | undefined) {
  return value?.trim() || null
}

function revalidateSettings(section: FormDataEntryValue | null) {
  if (section === "admin" || section === "employee") {
    revalidatePath(`/${section}/settings`)
  }
}

export async function updateProfile(
  _state: ProfileState,
  formData: FormData
): Promise<ProfileState> {
  const session = await verifySession()

  const validatedFields = ProfileSchema.safeParse({
    phoneNo: formData.get("phoneNo"),
    email: formData.get("email"),
    address: formData.get("address"),
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

  const {
    phoneNo,
    email,
    address,
    emergencyContactPerson,
    emergencyContactNo,
    emergencyContactRelationship,
    tinNo,
    sssNo,
    philhealthNo,
    pagibigNo,
  } = validatedFields.data

  const employee = await prisma.employee.findUnique({
    where: { id: session.employeeId },
  })
  if (!employee) return { message: "Your record could not be found." }

  // The gate, made on the server rather than by the form. A field the browser
  // never rendered can still be posted by hand, so whether these values are
  // read at all is decided here — anyone who may not edit their identity keeps
  // exactly what is already on their record.
  let firstName = employee.firstName
  let lastName = employee.lastName
  let middleName: string | undefined = employee.middleName ?? undefined
  let nextBirthDate = employee.birthDate
  let nextCivilStatus = employee.civilStatus

  if (canEditOwnIdentity(session.role)) {
    const identity = IdentitySchema.safeParse({
      firstName: formData.get("firstName"),
      lastName: formData.get("lastName"),
      middleName: formData.get("middleName"),
      birthDate: formData.get("birthDate"),
      civilStatus: formData.get("civilStatus"),
    })
    if (!identity.success) {
      return { errors: identity.error.flatten().fieldErrors }
    }

    firstName = identity.data.firstName
    lastName = identity.data.lastName
    middleName = identity.data.middleName
    nextBirthDate = identity.data.birthDate
      ? new Date(identity.data.birthDate)
      : null
    nextCivilStatus = identity.data.civilStatus || null
  }

  // Self-edits go into the same audit trail as admin edits, so a Director
  // reading someone's history sees one timeline rather than silent gaps.
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

  diff("firstName", employee.firstName, firstName)
  diff("lastName", employee.lastName, lastName)
  diff("middleName", employee.middleName, normalize(middleName))
  diff(
    "birthDate",
    employee.birthDate ? employee.birthDate.toISOString().slice(0, 10) : null,
    nextBirthDate ? nextBirthDate.toISOString().slice(0, 10) : null
  )
  diff("civilStatus", employee.civilStatus, nextCivilStatus)
  diff("phoneNo", employee.phoneNo, normalize(phoneNo))
  diff("email", employee.email, normalize(email))
  diff("address", employee.address, normalize(address))
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

  if (changes.length === 0) {
    return { success: true, message: "No changes to save." }
  }

  await prisma.$transaction(async (tx) => {
    await tx.employee.update({
      where: { id: session.employeeId },
      data: {
        firstName,
        lastName,
        middleName: normalize(middleName),
        birthDate: nextBirthDate,
        civilStatus: nextCivilStatus,
        phoneNo: normalize(phoneNo),
        email: normalize(email),
        address: normalize(address),
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

    await tx.staffEditLog.createMany({
      data: changes.map((change) => ({
        employeeId: session.employeeId,
        editedById: session.accountId,
        field: change.field,
        oldValue: change.oldValue,
        newValue: change.newValue,
      })),
    })
  })

  revalidateSettings(formData.get("section"))
  revalidatePath("/admin/accounts/staff")

  return {
    success: true,
    message: `Saved ${changes.length} ${
      changes.length === 1 ? "change" : "changes"
    }.`,
  }
}

// ---------------------------------------------------------------------------
// Username
// ---------------------------------------------------------------------------
//
// Half of the sign-in, and on the shared phone it is the *whole* identification
// — the kiosk asks for a username and nothing else, so changing one changes
// what the person types at the gate the next morning. Worth doing, worth doing
// deliberately.
//
// The current password is required for the same reason it is required to change
// a password: on an unlocked handset, anything else lets a passer-by lock the
// owner out of their own account.

const USERNAME_MIN = 4
const USERNAME_MAX = 60

const UsernameSchema = z.object({
  username: z
    .string()
    .trim()
    .min(USERNAME_MIN, `At least ${USERNAME_MIN} characters.`)
    .max(USERNAME_MAX, `At most ${USERNAME_MAX} characters.`)
    // Letters, digits and the punctuation the existing addresses already use.
    // No spaces: it is typed on a phone keyboard at a site gate, and a trailing
    // space is a login failure nobody can see.
    .regex(
      /^[A-Za-z0-9._@+-]+$/,
      "Use letters, numbers and . _ @ + - only, with no spaces."
    ),
  currentPassword: z.string().min(1, "Enter your current password."),
})

export type UsernameState =
  | {
      errors?: { username?: string[]; currentPassword?: string[] }
      message?: string
      success?: boolean
    }
  | undefined

export async function changeUsername(
  _state: UsernameState,
  formData: FormData
): Promise<UsernameState> {
  const session = await verifySession()

  const validated = UsernameSchema.safeParse({
    username: formData.get("username"),
    currentPassword: formData.get("currentPassword"),
  })
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors }
  }

  const { username, currentPassword } = validated.data

  const account = await prisma.userAccount.findUnique({
    where: { id: session.accountId },
  })
  if (!account) return { message: "Your account could not be found." }

  if (!verifyPassword(currentPassword, account.passwordHash)) {
    return { errors: { currentPassword: ["That's not your current password."] } }
  }

  if (username === account.username) {
    return { success: true, message: "That's already your username." }
  }

  // Checked case-insensitively even though the column is not. Sign-in and the
  // kiosk both match exactly, so "J.Cruz" and "j.cruz" would be two accounts
  // that look like one — a person typing their own name at a gate and landing
  // on somebody else's record is not a mistake worth allowing.
  const taken = await prisma.userAccount.findFirst({
    where: {
      id: { not: account.id },
      username: { equals: username, mode: "insensitive" },
    },
    select: { id: true },
  })
  if (taken) {
    return { errors: { username: ["Somebody already uses that username."] } }
  }

  await prisma.userAccount.update({
    where: { id: account.id },
    data: { username },
  })

  revalidateSettings(formData.get("section"))
  revalidatePath("/admin/accounts/staff")

  return {
    success: true,
    message: `Signed in as ${username} from now on — including on the shared phone.`,
  }
}

const PasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters."),
    confirmPassword: z.string().min(1, "Re-type your new password."),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "The two passwords don't match.",
    path: ["confirmPassword"],
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: "Choose a password different from your current one.",
    path: ["newPassword"],
  })

export type PasswordState =
  | {
      errors?: {
        currentPassword?: string[]
        newPassword?: string[]
        confirmPassword?: string[]
      }
      message?: string
      success?: boolean
    }
  | undefined

export async function changePassword(
  _state: PasswordState,
  formData: FormData
): Promise<PasswordState> {
  const session = await verifySession()

  const validatedFields = PasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  })

  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors }
  }

  const { currentPassword, newPassword } = validatedFields.data

  const account = await prisma.userAccount.findUnique({
    where: { id: session.accountId },
  })
  if (!account) return { message: "Your account could not be found." }

  // Checked against the stored hash rather than trusting the session alone —
  // it's what stops someone changing the password on an unlocked machine.
  if (!verifyPassword(currentPassword, account.passwordHash)) {
    return { errors: { currentPassword: ["That's not your current password."] } }
  }

  // Truncated to the second because a JWT's `iat` has no sub-second part —
  // storing 12:00:00.500 here would revoke a token stamped 12:00:00, including
  // the replacement one issued a moment later.
  const revokedAt = new Date(Math.floor(Date.now() / 1000) * 1000)

  await prisma.userAccount.update({
    where: { id: account.id },
    data: {
      passwordHash: hashPassword(newPassword),
      // Kills every session signed before now. Changing your password is the
      // one action that should boot whoever else is logged in as you.
      sessionsRevokedAt: revokedAt,
      // A password change is also the natural place to clear a lockout.
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  })

  // ...including this one, so re-issue it. Being signed out of the device you
  // just used is the wrong outcome — everywhere else is the point.
  await createSession(
    {
      accountId: session.accountId,
      employeeId: session.employeeId,
      role: session.role,
    },
    false
  )

  revalidateSettings(formData.get("section"))

  return {
    success: true,
    message: "Password updated. Other devices have been signed out.",
  }
}
