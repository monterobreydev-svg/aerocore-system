// ---------------------------------------------------------------------------
// Dates that read the same wherever they are rendered
// ---------------------------------------------------------------------------
//
// `toLocaleDateString()` with no arguments asks the *runtime* for a locale and
// a timezone. On a page rendered by the server and then hydrated in a browser
// that is two different runtimes, and the moment they disagree React throws the
// hydration warning about server HTML not matching the client — Node resolves
// to en-US and prints "8/16/2026" where a browser set to en-GB prints
// "16/08/2026".
//
// It is also the wrong answer even when it doesn't warn. This company is in one
// country, on one clock: a punch at half past midnight in Manila is not a
// different day because the server is in UTC or the reader is abroad. Pinning
// both settles the hydration question and the correctness one at the same time.

const LOCALE = "en-PH"
const TIME_ZONE = "Asia/Manila"

/** "Aug 16, 2026" — unambiguous, unlike 8/16 against 16/8. */
export function formatDate(value: string | Date) {
  return new Date(value).toLocaleDateString(LOCALE, {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

/** "Aug 16, 2026, 10:27 PM" — for the things where the hour matters. */
export function formatDateTime(value: string | Date) {
  return new Date(value).toLocaleString(LOCALE, {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

/** "Aug 16" — where the year is already established by its surroundings. */
export function formatDayAndMonth(value: string | Date) {
  return new Date(value).toLocaleDateString(LOCALE, {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "short",
  })
}
