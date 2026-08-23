// ---------------------------------------------------------------------------
// How long an uploaded file is kept
// ---------------------------------------------------------------------------
//
// Deliberately NOT server-only, unlike the sweeps that use it. This is date
// arithmetic with no database and no bucket behind it, and lib/attendance —
// which states the same rule for punch photographs — is imported by client
// components. Marking it server-only breaks every one of them at build time.
//
// Every upload in this system is evidence for something that expires: a selfie
// proves somebody was standing at a gate, a receipt proves what a claim was
// for, a voucher proves money left the account. Once the thing they evidence
// has been worked out, settled and had time to be queried, keeping them is
// storage cost and exposure with no upside.
//
// One rule, in one place, so the answer cannot drift between the things it
// applies to.

/**
 * The instant before which an upload may be deleted.
 *
 * "The start of the previous month" rather than "a month ago to the day", on
 * purpose: the answer is the same whichever day of the month the sweep happens
 * to run, so it can run whenever the app is used and always do the same thing.
 * A rule that only works on the 1st is a rule that silently does nothing if
 * nobody opens the app that morning.
 *
 * In practice a file lives between one and two months. That is the floor the
 * office asked for — a month — met on every day rather than on one of them.
 */
export function attachmentRetentionCutoff(now: Date = new Date()) {
  return new Date(now.getFullYear(), now.getMonth() - 1, 1)
}
