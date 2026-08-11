"use client"

import { useSyncExternalStore } from "react"

// How often the clock advances. Attendance is measured in minutes, so half a
// minute is as fine as anything on screen can usefully be.
const TICK_MS = 30_000

function subscribe(onChange: () => void) {
  const timer = setInterval(onChange, TICK_MS)
  return () => clearInterval(timer)
}

// Bucketed to the tick on purpose. `Date.now()` returns a new number on every
// call, and useSyncExternalStore compares snapshots by identity — an unbucketed
// value would look like a change on every render and spin.
function snapshot() {
  return Math.floor(Date.now() / TICK_MS) * TICK_MS
}

// There is no "now" on the server that the browser will agree with, and
// pretending otherwise is a hydration mismatch. Callers read 0 as "not known
// yet" and render a placeholder until the first client tick.
function serverSnapshot() {
  return 0
}

/**
 * A clock that re-renders its consumer twice a minute.
 *
 * Used for the two places attendance has to keep counting after the page was
 * rendered: how long somebody currently on the clock has been on it, and
 * whether the overtime window has opened.
 */
export function useNow() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot)
}
