import "server-only"

import webpush from "web-push"

import { prisma } from "@/lib/db/prisma"

// ---------------------------------------------------------------------------
// Pushing a notification to a browser
// ---------------------------------------------------------------------------
//
// The inbox in the database stays the record — this is the nudge. Push is
// best-effort by nature: permission can be refused, a subscription can expire
// silently, and the battery savers on the phones this company actually buys
// (Xiaomi, Oppo, Vivo) will drop deliveries to save power. Anything that only
// arrives by push is a thing somebody eventually misses, so nothing does.
//
// Nothing in here throws, for the same reason lib/notify.ts doesn't: a push
// that fails to send must never roll back the schedule, the released fund or
// the payroll it was announcing.

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const SUBJECT = process.env.VAPID_SUBJECT

export function isPushConfigured() {
  return Boolean(PUBLIC_KEY && PRIVATE_KEY && SUBJECT)
}

let configured = false

function push() {
  if (!configured) {
    webpush.setVapidDetails(SUBJECT!, PUBLIC_KEY!, PRIVATE_KEY!)
    configured = true
  }
  return webpush
}

export type PushPayload = {
  title: string
  body: string
  /** Where clicking it should land. Resolved per recipient by lib/notify. */
  href?: string | null
  /**
   * Groups replaceable notifications. Two schedule changes a minute apart
   * should be one line in the notification shade, not two.
   */
  tag?: string
}

/**
 * Deliver to every device the given accounts have registered.
 *
 * Accounts rather than employees: a subscription belongs to a login, and the
 * same person on a phone and a laptop is two devices that should both buzz.
 *
 * A subscription the push service rejects as gone is deleted here. That is the
 * only way these rows are ever cleaned up — a browser that revokes permission
 * or clears its storage never tells the server, so the 404 or 410 on the next
 * send is the notification that it has gone.
 */
export async function sendPush(
  accountIds: string[],
  payload: PushPayload
): Promise<{ sent: number; pruned: number }> {
  const result = { sent: 0, pruned: 0 }
  if (!isPushConfigured() || accountIds.length === 0) return result

  try {
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { accountId: { in: accountIds } },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    })
    if (subscriptions.length === 0) return result

    const body = JSON.stringify({
      title: payload.title,
      body: payload.body,
      href: payload.href ?? "/",
      tag: payload.tag,
    })

    const dead: string[] = []
    const alive: string[] = []

    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await push().sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            body,
            { TTL: 60 * 60 * 24 }
          )
          alive.push(subscription.id)
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode
          // 404/410 mean the push service has forgotten this endpoint: the
          // browser revoked permission, cleared its data, or the app was
          // uninstalled. Anything else — a timeout, a 500 — is theirs, not
          // ours, and the row stays for the next attempt.
          if (status === 404 || status === 410) dead.push(subscription.id)
          else console.error(`[push] send failed (${status ?? "no status"})`)
        }
      })
    )

    if (dead.length > 0) {
      await prisma.pushSubscription.deleteMany({ where: { id: { in: dead } } })
    }
    if (alive.length > 0) {
      await prisma.pushSubscription.updateMany({
        where: { id: { in: alive } },
        data: { lastSeenAt: new Date() },
      })
    }

    result.sent = alive.length
    result.pruned = dead.length
  } catch (error) {
    console.error("[push] could not deliver", error)
  }

  return result
}
