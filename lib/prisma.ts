import "server-only"
import { PrismaClient } from "@/app/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

// One client per process, kept on globalThis because a dev server re-evaluates
// this module on every hot reload and a new connection pool each time would
// exhaust Postgres in an afternoon.
//
// The generated class is stored alongside it. `prisma generate` rewrites
// app/generated/prisma, which makes this module re-evaluate with a *different*
// PrismaClient class — but the instance cached here would survive with the old
// schema baked into it. That surfaced as "Unknown field `amount` for select
// statement on model X" for a column plainly present in the schema, curable only
// by restarting the server. Comparing the class identity means a regenerated
// client gets a fresh instance instead of an error that points nowhere useful.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient
  prismaClass?: typeof PrismaClient
}

function createClient() {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  })
}

function resolveClient() {
  const cached = globalForPrisma.prisma
  if (!cached) return createClient()
  if (globalForPrisma.prismaClass === PrismaClient) return cached

  // Regenerated underneath us: let the old pool go before replacing it.
  void cached.$disconnect().catch(() => {})
  return createClient()
}

export const prisma = resolveClient()

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
  globalForPrisma.prismaClass = PrismaClient
}
