import "server-only"
import { cache } from "react"
import { prisma } from "@/lib/prisma"
import { verifySession } from "@/lib/session"

export const getCurrentEmployee = cache(async () => {
  const session = await verifySession()

  const employee = await prisma.employee.findUniqueOrThrow({
    where: { id: session.employeeId },
    select: { firstName: true, lastName: true },
  })

  return { ...employee, role: session.role }
})
