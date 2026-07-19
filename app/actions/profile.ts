"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { verifySession } from "@/lib/session"

const ProfileSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required."),
  lastName: z.string().trim().min(1, "Last name is required."),
  middleName: z.string().trim().optional(),
  emergencyContactPerson: z.string().trim().optional(),
  emergencyContactNo: z.string().trim().optional(),
})

export type ProfileState =
  | {
      errors?: {
        firstName?: string[]
        lastName?: string[]
        middleName?: string[]
        emergencyContactPerson?: string[]
        emergencyContactNo?: string[]
      }
      message?: string
    }
  | undefined

export async function updateProfile(
  _state: ProfileState,
  formData: FormData
): Promise<ProfileState> {
  const session = await verifySession()

  const validatedFields = ProfileSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    middleName: formData.get("middleName"),
    emergencyContactPerson: formData.get("emergencyContactPerson"),
    emergencyContactNo: formData.get("emergencyContactNo"),
  })

  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors }
  }

  const {
    firstName,
    lastName,
    middleName,
    emergencyContactPerson,
    emergencyContactNo,
  } = validatedFields.data

  await prisma.employee.update({
    where: { id: session.employeeId },
    data: {
      firstName,
      lastName,
      middleName: middleName || null,
      emergencyContactPerson: emergencyContactPerson || null,
      emergencyContactNo: emergencyContactNo || null,
    },
  })

  const section = formData.get("section")
  if (section === "admin" || section === "employee") {
    revalidatePath(`/${section}/settings`)
  }

  return { message: "Profile updated." }
}
