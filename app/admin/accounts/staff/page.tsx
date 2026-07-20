import { Users, UserCheck, UserX, ShieldCheck } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { verifySession } from "@/lib/session"
import { CreateStaffDialog } from "@/components/admin/create-staff-dialog"
import { StaffTable, type StaffMember } from "@/components/admin/staff-table"
import { Card, CardContent } from "@/components/ui/card"

export default async function StaffPage() {
  const session = await verifySession()

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
      position: account.employee.position,
      hourlyRate: Number(account.employee.hourlyRate),
      skills: account.employee.skills,
      emergencyContactPerson: account.employee.emergencyContactPerson,
      emergencyContactNo: account.employee.emergencyContactNo,
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

  const activeCount = staff.filter((member) => member.isActive).length
  const stats = [
    { label: "Total staff", value: staff.length, icon: Users },
    { label: "Active", value: activeCount, icon: UserCheck },
    { label: "Inactive", value: staff.length - activeCount, icon: UserX },
    {
      label: "Directors & admins",
      value: staff.filter((m) => m.role === "DIRECTOR" || m.role === "ADMINISTRATOR").length,
      icon: ShieldCheck,
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Staff</h2>
          <p className="text-sm text-muted-foreground">
            Employees with a login account.
          </p>
        </div>
        <CreateStaffDialog currentRole={session.role} />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="shadow-sm">
            <CardContent className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-semibold">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
              <div className="flex size-9 items-center justify-center rounded-lg bg-sky-600/10">
                <stat.icon className="size-4.5 text-sky-600 dark:text-sky-400" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <StaffTable
        staff={staff}
        currentAccountId={session.accountId}
        currentRole={session.role}
      />
    </div>
  )
}
