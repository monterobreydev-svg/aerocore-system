import type { Role } from "@/app/generated/prisma/client"

const ADMIN_SIDE_ROLES = new Set<Role>(["DIRECTOR", "ADMINISTRATOR", "ENGINEER"])

export function homeRouteForRole(role: Role) {
  return ADMIN_SIDE_ROLES.has(role) ? "/admin" : "/employee"
}

export function isAdminSideRole(role: Role) {
  return ADMIN_SIDE_ROLES.has(role)
}

const ROLE_LABELS: Record<Role, string> = {
  DIRECTOR: "Director",
  ADMINISTRATOR: "Administrator",
  ENGINEER: "Engineer",
  EMPLOYEE: "Employee",
}

export function roleLabel(role: Role) {
  return ROLE_LABELS[role]
}

// Director and Administrator can reach every /admin page. Engineer is
// restricted to the dashboard plus these path prefixes.
const ENGINEER_ALLOWED_ADMIN_PATHS = ["/admin/schedules", "/admin/reports"]

export function isAdminPathAllowedForRole(pathname: string, role: Role) {
  if (role !== "ENGINEER") return true
  if (pathname === "/admin") return true

  return ENGINEER_ALLOWED_ADMIN_PATHS.some((prefix) =>
    pathname.startsWith(prefix)
  )
}
