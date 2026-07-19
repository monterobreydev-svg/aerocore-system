import "server-only"
import { cache } from "react"
import { prisma } from "@/lib/prisma"
import { verifySession } from "@/lib/session"

export const getCurrentEmployee = cache(async () => {
  const session = await verifySession()

  const employee = await prisma.employee.findUniqueOrThrow({
    where: { id: session.employeeId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      middleName: true,
      position: true,
      emergencyContactPerson: true,
      emergencyContactNo: true,
    },
  })

  return { ...employee, role: session.role }
})
