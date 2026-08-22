"use server"

import { prisma } from "@/lib/db/prisma"
import { attendanceDay } from "@/lib/attendance"
import type { KioskJob } from "@/components/kiosk/kiosk-schedule"

/**
 * One month of the company's work, for the kiosk's month view.
 *
 * Public, like the page that calls it. Fetched a month at a time rather than
 * shipped with the page: the front door only needs the next fortnight to be
 * useful, and somebody paging back through the spring shouldn't have been paid
 * for in the first load by everyone who never does.
 *
 * The month is asked for as "YYYY-MM" and rebuilt here from local parts, so a
 * hand-edited value can only ever name a month — never widen the window.
 */
export async function listPublicMonth(
  monthKey: string
): Promise<{ date: string; jobs: KioskJob[] }[]> {
  const match = monthKey.match(/^(\d{4})-(\d{2})$/)
  if (!match) return []

  const year = Number(match[1])
  const month = Number(match[2]) - 1
  if (year < 2000 || year > 2100 || month < 0 || month > 11) return []

  const start = new Date(year, month, 1)
  const end = new Date(year, month + 1, 1)

  const schedules = await prisma.schedule.findMany({
    where: { date: { gte: start, lt: end }, status: { not: "CANCELLED" } },
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
      salesOrderNo: true,
      client: { select: { name: true, address: true } },
      branch: { select: { name: true, address: true } },
      assignments: {
        select: { employee: { select: { firstName: true, lastName: true } } },
      },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    // A month of work for a company this size, with room to spare.
    take: 400,
  })

  const byDay = new Map<number, { date: string; jobs: KioskJob[] }>()
  for (const job of schedules) {
    const day = attendanceDay(job.date)
    const key = day.getTime()
    if (!byDay.has(key)) byDay.set(key, { date: day.toISOString(), jobs: [] })

    byDay.get(key)!.jobs.push({
      id: job.id,
      startTime: job.startTime.toISOString(),
      endTime: job.endTime.toISOString(),
      status: job.status,
      workTypes: job.workTypes,
      clientName: job.client.name,
      branchName: job.branch?.name ?? null,
      salesOrderNo: job.salesOrderNo,
      address: job.branch?.address ?? job.client.address,
      contactPerson: job.contactPerson,
      contactNumber: job.contactNumber,
      remarks: job.remarks,
      crew: job.assignments.map(
        (row) => `${row.employee.firstName} ${row.employee.lastName}`
      ),
    })
  }

  return [...byDay.values()]
}
