// ---------------------------------------------------------------------------
// Ask once
// ---------------------------------------------------------------------------
//
// A dialog that fetches on open asks twice in development: React's Strict Mode
// — on by default in the app router — mounts, unmounts and remounts, so every
// effect body runs twice. A `cancelled` flag stops the second *state update*,
// but by then both requests have left. Reopening the same record asks again.
//
// What is stored here is the *promise*, not just the value. That is what turns
// a double mount into one request: the second call finds the first still in
// flight and waits on the same promise. Once it settles the value is kept
// beside it, so a component can read it during render and paint without a
// round trip at all.
//
// The caller owns the Map, which is what keeps this honest about scope — a
// cache that hides where it lives is a cache nobody can reason about.

export type Cached<T> = { at: number; promise: Promise<T>; value?: T }

/**
 * The entry for `key`, starting the work only if nothing usable is cached.
 *
 * `ttlMs` is how long a result stays good. Pass `Infinity` for facts that never
 * change; pass something shorter than the lifetime for anything that expires,
 * such as a signed URL.
 *
 * A rejected load evicts itself, so a failure is retried next time rather than
 * remembered forever.
 */
export function cachedOnce<T>(
  store: Map<string, Cached<T>>,
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
  now: number = Date.now()
): Cached<T> {
  const hit = store.get(key)
  if (hit && now - hit.at < ttlMs) return hit

  const entry: Cached<T> = { at: now, promise: load() }
  entry.promise.then(
    (value) => {
      entry.value = value
    },
    () => {
      // Only evict our own entry: a later attempt may already have replaced it.
      if (store.get(key) === entry) store.delete(key)
    }
  )
  store.set(key, entry)
  return entry
}

/**
 * The value already sitting in the cache, or undefined.
 *
 * For seeding state on first render so a reopen paints immediately — never
 * starts work, and never waits.
 */
export function settledValue<T>(
  store: Map<string, Cached<T>>,
  key: string,
  ttlMs: number,
  now: number = Date.now()
): T | undefined {
  const hit = store.get(key)
  return hit && now - hit.at < ttlMs ? hit.value : undefined
}
