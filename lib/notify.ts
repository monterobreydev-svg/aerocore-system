import "server-only"
import { prisma } from "@/lib/prisma"
import type { NotificationType, Role } from "@/app/generated/prisma/client"
import { isAdminPathAllowedForRole, isAdminSideRole } from "@/lib/roles"
import { sendPush } from "@/lib/push"

// Writing the inbox rows. Every caller is a server action that has already done
// the thing being announced, which is why nothing here throws: a notification
// that fails to insert must not roll back a released fund or a filed
// liquidation. It's logged and dropped.

// Callers say *what* the notification is about, not which URL to use. The URL
// depends on who is being told: proxy.ts bounces admin-side roles off
// /employee/* and employees off /admin/*, so a single hardcoded href sends half
// the recipients to a redirect — the notification disappears and they end up
// back on their own dashboard, which reads as a broken link.
type Destination =
  | "schedule"
  | "reimbursements"
  | "attendance"
  | "payroll"

const ROUTES: Record<Destination, { admin: string; employee: string }> = {
  schedule: { admin: "/admin/schedules", employee: "/employee/schedule" },
  reimbursements: {
    admin: "/admin/reimbursements",
    employee: "/employee/reimbursements",
  },
  attendance: { admin: "/admin/attendance", employee: "/employee/attendance" },
  payroll: { admin: "/admin/payroll", employee: "/employee/payslips" },
}

// Derived from the same predicates the proxy uses, so this can't drift from what
// is actually reachable. Returns null when the recipient has no page for it at
// all — an Engineer holding a working fund is the real case: they're admin-side,
// so the employee portal is closed to them, and reimbursements aren't in their
// slice of /admin. Better a notification that only clears than one that
// silently bounces.
function hrefFor(
  destination: Destination,
  role: Role,
  focusDate?: string
): string | null {
  const routes = ROUTES[destination]
  const path = !isAdminSideRole(role)
    ? routes.employee
    : isAdminPathAllowedForRole(routes.admin, role)
      ? routes.admin
      : null

  if (!path) return null
  return focusDate ? `${path}?date=${focusDate}` : path
}

type Draft = {
  type: NotificationType
  title: string
  body: string
  destination?: Destination
  // The day the notification is about, as "YYYY-MM-DD". Both calendars land on
  // today by default, so without this a job three weeks out is announced and
  // then not shown — the recipient has to go hunting for the thing they were
  // just told about.
  focusDate?: string
}

type Recipient = { id: string; role: Role }

async function insert(recipients: Recipient[], draft: Draft) {
  if (recipients.length === 0) return

  try {
    await prisma.notification.createMany({
      data: recipients.map((recipient) => ({
        recipientId: recipient.id,
        type: draft.type,
        title: draft.title,
        body: draft.body,
        href: draft.destination
          ? hrefFor(draft.destination, recipient.role, draft.focusDate)
          : null,
      })),
    })
  } catch (error) {
    console.error("[notify] could not write notification", error)
  }

  // The row is the record; this is the nudge. Sent after the write and never
  // allowed to fail the caller — a push that doesn't go out must not undo the
  // thing it was announcing.
  //
  // Grouped by the link rather than sent one at a time, because the link is the
  // only part of a notification that differs between recipients: an employee is
  // sent to /employee/schedule and an engineer to /admin/schedules for the same
  // job. Recipients sharing a destination share one call.
  try {
    const byHref = new Map<string | null, string[]>()
    for (const recipient of recipients) {
      const href = draft.destination
        ? hrefFor(draft.destination, recipient.role, draft.focusDate)
        : null
      byHref.set(href, [...(byHref.get(href) ?? []), recipient.id])
    }

    await Promise.all(
      [...byHref].map(([href, accountIds]) =>
        sendPush(accountIds, {
          title: draft.title,
          body: draft.body,
          href,
          // One notification per kind: a second schedule assignment replaces
          // the first in the shade rather than stacking beside it.
          tag: draft.type,
        })
      )
    )
  } catch (error) {
    console.error("[notify] could not push notification", error)
  }
}

// Employees are identified by employeeId everywhere in the app, but the inbox
// hangs off the login. Anyone without an active account is silently skipped —
// they have no way to read it.
async function activeAccounts(employeeIds: string[]): Promise<Recipient[]> {
  if (employeeIds.length === 0) return []

  return prisma.userAccount.findMany({
    where: { employeeId: { in: employeeIds }, isActive: true },
    select: { id: true, role: true },
  })
}

export async function notifyEmployees(employeeIds: string[], draft: Draft) {
  try {
    await insert(await activeAccounts(employeeIds), draft)
  } catch (error) {
    console.error("[notify] could not resolve recipients", error)
  }
}

export async function notifyEmployee(employeeId: string, draft: Draft) {
  await notifyEmployees([employeeId], draft)
}

// Whoever can actually act on it. Engineers are admin-side but don't review
// liquidations or release funds, so telling them would be noise they can't
// clear.
export async function notifyReviewers(draft: Draft, exceptAccountId?: string) {
  try {
    const accounts = await prisma.userAccount.findMany({
      where: {
        role: { in: ["DIRECTOR", "ADMINISTRATOR"] },
        isActive: true,
        ...(exceptAccountId ? { id: { not: exceptAccountId } } : {}),
      },
      select: { id: true, role: true },
    })
    await insert(accounts, draft)
  } catch (error) {
    console.error("[notify] could not resolve reviewers", error)
  }
}
