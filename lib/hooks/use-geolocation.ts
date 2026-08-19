"use client"

import { useEffect, useState } from "react"
import { useBrowserCapability } from "@/lib/hooks/use-browser-capability"

export type Fix = {
  latitude: number
  longitude: number
  accuracy?: number
}

export type Located =
  | { state: "locating" }
  | { state: "found"; fix: Fix }
  | { state: "failed"; reason: string }

// "NotAllowedError" is not something the person holding the phone can act on.
function describe(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) {
    return "Location was blocked. Allow location for this site, then reopen this screen."
  }
  if (error.code === error.POSITION_UNAVAILABLE) {
    return "Your location couldn't be determined. Move somewhere with a clearer view of the sky and try again."
  }
  return "Getting your location took too long. Try again."
}

/**
 * One position, read once when the screen opens.
 *
 * Asked for immediately rather than at submit time: a cold GPS start can take
 * fifteen seconds, and by asking now the fix is usually in hand by the time the
 * photo has been taken. Nothing here tracks — `getCurrentPosition`, not
 * `watchPosition`.
 */
export function useGeolocationFix(): Located {
  const [located, setLocated] = useState<Located>({ state: "locating" })

  // Absent, not merely unpermitted, outside a secure context — same as the
  // camera. Read at render so the reason is drawn immediately instead of after
  // a wasted pass.
  const available = useBrowserCapability(() => Boolean(navigator.geolocation))

  useEffect(() => {
    if (!available) return
    let cancelled = false

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (cancelled) return
        setLocated({
          state: "found",
          fix: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          },
        })
      },
      (error) => {
        if (cancelled) return
        setLocated({ state: "failed", reason: describe(error) })
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 }
    )

    return () => {
      cancelled = true
    }
  }, [available])

  if (available) return located

  // Nothing to wait for, so say why rather than spinning on "Getting your
  // location…" forever.
  return {
    state: "failed",
    reason:
      typeof window !== "undefined" && window.isSecureContext
        ? "This browser can't provide a location."
        : "Location only works over a secure (https) connection. Open the system using its https address.",
  }
}
