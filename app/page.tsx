import Link from "next/link"
import { LogIn } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { isR2Configured } from "@/lib/r2"
import { attendanceDay, dayLabel, nextDay } from "@/lib/attendance"
import { KioskView } from "@/components/kiosk/kiosk-view"
import type { KioskDay } from "@/components/kiosk/kiosk-schedule"

// ---------------------------------------------------------------------------
// The front door
//
// Not the login page. Most of the crew never signs in: one person carries a
// phone to the site and everyone punches on it, so the first thing the app
// shows is the clock and the week's work — signing in is a link for the few
// who want their own record.
//
// Nothing here is behind a session, by decision. What proves a punch is the
// photograph and the position taken at the moment it happens, not a password
// typed on somebody else's handset.
// ---------------------------------------------------------------------------

/** How far ahead the public schedule looks. A fortnight is plenty to plan by. */
const DAYS_AHEAD = 14

/** Hard ceiling on rows, so a busy fortnight can't turn into a huge page. */
const JOB_LIMIT = 120

export const dynamic = "force-dynamic"

export default async function Home() {
  const today = attendanceDay(new Date())
  const until = new Date(today)
  until.setDate(until.getDate() + DAYS_AHEAD)

  // Today forward only. The clock is the point of this page; history belongs
  // to the office, and shipping it to a public URL would be paying for data
  // nobody standing at a gate is going to read.
  const schedules = await prisma.schedule.findMany({
    where: { date: { gte: today, lt: until }, status: { not: "CANCELLED" } },
    select: {
      id: true,
      date: true,
      startTime: true,
      endTime: true,
      status: true,
      workTypes: true,
      contactPerson: true,
      contactNumber: true,
      remarks: true,
      client: { select: { name: true, address: true } },
      branch: { select: { name: true, address: true } },
      assignments: {
        select: {
          employee: { select: { firstName: true, lastName: true } },
        },
      },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    take: JOB_LIMIT,
  })

  const tomorrow = nextDay(today)

  // Grouped on the server so the browser gets a list it can render, not a pile
  // it has to sort. The day's name is worked out here too — "Today" is more
  // use at a gate than a date somebody has to compare against their watch.
  const byDay = new Map<number, KioskDay>()
  for (const job of schedules) {
    const day = attendanceDay(job.date)
    const key = day.getTime()

    if (!byDay.has(key)) {
      byDay.set(key, {
        date: day.toISOString(),
        label:
          key === today.getTime()
            ? "Today"
            : key === tomorrow.getTime()
              ? "Tomorrow"
              : dayLabel(day, true),
        jobs: [],
      })
    }

    byDay.get(key)!.jobs.push({
      id: job.id,
      startTime: job.startTime.toISOString(),
      endTime: job.endTime.toISOString(),
      status: job.status,
      workTypes: job.workTypes,
      clientName: job.client.name,
      branchName: job.branch?.name ?? null,
      // The branch's own address when it has one — that is where the crew is
      // actually going, not the client's head office.
      address: job.branch?.address ?? job.client.address,
      contactPerson: job.contactPerson,
      contactNumber: job.contactNumber,
      remarks: job.remarks,
      crew: job.assignments.map(
        (row) => `${row.employee.firstName} ${row.employee.lastName}`
      ),
    })
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-lg flex-col gap-5 p-4 pb-10">
      <KioskView days={[...byDay.values()]} storageReady={isR2Configured()} />

      {/* Last, and quiet: the people who need it know they need it. */}
      <Link
        href="/login"
        className="mt-auto flex items-center justify-center gap-2 rounded-xl border py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
      >
        <LogIn className="size-4" />
        Sign in to my account
      </Link>
    </main>
  )
}
