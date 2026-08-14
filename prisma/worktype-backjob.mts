// ---------------------------------------------------------------------------
// Retire SURVEY and TROUBLESHOOT; introduce BACKJOB
//
//   npx tsx --env-file=.env prisma/worktype-backjob.mts
//
// Postgres cannot drop a value from an enum, so the type has to be rebuilt:
// rename the old one, create the replacement, retype the column through text,
// drop the original. `Schedule.workTypes` is the only column of this type and
// carries no default, which is what keeps that a four-statement job rather
// than a dance around dropping and restoring one.
//
// Written to be re-runnable: every step checks the state it expects first, so
// running it twice is a no-op rather than an error. `prisma db push` is not
// used for this — it would offer to drop the column and take the data with it.
// ---------------------------------------------------------------------------
import { PrismaClient } from "../app/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const RETIRED = ["SURVEY", "TROUBLESHOOT"]
const FINAL = [
  "INSTALLATION",
  "REPAIR",
  "MAINTENANCE",
  "CLEANING",
  "INSPECTION",
  "BACKJOB",
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
    WHERE t.typname = 'WorkType' ORDER BY e.enumsortorder
  `)
  return rows.map((row) => row.enumlabel)
}

try {
  const before = await labels()
  console.log("before:", before.join(", "))

  // 1. BACKJOB has to exist before any row can be pointed at it. Its own
  //    statement: a value added to an enum cannot be used by the same
  //    transaction that added it.
  if (!before.includes("BACKJOB")) {
    await prisma.$executeRawUnsafe(
      `ALTER TYPE "WorkType" ADD VALUE IF NOT EXISTS 'BACKJOB'`
    )
    console.log("added BACKJOB")
  }

  // 2. Move existing rows across. Order is preserved by first appearance and
  //    duplicates collapse, so a job tagged both Survey and Troubleshoot comes
  //    out with a single Backjob rather than it twice.
  const moved = await prisma.$executeRawUnsafe(`
    UPDATE "Schedule" AS s
    SET "workTypes" = (
      SELECT array_agg(v ORDER BY first_at)::"WorkType"[]
      FROM (
        SELECT v, MIN(ord) AS first_at
        FROM (
          SELECT CASE WHEN t IN ('SURVEY', 'TROUBLESHOOT') THEN 'BACKJOB' ELSE t END AS v,
                 ord
          FROM unnest(s."workTypes"::text[]) WITH ORDINALITY AS u(t, ord)
        ) mapped
        GROUP BY v
      ) deduped
    )
    WHERE s."workTypes" && ARRAY['SURVEY', 'TROUBLESHOOT']::"WorkType"[]
  `)
  console.log(`converted ${moved} schedule row(s) to BACKJOB`)

  // 3. Rebuild the type without the retired values.
  if (before.some((label) => RETIRED.includes(label))) {
    const values = FINAL.map((value) => `'${value}'`).join(", ")
    await prisma.$executeRawUnsafe(`ALTER TYPE "WorkType" RENAME TO "WorkType_old"`)
    await prisma.$executeRawUnsafe(`CREATE TYPE "WorkType" AS ENUM (${values})`)
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Schedule" ALTER COLUMN "workTypes" TYPE "WorkType"[] USING "workTypes"::text[]::"WorkType"[]`
    )
    await prisma.$executeRawUnsafe(`DROP TYPE "WorkType_old"`)
    console.log("rebuilt WorkType without", RETIRED.join(", "))
  }

  const after = await labels()
  console.log("after: ", after.join(", "))

  const leftovers = after.filter((label) => RETIRED.includes(label))
  if (leftovers.length > 0 || !after.includes("BACKJOB")) {
    console.error("FAILED — enum is not in the expected shape")
    process.exit(1)
  }
  console.log("OK")
} finally {
  await prisma.$disconnect()
}
