import type { Role } from "@/app/generated/prisma/client"

const ADMIN_SIDE_ROLES = new Set<Role>(["DIRECTOR", "ADMINISTRATOR", "ENGINEER"])

export function homeRouteForRole(role: Role) {
  return ADMIN_SIDE_ROLES.has(role) ? "/admin" : "/employee"
}

export function isAdminSideRole(role: Role) {
  return ADMIN_SIDE_ROLES.has(role)
}

/**
 * May this person change their own name, birth date and civil status?
 *
 * Only a Director. Everyone else's identity is an HR fact: it is what payslips
 * are issued against, what government contributions are filed under, and what
 * a filed report is signed with. Somebody quietly correcting their own name the
 * week before payroll is not a correction anyone asked for — the office makes
 * that change, and the staff edit log carries who made it.
 *
 * Contact details are deliberately *not* covered. A new phone number or
 * emergency contact is exactly the sort of thing that should not need a ticket,
 * and getting it wrong costs nobody any money.
 */
export function canEditOwnIdentity(role: Role) {
  return role === "DIRECTOR"
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

// Short plain-language summary of what each role can actually reach, shown
// next to the role picker so whoever creates an account isn't guessing.
// Keep these in step with isAdminPathAllowedForRole and homeRouteForRole.
const ROLE_ACCESS: Record<Role, string> = {
  DIRECTOR: "Full access, including staff accounts and settings",
  ADMINISTRATOR: "Everything except editing their own record",
  ENGINEER: "Dashboard, schedules and reports only",
  EMPLOYEE: "Employee portal only — their own schedule and claims",
}

export function roleAccessLabel(role: Role) {
  return ROLE_ACCESS[role]
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

// Only a Director may hand out elevated roles. An Administrator creating a
// staff account can only ever create plain Employees — this is enforced here
// (server-side) as well as reflected in the create-staff form UI.
const ALL_ROLES: Role[] = ["DIRECTOR", "ADMINISTRATOR", "ENGINEER", "EMPLOYEE"]

export function assignableRoles(currentRole: Role): Role[] {
  return currentRole === "DIRECTOR" ? ALL_ROLES : ["EMPLOYEE"]
}
