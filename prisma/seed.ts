import { randomBytes, scryptSync } from "crypto"
import { PrismaClient, type Role } from "../app/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex")
  const hash = scryptSync(password, salt, 64).toString("hex")
  return `${salt}:${hash}`
}

const DUMMY_ACCOUNTS: {
  username: string
  role: Role
  firstName: string
  lastName: string
  position: string
}[] = [
  {
    username: "director",
    role: "DIRECTOR",
    firstName: "Prince",
    lastName: "Monter",
    position: "Director",
  },
  {
    username: "administrator",
    role: "ADMINISTRATOR",
    firstName: "Arabella",
    lastName: "Reyes",
    position: "Administrator",
  },
  {
    username: "engineer",
    role: "ENGINEER",
    firstName: "Kaker",
    lastName: "Viola",
    position: "Engineer",
  },
  {
    username: "employee",
    role: "EMPLOYEE",
    firstName: "Jose",
    lastName: "Dela Cruz",
    position: "Technician",
  },
]

async function main() {
  const password = process.env.SEED_PASSWORD ?? "ChangeMe123!"

  for (const { username, role, firstName, lastName, position } of DUMMY_ACCOUNTS) {
    const existing = await prisma.userAccount.findUnique({ where: { username } })
    if (existing) {
      await prisma.employee.update({
        where: { id: existing.employeeId },
        data: { firstName, lastName, position },
      })
      console.log(`UserAccount "${username}" already exists — synced employee name/position.`)
      continue
    }

    const employee = await prisma.employee.create({
      data: { firstName, lastName, position, hourlyRate: 0, skills: [] },
    })

    const account = await prisma.userAccount.create({
      data: {
        employeeId: employee.id,
        username,
        passwordHash: hashPassword(password),
        role,
      },
    })

    console.log(`Created UserAccount "${account.username}" (role: ${account.role}).`)
  }

  console.log(
    `All dummy accounts share the password "${password}" (override via SEED_PASSWORD) — change them after first login.`
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
