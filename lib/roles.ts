import type { Role } from "@/app/generated/prisma/client"

const ADMIN_SIDE_ROLES = new Set<Role>(["DIRECTOR", "ADMINISTRATOR", "ENGINEER"])

export function homeRouteForRole(role: Role) {
  return ADMIN_SIDE_ROLES.has(role) ? "/admin" : "/employee"
}

export function isAdminSideRole(role: Role) {
  return ADMIN_SIDE_ROLES.has(role)
}
