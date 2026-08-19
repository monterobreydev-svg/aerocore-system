"use server"

import { z } from "zod"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db/prisma"
import { verifyPassword } from "@/lib/auth/password"
import { createSession, deleteSession } from "@/lib/auth/session"
import { homeRouteForRole } from "@/lib/auth/roles"
import {
  AFTER_SUCCESS,
  LOCKOUT_MINUTES,
  afterFailedAttempt,
  isLockedOut,
  minutesRemaining,
} from "@/lib/auth/login-throttle"

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

  // One message for every failure. Saying "no such user" or "wrong password"
  // hands an attacker a way to enumerate who works here.
  const generic = { message: "Invalid username or password." }

  if (!account || !account.isActive) return generic

  if (isLockedOut(account)) {
    const minutes = minutesRemaining(account)
    return {
      message: `Too many failed attempts. Try again in ${minutes} minute${
        minutes === 1 ? "" : "s"
      }.`,
    }
  }

  if (!verifyPassword(password, account.passwordHash)) {
    // Counted on the row rather than in memory, so a restart — or a second
    // instance behind a load balancer — doesn't hand the attacker a fresh
    // budget of guesses.
    const { justLocked, ...next } = afterFailedAttempt(account)
    await prisma.userAccount.update({ where: { id: account.id }, data: next })
    return justLocked
      ? {
          message: `Too many failed attempts. Try again in ${LOCKOUT_MINUTES} minutes.`,
        }
      : generic
  }

  await prisma.userAccount.update({
    where: { id: account.id },
    data: { lastLoginAt: new Date(), ...AFTER_SUCCESS },
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
