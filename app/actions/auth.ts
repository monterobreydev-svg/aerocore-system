"use server"

import { z } from "zod"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { verifyPassword } from "@/lib/password"
import { createSession, deleteSession } from "@/lib/session"
import { homeRouteForRole } from "@/lib/roles"

const LoginSchema = z.object({
  username: z.string().trim().min(1, "Username is required."),
  password: z.string().min(1, "Password is required."),
})

export type LoginState =
  | {
      errors?: {
        username?: string[]
        password?: string[]
      }
      message?: string
    }
  | undefined

export async function login(
  _state: LoginState,
  formData: FormData
): Promise<LoginState> {
  const validatedFields = LoginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  })

  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors }
  }

  const { username, password } = validatedFields.data

  const account = await prisma.userAccount.findUnique({ where: { username } })

  if (
    !account ||
    !account.isActive ||
    !verifyPassword(password, account.passwordHash)
  ) {
    return { message: "Invalid username or password." }
  }

  await prisma.userAccount.update({
    where: { id: account.id },
    data: { lastLoginAt: new Date() },
  })

  await createSession(
    {
      accountId: account.id,
      employeeId: account.employeeId,
      role: account.role,
    },
    formData.get("remember") === "on"
  )

  redirect(homeRouteForRole(account.role))
}

export async function logout() {
  await deleteSession()
  redirect("/login")
}
