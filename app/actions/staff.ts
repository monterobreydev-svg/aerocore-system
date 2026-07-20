"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { hashPassword } from "@/lib/password"
import { verifySession } from "@/lib/session"
import { assignableRoles } from "@/lib/roles"

const StaffSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required."),
  lastName: z.string().trim().min(1, "Last name is required."),
  middleName: z.string().trim().optional(),
  position: z.string().trim().min(1, "Position is required."),
  hourlyRate: z.coerce.number().min(0, "Enter a valid hourly rate."),
  skills: z.string().trim().optional(),
  emergencyContactPerson: z.string().trim().optional(),
  emergencyContactNo: z.string().trim().optional(),
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
        position?: string[]
        hourlyRate?: string[]
        skills?: string[]
        emergencyContactPerson?: string[]
        emergencyContactNo?: string[]
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
    position: formData.get("position"),
    hourlyRate: formData.get("hourlyRate"),
    skills: formData.get("skills"),
    emergencyContactPerson: formData.get("emergencyContactPerson"),
    emergencyContactNo: formData.get("emergencyContactNo"),
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
    position,
    hourlyRate,
    skills,
    emergencyContactPerson,
    emergencyContactNo,
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

  const skillsArray = skills
    ? skills
        .split(",")
        .map((skill) => skill.trim())
        .filter(Boolean)
    : []

  await prisma.$transaction(async (tx) => {
    const employee = await tx.employee.create({
      data: {
        firstName,
        lastName,
        middleName: middleName || null,
        position,
        hourlyRate,
        skills: skillsArray,
        emergencyContactPerson: emergencyContactPerson || null,
        emergencyContactNo: emergencyContactNo || null,
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

  return { success: true }
}

const UpdateStaffSchema = z.object({
  employeeId: z.string().min(1),
  firstName: z.string().trim().min(1, "First name is required."),
  lastName: z.string().trim().min(1, "Last name is required."),
  middleName: z.string().trim().optional(),
  position: z.string().trim().min(1, "Position is required."),
  hourlyRate: z.coerce.number().min(0, "Enter a valid hourly rate."),
  skills: z.string().trim().optional(),
  emergencyContactPerson: z.string().trim().optional(),
  emergencyContactNo: z.string().trim().optional(),
  isActive: z.enum(["true", "false"]),
})

export type UpdateStaffState =
  | {
      errors?: {
        firstName?: string[]
        lastName?: string[]
        middleName?: string[]
        position?: string[]
        hourlyRate?: string[]
        skills?: string[]
        emergencyContactPerson?: string[]
        emergencyContactNo?: string[]
      }
      message?: string
      success?: boolean
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
    position: formData.get("position"),
    hourlyRate: formData.get("hourlyRate"),
    skills: formData.get("skills"),
    emergencyContactPerson: formData.get("emergencyContactPerson"),
    emergencyContactNo: formData.get("emergencyContactNo"),
    isActive: formData.get("isActive"),
  })

  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors }
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

  const {
    employeeId,
    firstName,
    lastName,
    middleName,
    position,
    hourlyRate,
    skills,
    emergencyContactPerson,
    emergencyContactNo,
    isActive,
  } = validatedFields.data
  const nextIsActive = isActive === "true"
  const skillsArray = skills
    ? skills
        .split(",")
        .map((skill) => skill.trim())
        .filter(Boolean)
    : []

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: { account: true },
  })

  if (!employee || !employee.account) {
    return { message: "Staff account not found." }
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

  diff("firstName", employee.firstName, firstName)
  diff("lastName", employee.lastName, lastName)
  diff("middleName", employee.middleName, normalize(middleName))
  diff("position", employee.position, position)
  diff("hourlyRate", String(employee.hourlyRate), String(hourlyRate))
  diff("skills", employee.skills.join(", "), skillsArray.join(", "))
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
  if (employee.account.isActive !== nextIsActive) {
    changes.push({
      field: "isActive",
      oldValue: String(employee.account.isActive),
      newValue: String(nextIsActive),
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
          position,
          hourlyRate,
          skills: skillsArray,
          emergencyContactPerson: normalize(emergencyContactPerson),
          emergencyContactNo: normalize(emergencyContactNo),
        },
      })

      await tx.userAccount.update({
        where: { id: employee.account!.id },
        data: { isActive: nextIsActive },
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
    })
  }

  revalidatePath("/admin/accounts/staff")

  return { success: true }
}
