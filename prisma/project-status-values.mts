// ---------------------------------------------------------------------------
// Retire BILLING; introduce ACCOUNT_RECEIVABLE, BILLED and FOR_BILLING
//
//   npx tsx --env-file=.env prisma/project-status-values.mts
//
// The office tracks a project through six states, not four — a job waiting to
// be invoiced, one already invoiced, and one invoiced but unpaid are three
// different conversations, and "Billing" was standing in for all of them.
//
// Postgres cannot drop a value from an enum, so the type has to be rebuilt:
// rename the old one, create the replacement, retype the column through text,
// drop the original. Same dance as worktype-backjob.mts, with one extra step —
// Project.status carries a DEFAULT, and a column default has to be dropped
// before the column can change type and put back afterwards.
//
// Written to be re-runnable: every step checks the state it expects first, so
// running it twice is a no-op rather than an error. `prisma db push` is not
// used for this — it would offer to drop the column and take the data with it.
// ---------------------------------------------------------------------------
import { PrismaClient } from "../app/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const RETIRED = ["BILLING"]
const FINAL = [
  "IN_PROGRESS",
  "ACCOUNT_RECEIVABLE",
  "BILLED",
  "FOR_BILLING",
  "ON_HOLD",
  "CLOSED",
]

const prisma = new PrismaClient({
  // The direct connection: DDL over the pooler is unreliable.
  adapter: new PrismaPg({
    connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  }),
})

async function labels(): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ enumlabel: string }[]>(`
    SELECT e.enumlabel FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'ProjectStatus' ORDER BY e.enumsortorder
  `)
  return rows.map((row) => row.enumlabel)
}

try {
  const before = await labels()
  console.log("before:", before.join(", "))

  // 1. The new values have to exist before any row can be pointed at one.
  //    Each in its own statement: a value added to an enum cannot be used by
  //    the transaction that added it.
  for (const value of ["ACCOUNT_RECEIVABLE", "BILLED", "FOR_BILLING"]) {
    if (!before.includes(value)) {
      await prisma.$executeRawUnsafe(
        `ALTER TYPE "ProjectStatus" ADD VALUE IF NOT EXISTS '${value}'`
      )
      console.log(`added ${value}`)
    }
  }

  // 2. Move anything still on the retired value. A project that was "Billing"
  //    was on its way to being invoiced rather than already invoiced, so it
  //    lands on FOR_BILLING — the state that still has something to do.
  if (before.includes("BILLING")) {
    const moved = await prisma.$executeRawUnsafe(`
      UPDATE "Project" SET "status" = 'FOR_BILLING'
      WHERE "status" = 'BILLING'
    `)
    console.log(`moved ${moved} project(s) from BILLING to FOR_BILLING`)
  }

  // 3. Rebuild the type without the retired value, dropping and restoring the
  //    column default around the retype.
  if (before.some((label) => RETIRED.includes(label))) {
    const values = FINAL.map((value) => `'${value}'`).join(", ")
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Project" ALTER COLUMN "status" DROP DEFAULT`
    )
    await prisma.$executeRawUnsafe(
      `ALTER TYPE "ProjectStatus" RENAME TO "ProjectStatus_old"`
    )
    await prisma.$executeRawUnsafe(
      `CREATE TYPE "ProjectStatus" AS ENUM (${values})`
    )
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Project" ALTER COLUMN "status" TYPE "ProjectStatus" USING "status"::text::"ProjectStatus"`
    )
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Project" ALTER COLUMN "status" SET DEFAULT 'IN_PROGRESS'`
    )
    await prisma.$executeRawUnsafe(`DROP TYPE "ProjectStatus_old"`)
    console.log("rebuilt ProjectStatus without", RETIRED.join(", "))
  }

  const after = await labels()
  console.log("after: ", after.join(", "))

  const leftovers = after.filter((label) => RETIRED.includes(label))
  const missing = FINAL.filter((value) => !after.includes(value))
  if (leftovers.length > 0 || missing.length > 0) {
    console.error("FAILED — enum is not in the expected shape")
    process.exit(1)
  }
  console.log("OK")
} finally {
  await prisma.$disconnect()
}
