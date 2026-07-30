import "server-only"
import { cache } from "react"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { COOKIE_NAME, decrypt } from "@/lib/session"
import { isAdminSideRole } from "@/lib/roles"

// The authoritative session check, used by every page and every server action.
//
// A signed JWT alone is not enough: it is self-contained and valid for seven
// days, so on its own a token keeps working after the account behind it has
// been deactivated or demoted. Someone dismissed on Monday would still hold
// admin until the following Monday. So the account row is re-read on each
// request and the token is treated as nothing more than a claim about *who*
// is asking — never about what they are still allowed to do.
//
// Role is returned from the database, not the token, so a demotion takes
// effect on the very next request instead of persisting until expiry.
//
// cache() scopes this to one query per request, not one per call site.
export const verifySession = cache(async () => {
  const cookieStore = await cookies()
  const token = await decrypt(cookieStore.get(COOKIE_NAME)?.value)

  if (!token?.accountId) {
    redirect("/login")
  }

  const account = await prisma.userAccount.findUnique({
    where: { id: token.accountId },
    select: {
      id: true,
      employeeId: true,
      role: true,
      isActive: true,
      sessionsRevokedAt: true,
    },
  })

  // Deleted or switched off — the cookie is worthless either way.
  if (!account || !account.isActive) {
    redirect("/login")
  }

  // Anything issued before the revocation mark is dead. This is what makes a
  // password change actually kick out the other devices: without it a token
  // signed last Tuesday keeps working, new password or not.
  //
  // `iat` is whole seconds, so the mark is compared at second granularity too.
  // Storing it truncated to the second means the replacement session minted
  // immediately after a change isn't caught by its own revocation.
  if (account.sessionsRevokedAt && typeof token.iat === "number") {
    if (token.iat * 1000 < +account.sessionsRevokedAt) {
      redirect("/login")
    }
  }

  return {
    accountId: account.id,
    employeeId: account.employeeId,
    role: account.role,
  }
})

// Role gates for page reads.
//
// proxy.ts also redirects on role, but it can only see the JWT — so a user
// demoted mid-session keeps whatever the token still claims until it expires.
// These run inside the request, against the role read from the database, and
// are what actually decides whether a page renders.

export async function requireAdminSide() {
  const session = await verifySession()
  if (!isAdminSideRole(session.role)) {
    redirect("/employee")
  }
  return session
}

// Director or Administrator. Engineers are admin-side but are limited to the
// dashboard, schedules and reports — everything else goes through here.
export async function requireManager() {
  const session = await verifySession()
  if (session.role !== "DIRECTOR" && session.role !== "ADMINISTRATOR") {
    redirect("/admin")
  }
  return session
}
