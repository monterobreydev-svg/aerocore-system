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
