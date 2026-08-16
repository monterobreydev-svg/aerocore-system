"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { verifySession } from "@/lib/auth"
import { isAdminSideRole } from "@/lib/roles"

// The bell lives in the layout, so that's what has to be re-rendered — a
// server action refreshes the page it was called from, not the shell above it.
// Refreshing it is also how the ninth notification takes the place of the one
// just cleared, since the list is capped at eight.
function revalidateShell(role: Parameters<typeof isAdminSideRole>[0]) {
  revalidatePath(isAdminSideRole(role) ? "/admin" : "/employee", "layout")
}

// Opening a notification is what retires it: the page it points at is now the
// place to look, so keeping a copy in the bell would only be clutter to clear
// twice.
//
// deleteMany scoped to the signed-in account, not delete-by-id: an id
// belonging to someone else matches nothing instead of deleting their row.
export async function dismissNotification(notificationId: string) {
  const session = await verifySession()
  if (!notificationId) return

  await prisma.notification.deleteMany({
    where: { id: notificationId, recipientId: session.accountId },
  })

  revalidateShell(session.role)
}

export async function clearNotifications() {
  const session = await verifySession()

  await prisma.notification.deleteMany({
    where: { recipientId: session.accountId },
  })

  revalidateShell(session.role)
}

/**
 * Just enough to tell whether the bell is out of date.
 *
 * The bell is rendered in the layout, and a layout does not re-render while
 * somebody clicks around inside it — so an overtime request filed by an
 * employee sat in the database, correctly addressed, and the administrator saw
 * nothing until they reloaded the whole page. `revalidatePath` cannot fix that:
 * it invalidates a cache on the server, and the stale copy is in somebody
 * else's browser.
 *
 * So the browser asks. This is deliberately not the inbox itself — two indexed
 * lookups returning a number and a timestamp, cheap enough to run on a timer on
 * a phone. When the answer differs from what is on screen the bell refreshes
 * the route, and the layout comes back with the real list; there is no second
 * copy of the inbox to keep in step.
 */
export async function notificationPulse(): Promise<{
  count: number
  latest: string | null
}> {
  const session = await verifySession()

  const [count, newest] = await Promise.all([
    prisma.notification.count({ where: { recipientId: session.accountId } }),
    prisma.notification.findFirst({
      where: { recipientId: session.accountId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ])

  return { count, latest: newest?.createdAt.toISOString() ?? null }
}
