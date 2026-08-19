import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { decrypt } from "@/lib/auth/session"
import {
  homeRouteForRole,
  isAdminPathAllowedForRole,
  isAdminSideRole,
} from "@/lib/auth/roles"

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isAdminRoute = pathname.startsWith("/admin")
  const isEmployeeRoute = pathname.startsWith("/employee")
  const isLoginRoute = pathname === "/login"

  const session = await decrypt(request.cookies.get("session")?.value)

  if ((isAdminRoute || isEmployeeRoute) && !session) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  if (session) {
    if (isLoginRoute) {
      return NextResponse.redirect(
        new URL(homeRouteForRole(session.role), request.url)
      )
    }

    if (isAdminRoute && !isAdminSideRole(session.role)) {
      return NextResponse.redirect(new URL("/employee", request.url))
    }

    if (isAdminRoute && !isAdminPathAllowedForRole(pathname, session.role)) {
      return NextResponse.redirect(new URL("/admin", request.url))
    }

    // /employee is deliberately open to admin-side roles. A Director or
    // Engineer is still an employee with one account, one Employee row and
    // their own timesheet, payslips and claims — the portal is where they
    // file those. `homeRouteForRole` still lands them on /admin at login;
    // they cross over via the switcher in the header. Every /employee page
    // is scoped to session.employeeId, so this grants no one else's data.
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/admin/:path*", "/employee/:path*", "/login"],
}
