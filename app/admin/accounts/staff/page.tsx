import { prisma } from "@/lib/prisma"
import { requireManager } from "@/lib/auth"
import { nextEmployeeNo } from "@/lib/employee"
import { StaffCards, type StaffMember } from "@/components/admin/staff-cards"

/**
 * Edits shown per person, newest first.
 *
 * The panel they sit in is collapsed by default and scrolls at 20rem, so it was
 * never going to show more than a couple of dozen anyway — the only thing an
 * unbounded query bought was a page that got slower every time somebody
 * corrected a phone number.
 */
const STAFF_EDIT_LOG_LIMIT = 25

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

  // Just the tally per person for the tab badges — every liquidation they've
  // filed whatever its state, and every day they've clocked. The rows
  // themselves are fetched only when the tab is opened, by
  // listEmployeeReimbursements and listEmployeeAttendance.
  const [claimCounts, attendanceCounts] = await Promise.all([
    prisma.reimbursement.groupBy({
      by: ["employeeId"],
      _count: { _all: true },
    }),
    prisma.attendance.groupBy({
      by: ["employeeId"],
      _count: { _all: true },
    }),
  ])
  const claimsByEmployee = new Map(
    claimCounts.map((row) => [row.employeeId, row._count._all])
  )
  const daysByEmployee = new Map(
    attendanceCounts.map((row) => [row.employeeId, row._count._all])
  )

  // Named field by field rather than `include`d.
  //
  // The nested `include` this replaces pulled every column of UserAccount for
  // every account — `passwordHash` among them — plus every column of Employee,
  // plus the *entire* edit history of each person with no ceiling, and then the
  // mapper below threw most of it away. A password hash should never be read
  // into a page's memory to render a name, and an audit log that grows forever
  // is the unbounded relation AGENTS.md rules out.
  const accounts = await prisma.userAccount.findMany({
    select: {
      id: true,
      username: true,
      role: true,
      isActive: true,
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          middleName: true,
          phoneNo: true,
          email: true,
          birthDate: true,
          civilStatus: true,
          address: true,
          employeeNo: true,
          position: true,
          employmentType: true,
          dateHired: true,
          hourlyRate: true,
          allowancePerCutoff: true,
          skills: true,
          emergencyContactPerson: true,
          emergencyContactNo: true,
          emergencyContactRelationship: true,
          tinNo: true,
          sssNo: true,
          philhealthNo: true,
          pagibigNo: true,
          createdAt: true,
          createdBy: {
            select: {
              employee: { select: { firstName: true, lastName: true } },
            },
          },
          editLogs: {
            orderBy: { createdAt: "desc" },
            take: STAFF_EDIT_LOG_LIMIT,
            select: {
              id: true,
              field: true,
              oldValue: true,
              newValue: true,
              createdAt: true,
              editedBy: {
                select: {
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
    claimCount: claimsByEmployee.get(account.employee.id) ?? 0,
    attendanceCount: daysByEmployee.get(account.employee.id) ?? 0,
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
