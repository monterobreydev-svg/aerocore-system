import "server-only"

import { prisma } from "@/lib/db/prisma"
import { attachmentRetentionCutoff } from "@/lib/storage/retention"
import { deleteObjects, isR2Configured } from "@/lib/storage/r2"

// ---------------------------------------------------------------------------
// Letting go of the paperwork
// ---------------------------------------------------------------------------
//
// Two uploads hang off every liquidation: the employee's compiled receipt scan,
// and the voucher the office attaches when it releases the money. Both are
// evidence for a decision that gets made once — approve or refuse, then pay —
// and after that they are scans of other people's shop receipts and bank
// screens, accumulating forever for a question nobody asks again.
//
// The same treatment the punch selfies get, for the same reasons and on the
// same clock: see lib/attendance/purge-photos, which this deliberately mirrors
// rather than reinvents.
//
// What goes: the object in storage, and the key that pointed at it. What stays:
// the claim, every line of its breakdown, the amounts, the approval, who
// decided and when, the payout and its reference — and the *name* of the file
// that used to be there. Keeping the filename is what lets a reader tell "the
// scan was deleted after a month" from "nobody ever attached one", which are
// very different things to find on a claim that was refused.
//
// The bucket is the authority on what was actually removed. A key is only
// forgotten in Postgres once storage has confirmed it is gone, so a failed or
// unreachable delete leaves the row untouched and the next sweep tries again.
// Marking rows purged and hoping would quietly leak objects nothing points at.

/**
 * Rows examined per run, per table.
 *
 * A month of claims is a few dozen at this size, so this is really a ceiling
 * for the first run after the feature ships, when a backlog may be waiting.
 * Whatever is left is picked up next time.
 */
const PURGE_BATCH = 500

export type ReimbursementPurgeResult = {
  /** Claims whose receipt scan is now gone. */
  claims: number
  /** Fund releases whose voucher is now gone. */
  releases: number
  /** Objects actually removed from storage. */
  files: number
}

export async function purgeReimbursementFiles(
  now: Date = new Date()
): Promise<ReimbursementPurgeResult> {
  const empty: ReimbursementPurgeResult = { claims: 0, releases: 0, files: 0 }
  // Without storage configured there is nothing to delete, and clearing keys
  // would forget objects that still exist.
  if (!isR2Configured()) return empty

  const cutoff = attachmentRetentionCutoff(now)

  // Filed, and paid out, are different clocks — a claim submitted in March can
  // be settled in May — so each is aged from its own date rather than from a
  // shared one that would let one of them go too early.
  const [claims, releases] = await Promise.all([
    prisma.reimbursement.findMany({
      where: {
        submittedAt: { lt: cutoff },
        filesPurgedAt: null,
        receiptKey: { not: null },
      },
      select: { id: true, receiptKey: true },
      orderBy: { submittedAt: "asc" },
      take: PURGE_BATCH,
    }),
    prisma.fundRelease.findMany({
      where: {
        releasedAt: { lt: cutoff },
        proofPurgedAt: null,
        proofKey: { not: null },
      },
      select: { id: true, proofKey: true },
      orderBy: { releasedAt: "asc" },
      take: PURGE_BATCH,
    }),
  ])

  if (claims.length === 0 && releases.length === 0) return empty

  // One call for both: the bucket is charged and rate-limited per request, and
  // these are the same kind of object with the same reason for going.
  const keys = [
    ...claims.map((row) => row.receiptKey),
    ...releases.map((row) => row.proofKey),
  ].filter((key): key is string => Boolean(key))

  const removed = await deleteObjects(keys)
  const purgedAt = new Date()

  let purgedClaims = 0
  for (const row of claims) {
    if (!row.receiptKey || !removed.has(row.receiptKey)) continue
    await prisma.reimbursement.update({
      where: { id: row.id },
      // receiptName and receiptType survive on purpose — see the note above.
      data: { receiptKey: null, filesPurgedAt: purgedAt },
    })
    purgedClaims += 1
  }

  let purgedReleases = 0
  for (const row of releases) {
    if (!row.proofKey || !removed.has(row.proofKey)) continue
    await prisma.fundRelease.update({
      where: { id: row.id },
      data: { proofKey: null, proofPurgedAt: purgedAt },
    })
    purgedReleases += 1
  }

  return {
    claims: purgedClaims,
    releases: purgedReleases,
    files: removed.size,
  }
}
