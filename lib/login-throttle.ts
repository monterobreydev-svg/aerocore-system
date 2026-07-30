// Brute-force lockout, kept as pure functions so the decision can be tested
// directly. The login action does the I/O; everything that decides *whether*
// to lock lives here.

// Enough attempts for a genuine typo streak, few enough that a password
// guessing run stalls almost immediately.
export const MAX_LOGIN_ATTEMPTS = 8
export const LOCKOUT_MINUTES = 15

export type LockoutFields = {
  failedLoginAttempts: number
  lockedUntil: Date | null
}

export function isLockedOut(account: LockoutFields, now: Date = new Date()) {
  return account.lockedUntil !== null && account.lockedUntil > now
}

export function minutesRemaining(account: LockoutFields, now: Date = new Date()) {
  if (!account.lockedUntil) return 0
  return Math.max(1, Math.ceil((+account.lockedUntil - +now) / 60000))
}

// What to write after a failed attempt. Once the threshold is crossed the
// counter resets and a deadline is set instead — so the next window starts
// clean rather than locking again on the very first retry.
export function afterFailedAttempt(
  account: LockoutFields,
  now: Date = new Date()
): LockoutFields & { justLocked: boolean } {
  const attempts = account.failedLoginAttempts + 1
  const justLocked = attempts >= MAX_LOGIN_ATTEMPTS
  return {
    failedLoginAttempts: justLocked ? 0 : attempts,
    lockedUntil: justLocked
      ? new Date(+now + LOCKOUT_MINUTES * 60000)
      : null,
    justLocked,
  }
}

export const AFTER_SUCCESS: LockoutFields = {
  failedLoginAttempts: 0,
  lockedUntil: null,
}
