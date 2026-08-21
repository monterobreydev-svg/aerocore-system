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
  DIRECTOR: "Full access, including projects, staff accounts and settings",
  ADMINISTRATOR: "Everything except projects and editing their own record",
  ENGINEER: "Dashboard, schedules and reports only",
  EMPLOYEE: "Employee portal only — their own schedule and claims",
}

export function roleAccessLabel(role: Role) {
  return ROLE_ACCESS[role]
}

// Pages only a Director may reach — an Administrator is turned away from these
// as well. Kept as prefixes so a future /admin/projects/[id] is covered too.
const DIRECTOR_ONLY_ADMIN_PATHS = ["/admin/projects"]

export function isDirectorOnlyAdminPath(pathname: string) {
  return DIRECTOR_ONLY_ADMIN_PATHS.some((prefix) => pathname.startsWith(prefix))
}

// Director and Administrator can reach every other /admin page. Engineer is
// restricted to the dashboard plus these path prefixes.
const ENGINEER_ALLOWED_ADMIN_PATHS = ["/admin/schedules", "/admin/reports"]

export function isAdminPathAllowedForRole(pathname: string, role: Role) {
  if (isDirectorOnlyAdminPath(pathname)) return role === "DIRECTOR"
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

/**
 * May an actor see and manage an account holding this role?
 *
 * A Director is above an Administrator, so an Administrator does not get to
 * look at one: not their record, not their pay rate, not their attendance, not
 * their claims. Being able to read the account of the person who governs you is
 * most of the way to being able to act on it, and the whole point of the
 * Director role is that somebody above the Administrator holds it.
 *
 * A Director sees everyone, including other Directors — the role has to be
 * administrable by its own holders or the company can be left with an account
 * nobody can touch.
 */
export function canManageRole(actor: Role, target: Role) {
  if (actor === "DIRECTOR") return true
  if (actor === "ADMINISTRATOR") return target !== "DIRECTOR"
  return false
}

/**
 * The roles an actor is allowed to load, as a Prisma `in` filter.
 *
 * Returned as a list rather than a "not Director" clause so the rule lives in
 * one place: a role added later is invisible to an Administrator until somebody
 * decides otherwise, which is the safe direction for a permission to fail in.
 */
export function visibleRolesFor(actor: Role): Role[] {
  return ALL_ROLES.filter((role) => canManageRole(actor, role))
}
