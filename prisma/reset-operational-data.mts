// ---------------------------------------------------------------------------
// Clear the operational record, keep the people and the customers
//
//   npx tsx --env-file=.env prisma/reset-operational-data.mts          (dry run)
//   npx tsx --env-file=.env prisma/reset-operational-data.mts --yes    (deletes)
//
// For handing over a system that has been carrying trial data: every punch,
// job, claim and payroll line goes, while staff records, their logins and the
// client book stay exactly as they are.
//
// Prints what it is about to do and changes nothing unless `--yes` is passed,
// because there is no undo for this. The whole thing runs in one transaction —
// a half-cleared database, where payroll adjustments survive the attendance
// they were made against, is worse than either end state.
//
// NOT deleted, deliberately:
//   Employee, UserAccount   the people and their logins
//   StaffEditLog            the audit trail of changes to those records
//   PushSubscription        registered devices; wiping them silently turns off
//                           notifications until each person re-enables them
//   Client, Branch, ClientContact   the client book
//   GeocodedPlace           a coordinate→address cache, not anybody's data.
//                           Keeping it saves re-paying for the same lookups.
//
// Files in R2 are NOT touched. Selfies, filed reports and receipt images are
// left in the bucket with nothing pointing at them any more — see the note at
// the end of this file.
// ---------------------------------------------------------------------------
import { PrismaClient } from "../app/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  }),
})

const commit = process.argv.includes("--yes")

async function main() {
  // Counted before anything moves, so the summary describes the database as it
  // was found rather than as it ended up.
  const [
    notifications,
    overtime,
    reports,
    attendance,
    assignments,
    scheduleEdits,
    schedules,
    itemClients,
    items,
    claims,
    releases,
    adjustments,
    payrollReleases,
    employees,
    clients,
  ] = await Promise.all([
    prisma.notification.count(),
    prisma.overtimeRequest.count(),
    prisma.attendanceReport.count(),
    prisma.attendance.count(),
    prisma.scheduleAssignment.count(),
    prisma.scheduleEditLog.count(),
    prisma.schedule.count(),
    prisma.reimbursementItemClient.count(),
    prisma.reimbursementItem.count(),
    prisma.reimbursement.count(),
    prisma.fundRelease.count(),
    prisma.payrollAdjustment.count(),
    prisma.payrollRelease.count(),
    prisma.employee.count(),
    prisma.client.count(),
  ])

  const doomed = [
    ["Notifications", notifications],
    ["Overtime requests", overtime],
    ["Filed reports", reports],
    ["Attendance punches", attendance],
    ["Schedule assignments", assignments],
    ["Schedule edit logs", scheduleEdits],
    ["Schedules", schedules],
    ["Claim item clients", itemClients],
    ["Claim items", items],
    ["Reimbursement claims", claims],
    ["Fund releases", releases],
    ["Payroll adjustments", adjustments],
    ["Payroll releases", payrollReleases],
  ] as const

  const total = doomed.reduce((sum, [, count]) => sum + count, 0)

  console.log(commit ? "DELETING:" : "Would delete (dry run):")
  for (const [label, count] of doomed) {
    console.log(`  ${String(count).padStart(6)}  ${label}`)
  }
  console.log(`  ${String(total).padStart(6)}  rows in total\n`)
  console.log("Keeping:")
  console.log(`  ${String(employees).padStart(6)}  Employees (and their logins)`)
  console.log(`  ${String(clients).padStart(6)}  Clients (and branches, contacts)\n`)

  if (!commit) {
    console.log("Nothing was changed. Re-run with --yes to delete.")
    return
  }

  // Children before parents. The cascades would handle most of this on their
  // own, but naming every table means the count printed above is the count
  // actually deleted, and a table added later fails loudly here instead of
  // being quietly left behind.
  await prisma.$transaction(async (tx) => {
    await tx.notification.deleteMany()

    await tx.overtimeRequest.deleteMany()
    await tx.attendanceReport.deleteMany()
    await tx.attendance.deleteMany()

    await tx.scheduleAssignment.deleteMany()
    await tx.scheduleEditLog.deleteMany()
    await tx.schedule.deleteMany()

    await tx.reimbursementItemClient.deleteMany()
    await tx.reimbursementItem.deleteMany()
    await tx.reimbursement.deleteMany()
    await tx.fundRelease.deleteMany()

    await tx.payrollAdjustment.deleteMany()
    await tx.payrollRelease.deleteMany()
  })

  console.log("Done. Staff and client records untouched.")
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())

// ---------------------------------------------------------------------------
// The bucket
//
// Selfies, report PDFs and receipt images live in R2 under keys held by the
// rows above. Once those rows are gone there is nothing left that names the
// objects, so they cannot be cleaned up selectively afterwards — the keys go
// with the data. If the bucket should be emptied too, do it in the R2 console
// (or with a prefix delete) as a separate, deliberate step.
// ---------------------------------------------------------------------------
