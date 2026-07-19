import "server-only"
import { SignJWT, jwtVerify } from "jose"
import { cookies } from "next/headers"
import { cache } from "react"
import { redirect } from "next/navigation"
import type { Role } from "@/app/generated/prisma/client"

export type SessionPayload = {
  accountId: string
  employeeId: string
  role: Role
}

const encodedKey = new TextEncoder().encode(process.env.SESSION_SECRET)
const COOKIE_NAME = "session"

export async function encrypt(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(encodedKey)
}

export async function decrypt(session: string | undefined) {
  if (!session) return null

  try {
    const { payload } = await jwtVerify<SessionPayload>(session, encodedKey, {
      algorithms: ["HS256"],
    })
    return payload
  } catch {
    return null
  }
}

export async function createSession(payload: SessionPayload, remember: boolean) {
  const session = await encrypt(payload)
  const cookieStore = await cookies()

  cookieStore.set(COOKIE_NAME, session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // Omitting `expires` makes it a session cookie that clears when the
    // browser closes. The JWT's own 7d expiry still caps it either way.
    ...(remember ? { expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } : {}),
    sameSite: "lax",
    path: "/",
  })
}

export async function deleteSession() {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
}

export const verifySession = cache(async () => {
  const cookieStore = await cookies()
  const session = await decrypt(cookieStore.get(COOKIE_NAME)?.value)

  if (!session?.accountId) {
    redirect("/login")
  }

  return session
})
