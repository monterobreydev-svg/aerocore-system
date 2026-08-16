"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, Bell, BellOff, Check, Loader2 } from "lucide-react"

import {
  isPushSubscribed,
  sendTestPush,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/app/actions/notifications"
import { Button } from "@/components/ui/button"

// ---------------------------------------------------------------------------
// Turning browser notifications on, per device
// ---------------------------------------------------------------------------
//
// Per device rather than per person, because that is what a browser permission
// is: agreeing on a phone says nothing about the desktop in the office, and
// both may want to buzz.
//
// The permission is only ever asked for from a press. A browser handed
// `Notification.requestPermission()` on page load shows a prompt nobody was
// expecting, and a prompt nobody was expecting gets dismissed — after which
// most browsers will never ask again for that site. One careless call costs
// the feature permanently, which is why this is a button and not an effect.

type State =
  | "checking"
  | "unsupported"
  | "denied"
  | "off"
  | "on"
  | "working"

/** The browser's base64url VAPID key, as the bytes `subscribe` expects. */
function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/")
  const raw = atob(padded)
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)))
}

export function PushToggle({ publicKey }: { publicKey: string | null }) {
  const [state, setState] = useState<State>("checking")
  const [message, setMessage] = useState<string | null>(null)

  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window

  // Read-only: works out where this device already stands without asking for
  // anything or registering anything.
  useEffect(() => {
    let cancelled = false

    void (async () => {
      if (!publicKey || !supported) {
        if (!cancelled) setState("unsupported")
        return
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState("denied")
        return
      }

      try {
        const registration = await navigator.serviceWorker.getRegistration()
        const existing = await registration?.pushManager.getSubscription()
        // The browser's answer and the server's have to agree: a subscription
        // the server has forgotten is not switched on, whatever the browser
        // still thinks.
        const known = existing
          ? await isPushSubscribed(existing.endpoint)
          : false
        if (!cancelled) setState(known ? "on" : "off")
      } catch {
        if (!cancelled) setState("off")
      }
    })()

    return () => {
      cancelled = true
    }
  }, [publicKey, supported])

  async function turnOn() {
    setState("working")
    setMessage(null)

    try {
      const permission = await Notification.requestPermission()
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off")
        return
      }

      // Registered here rather than on every page load: a service worker is
      // only needed by someone who wants notifications, and registering one
      // for everybody is a background download nobody asked for.
      const registration = await navigator.serviceWorker.register("/sw.js")
      await navigator.serviceWorker.ready

      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          // Required by every browser: only the holder of the private half can
          // send to this endpoint, so a leaked endpoint is not a way in.
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey!),
        }))

      const result = await subscribeToPush(
        JSON.parse(JSON.stringify(subscription)),
        navigator.userAgent
      )
      if (!result.ok) {
        setMessage(result.message ?? "That didn't work. Try again.")
        setState("off")
        return
      }

      setState("on")
      setMessage("This device will now be notified.")
    } catch (error) {
      console.error("[push] could not subscribe", error)
      setMessage("The browser refused to set this up. Try again.")
      setState("off")
    }
  }

  async function turnOff() {
    setState("working")
    setMessage(null)

    try {
      const registration = await navigator.serviceWorker.getRegistration()
      const subscription = await registration?.pushManager.getSubscription()

      if (subscription) {
        await unsubscribeFromPush(subscription.endpoint)
        await subscription.unsubscribe()
      }
      setState("off")
      setMessage("This device will no longer be notified.")
    } catch {
      setMessage("Couldn't turn it off. Try again.")
      setState("on")
    }
  }

  async function test() {
    setMessage(null)
    const result = await sendTestPush()
    setMessage(result.message)
  }

  if (state === "unsupported") {
    return (
      <p className="flex items-start gap-2.5 text-sm text-muted-foreground">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <span>
          This browser can&apos;t show notifications.{" "}
          {/* The one caveat worth naming: iPhones only allow it once the app
              has been added to the home screen. */}
          On an iPhone, add AeroCoole to your home screen first, then open it
          from there.
        </span>
      </p>
    )
  }

  if (state === "denied") {
    return (
      <p className="flex items-start gap-2.5 text-sm text-muted-foreground">
        <BellOff className="mt-0.5 size-4 shrink-0" />
        <span>
          Notifications are blocked for this site. Turn them back on in the
          browser&apos;s site settings — the app can&apos;t ask again once
          it&apos;s been refused.
        </span>
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-sm text-muted-foreground">
        Get told about new schedules, overtime decisions, released funds and
        payslips — even when the app is closed. This is per device, so turn it
        on wherever you want to be reached.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {state === "on" ? (
          <>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600/10 px-2.5 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              <Check className="size-3.5" />
              On for this device
            </span>
            <Button type="button" variant="outline" size="sm" onClick={test}>
              Send a test
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={turnOff}>
              Turn off
            </Button>
          </>
        ) : (
          <Button
            type="button"
            size="sm"
            disabled={state === "working" || state === "checking"}
            onClick={turnOn}
          >
            {state === "working" ? <Loader2 className="animate-spin" /> : <Bell />}
            {state === "working" ? "Setting up…" : "Turn on notifications"}
          </Button>
        )}
      </div>

      {message && <p className="text-xs text-muted-foreground">{message}</p>}

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Notifications are a nudge, not the record — everything also waits for
        you in the bell. Some phones hold back notifications to save battery, so
        check the app if you&apos;re expecting something.
      </p>
    </div>
  )
}
