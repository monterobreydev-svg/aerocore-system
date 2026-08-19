"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db/prisma"
import { verifySession } from "@/lib/auth"
import { isAdminSideRole } from "@/lib/auth/roles"
import { sendPush } from "@/lib/notifications/push"

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
// ---------------------------------------------------------------------------
// Browser notifications
//
// The browser does the hard part: it asks its own push service for an endpoint
// and a keypair, and hands back a subscription. All that is stored here is
// where to deliver and what to seal it with — see lib/push.ts.
// ---------------------------------------------------------------------------

export type PushSubscriptionInput = {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

/**
 * Remember this browser as somewhere to send notifications.
 *
 * Keyed on the endpoint, which the push service guarantees is stable for a
 * given browser and subscription — so re-running this on the same device
 * updates the row instead of growing a pile of duplicates that would each
 * deliver the same notification.
 *
 * Re-pointed at whoever is signed in now, deliberately: a shared office desktop
 * that someone else logs into should stop buzzing for the person who left.
 */
export async function subscribeToPush(
  subscription: PushSubscriptionInput,
  userAgent?: string
): Promise<{ ok: boolean; message?: string }> {
  const session = await verifySession()

  const { endpoint, keys } = subscription
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return { ok: false, message: "That subscription is incomplete." }
  }

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      accountId: session.accountId,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: userAgent?.slice(0, 400) ?? null,
    },
    update: {
      accountId: session.accountId,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: userAgent?.slice(0, 400) ?? null,
      lastSeenAt: new Date(),
    },
  })

  return { ok: true }
}

/** Forget this browser. Scoped to the signed-in account. */
export async function unsubscribeFromPush(endpoint: string) {
  const session = await verifySession()
  if (!endpoint) return { ok: true }

  await prisma.pushSubscription.deleteMany({
    where: { endpoint, accountId: session.accountId },
  })

  return { ok: true }
}

/** Whether this browser is already registered, for the settings toggle. */
export async function isPushSubscribed(endpoint: string) {
  const session = await verifySession()
  if (!endpoint) return false

  const row = await prisma.pushSubscription.findFirst({
    where: { endpoint, accountId: session.accountId },
    select: { id: true },
  })
  return row !== null
}

/** A test delivery, so somebody can prove it works before relying on it. */
export async function sendTestPush(): Promise<{ ok: boolean; message: string }> {
  const session = await verifySession()

  const { sent } = await sendPush([session.accountId], {
    title: "Notifications are on",
    body: "This is what a notification from AeroCoole looks like.",
    href: isAdminSideRole(session.role) ? "/admin" : "/employee",
    tag: "test",
  })

  return sent > 0
    ? { ok: true, message: "Sent — check your notifications." }
    : {
        ok: false,
        message:
          "Nothing could be delivered. The browser may have revoked permission — turn it off and on again.",
      }
}

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
