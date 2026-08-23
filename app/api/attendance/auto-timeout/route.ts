import type { NextRequest } from "next/server"

import { closeAbandonedPunches } from "@/lib/attendance/auto-timeout"
import { purgePunchPhotos } from "@/lib/attendance/purge-photos"
import { purgeReimbursementFiles } from "@/lib/reimbursement/purge-files"

// Closing abandoned punches on a timer, for whoever wants to run one.
//
// The app does not need this: the sweep also runs when the office opens the day
// log and when anybody looks themselves up on the kiosk, and because the stamp
// is computed from the schedule rather than from the clock, a late sweep writes
// exactly the same row as a punctual one. What a scheduler buys is that the
// record is tidy before anyone looks at it, rather than a moment after.
//
// Point any cron at it — Vercel Cron, Supabase pg_cron, an uptime pinger —
// once an hour is plenty. Set CRON_SECRET and send it as a bearer token; with
// no secret configured the route stays shut, because an endpoint that writes to
// attendance is not something to leave open on the guess that nobody will find
// it.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function authorised(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false

  const header = request.headers.get("authorization")
  return header === `Bearer ${secret}`
}

async function sweep(request: NextRequest) {
  if (!authorised(request)) {
    return new Response("Not allowed.", { status: 401 })
  }

  // Both housekeeping jobs on one timer. They are unrelated in what they do
  // but identical in when they should run — regularly, unattended, and without
  // anyone having to open a page for the record to be tidy.
  const closed = await closeAbandonedPunches()
  const purged = await purgePunchPhotos()
  // The receipts and payout vouchers age on the same clock, for the same
  // reasons. Same timer too — one sweep, everything it should tidy.
  const files = await purgeReimbursementFiles()

  return Response.json({
    closed: closed.length,
    punches: closed.map((punch) => ({
      attendanceId: punch.attendanceId,
      employeeId: punch.employeeId,
      timeOut: punch.timeOut.toISOString(),
    })),
    photosPurged: purged,
    reimbursementFilesPurged: files,
  })
}

// GET as well as POST: several schedulers only know how to fetch a URL.
export const GET = sweep
export const POST = sweep
