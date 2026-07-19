import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { decrypt } from "@/lib/session"
import {
  homeRouteForRole,
  isAdminPathAllowedForRole,
  isAdminSideRole,
} from "@/lib/roles"

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

    if (isEmployeeRoute && isAdminSideRole(session.role)) {
      return NextResponse.redirect(new URL("/admin", request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/admin/:path*", "/employee/:path*", "/login"],
}
