// Applies prisma/security.sql, then prints the resulting posture so the run
// is self-verifying. Re-run after any schema push that adds a table.
//   npx tsx --env-file=.env prisma/apply-security.mts
import { readFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { PrismaClient } from "../app/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const here = dirname(fileURLToPath(import.meta.url))
const prisma = new PrismaClient({
  // The direct connection: DDL over the pooler is unreliable.
  adapter: new PrismaPg({
    connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  }),
})

try {
  const sql = readFileSync(join(here, "security.sql"), "utf8")

  // Split on statement boundaries while ignoring semicolons inside a
  // dollar-quoted block — the DO $$ ... $$ loop contains several of its own.
  const body = sql.replace(/^\s*--.*$/gm, "")
  const statements: string[] = []
  let current = ""
  let inDollar = false
  for (let i = 0; i < body.length; i++) {
    if (body.startsWith("$$", i)) {
      inDollar = !inDollar
      current += "$$"
      i++
      continue
    }
    if (body[i] === ";" && !inDollar) {
      if (current.trim()) statements.push(current.trim())
      current = ""
      continue
    }
    current += body[i]
  }
  if (current.trim()) statements.push(current.trim())

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement)
  }
  console.log(`applied ${statements.length} statements\n`)

  const rls = await prisma.$queryRawUnsafe<
    { table: string; rls_enabled: boolean }[]
  >(
    `select c.relname as table, c.relrowsecurity as rls_enabled
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname='public' and c.relkind='r' order by c.relname`
  )
  const open = rls.filter((r) => !r.rls_enabled)
  console.log(`RLS enabled on ${rls.length - open.length}/${rls.length} tables`)
  if (open.length) console.log("  STILL OPEN:", open.map((r) => r.table).join(", "))

  const grants = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `select count(*)::bigint as n from information_schema.role_table_grants
      where table_schema='public' and grantee in ('anon','authenticated')`
  )
  console.log(`anon/authenticated table grants remaining: ${grants[0].n}`)
} finally {
  await prisma.$disconnect()
}
