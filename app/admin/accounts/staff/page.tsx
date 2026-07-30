import { prisma } from "@/lib/prisma"
import { requireManager } from "@/lib/auth"
import { nextEmployeeNo } from "@/lib/employee"
import { StaffCards, type StaffMember } from "@/components/admin/staff-cards"

export default async function StaffPage() {
  const session = await requireManager()

  // Highest existing "E-0000" code, so the create form can pre-fill the next
  // one. Sorted as text, which is why the codes are zero-padded.
  const lastNumbered = await prisma.employee.findFirst({
    where: { employeeNo: { not: null } },
    orderBy: { employeeNo: "desc" },
    select: { employeeNo: true },
  })
  const suggestedEmployeeNo = nextEmployeeNo(lastNumbered?.employeeNo)

  const accounts = await prisma.userAccount.findMany({
    include: {
      employee: {
        include: {
          createdBy: {
            include: {
              employee: { select: { firstName: true, lastName: true } },
            },
          },
          editLogs: {
            orderBy: { createdAt: "desc" },
            include: {
              editedBy: {
                include: {
                  employee: { select: { firstName: true, lastName: true } },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { employee: { firstName: "asc" } },
  })

  const staff: StaffMember[] = accounts.map((account) => ({
    id: account.id,
    username: account.username,
    role: account.role,
    isActive: account.isActive,
    employee: {
      id: account.employee.id,
      firstName: account.employee.firstName,
      lastName: account.employee.lastName,
      middleName: account.employee.middleName,
      phoneNo: account.employee.phoneNo,
      email: account.employee.email,
      birthDate: account.employee.birthDate
        ? account.employee.birthDate.toISOString().slice(0, 10)
        : null,
      civilStatus: account.employee.civilStatus,
      address: account.employee.address,
      employeeNo: account.employee.employeeNo,
      position: account.employee.position,
      employmentType: account.employee.employmentType,
      dateHired: account.employee.dateHired
        ? account.employee.dateHired.toISOString().slice(0, 10)
        : null,
      hourlyRate: Number(account.employee.hourlyRate),
      allowancePerCutoff:
        account.employee.allowancePerCutoff === null
          ? null
          : Number(account.employee.allowancePerCutoff),
      skills: account.employee.skills,
      emergencyContactPerson: account.employee.emergencyContactPerson,
      emergencyContactNo: account.employee.emergencyContactNo,
      emergencyContactRelationship:
        account.employee.emergencyContactRelationship,
      tinNo: account.employee.tinNo,
      sssNo: account.employee.sssNo,
      philhealthNo: account.employee.philhealthNo,
      pagibigNo: account.employee.pagibigNo,
      createdAt: account.employee.createdAt.toISOString(),
      createdByName: account.employee.createdBy
        ? `${account.employee.createdBy.employee.firstName} ${account.employee.createdBy.employee.lastName}`
        : null,
      editLogs: account.employee.editLogs.map((log) => ({
        id: log.id,
        field: log.field,
        oldValue: log.oldValue,
        newValue: log.newValue,
        createdAt: log.createdAt.toISOString(),
        editedByName: `${log.editedBy.employee.firstName} ${log.editedBy.employee.lastName}`,
      })),
    },
  }))

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Employees</h2>
        <p className="text-sm text-muted-foreground">
          Personnel records and the accounts they sign in with.
        </p>
      </div>

      <StaffCards
        staff={staff}
        currentAccountId={session.accountId}
        currentRole={session.role}
        suggestedEmployeeNo={suggestedEmployeeNo}
      />
    </div>
  )
}
