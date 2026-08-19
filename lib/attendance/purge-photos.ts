import "server-only"

import { prisma } from "@/lib/db/prisma"
import { photoRetentionCutoff } from "@/lib/attendance"
import { deleteObjects, isR2Configured } from "@/lib/storage/r2"

// ---------------------------------------------------------------------------
// Forgetting faces
// ---------------------------------------------------------------------------
//
// Every punch carries a photograph of somebody's face, twice a day, forever.
// At eight employees that is around a gigabyte a year in storage — but the
// stronger reason to let them go is that they are photographs of people, kept
// for one purpose that expires. Once the pay they evidence has been worked out,
// paid and had time to be queried, holding them is exposure with no upside.
//
// What goes: the two selfies, and nothing else. The punch itself — when, where,
// how accurate the fix was — is the record and is kept forever, as are the
// service reports filed against it. Deleting the row was never the ask and
// would take payroll history with it.
//
// The bucket is the authority on what was actually removed. A key is only
// forgotten in Postgres once storage has confirmed it is gone, so a failed or
// unreachable delete leaves the row untouched and the next sweep tries again.
// The alternative — marking rows purged and hoping — quietly leaks objects
// nothing points at any more, which is the one outcome worse than keeping them.

/**
 * Punches examined per run.
 *
 * A month is a few hundred rows at this size, so this is really a ceiling for
 * the first run after the feature ships, when years of backlog may be waiting.
 * Whatever is left is picked up next time.
 */
const PURGE_BATCH = 500

export type PurgeResult = {
  /** Punches whose photographs are now gone. */
  punches: number
  /** Objects actually removed from storage. */
  photos: number
}

export async function purgePunchPhotos(
  now: Date = new Date()
): Promise<PurgeResult> {
  const empty: PurgeResult = { punches: 0, photos: 0 }
  // Without storage configured there is nothing to delete, and marking rows
  // purged would forget keys whose objects still exist.
  if (!isR2Configured()) return empty

  const cutoff = photoRetentionCutoff(now)

  const stale = await prisma.attendance.findMany({
    where: { date: { lt: cutoff }, photosPurgedAt: null },
    select: { id: true, timeInSelfieKey: true, timeOutSelfieKey: true },
    orderBy: { date: "asc" },
    take: PURGE_BATCH,
  })
  if (stale.length === 0) return empty

  const keys = stale
    .flatMap((row) => [row.timeInSelfieKey, row.timeOutSelfieKey])
    .filter((key): key is string => Boolean(key))

  const removed = await deleteObjects(keys)

  const purgedAt = new Date()
  let punches = 0

  for (const row of stale) {
    const inGone = !row.timeInSelfieKey || removed.has(row.timeInSelfieKey)
    const outGone = !row.timeOutSelfieKey || removed.has(row.timeOutSelfieKey)

    // Both or neither. A row half-forgotten would leave the surviving key
    // pointing at an object the next sweep no longer knows to look for.
    if (!inGone || !outGone) continue

    await prisma.attendance.update({
      where: { id: row.id },
      data: {
        timeInSelfieKey: null,
        timeOutSelfieKey: null,
        photosPurgedAt: purgedAt,
      },
    })
    punches++
  }

  return { punches, photos: removed.size }
}
