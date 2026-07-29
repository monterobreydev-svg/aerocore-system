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

// Everything the account settings page shows about the signed-in person —
// the fields they may edit themselves, plus the employment and account facts
// that only an admin can change but which they still need to see. Decimals
// and Dates are flattened here because the settings UI is a client component.
export const getAccountSettings = cache(async () => {
  const session = await verifySession()

  const account = await prisma.userAccount.findUniqueOrThrow({
    where: { id: session.accountId },
    include: { employee: true },
  })

  const e = account.employee
  const dateOnly = (value: Date | null) =>
    value ? value.toISOString().slice(0, 10) : null

  return {
    username: account.username,
    role: account.role,
    isActive: account.isActive,
    lastLoginAt: account.lastLoginAt?.toISOString() ?? null,
    employee: {
      id: e.id,
      firstName: e.firstName,
      lastName: e.lastName,
      middleName: e.middleName,
      phoneNo: e.phoneNo,
      email: e.email,
      birthDate: dateOnly(e.birthDate),
      civilStatus: e.civilStatus,
      address: e.address,
      emergencyContactPerson: e.emergencyContactPerson,
      emergencyContactNo: e.emergencyContactNo,
      emergencyContactRelationship: e.emergencyContactRelationship,
      tinNo: e.tinNo,
      sssNo: e.sssNo,
      philhealthNo: e.philhealthNo,
      pagibigNo: e.pagibigNo,
      // Admin-managed from here down — shown read-only.
      employeeNo: e.employeeNo,
      position: e.position,
      employmentType: e.employmentType,
      dateHired: dateOnly(e.dateHired),
      hourlyRate: Number(e.hourlyRate),
      allowancePerCutoff:
        e.allowancePerCutoff === null ? null : Number(e.allowancePerCutoff),
      skills: e.skills,
      createdAt: e.createdAt.toISOString(),
    },
  }
})

export type AccountSettings = Awaited<ReturnType<typeof getAccountSettings>>
