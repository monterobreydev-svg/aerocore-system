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
