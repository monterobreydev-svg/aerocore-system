"use client"

import { useSyncExternalStore } from "react"

// Nothing to subscribe to: whether this browser has a camera API is fixed for
// the life of the page.
const noSubscription = () => () => {}

/**
 * Reads a browser capability during render instead of discovering it in an
 * effect. Camera and location are the cases here: both are simply absent
 * outside a secure context, and that absence decides what to draw — it isn't
 * state that changes, so setting it from an effect would be a render pass
 * wasted on a fact already knowable.
 *
 * The server snapshot assumes the capability exists, so the markup it sends is
 * the working case; React re-renders with the truth immediately after hydration
 * if the device disagrees.
 */
export function useBrowserCapability(probe: () => boolean) {
  return useSyncExternalStore(noSubscription, probe, () => true)
}
