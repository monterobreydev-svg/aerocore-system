import { Users, UserCheck, UserX, ShieldCheck } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { verifySession } from "@/lib/session"
import { cn } from "@/lib/utils"
import { CreateStaffDialog } from "@/components/admin/create-staff-dialog"
import { StaffCards, type StaffMember } from "@/components/admin/staff-cards"
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
    {
      label: "Total staff",
      value: staff.length,
      icon: Users,
      color: "text-slate-600 dark:text-slate-400",
      bg: "bg-slate-600/10",
    },
    {
      label: "Active",
      value: activeCount,
      icon: UserCheck,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-600/10",
    },
    {
      label: "Inactive",
      value: staff.length - activeCount,
      icon: UserX,
      color: "text-rose-600 dark:text-rose-400",
      bg: "bg-rose-600/10",
    },
    {
      label: "Directors & admins",
      value: staff.filter((m) => m.role === "DIRECTOR" || m.role === "ADMINISTRATOR").length,
      icon: ShieldCheck,
      color: "text-violet-600 dark:text-violet-400",
      bg: "bg-violet-600/10",
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

      <Card className="shadow-sm" size="sm">
        <CardContent className="grid grid-cols-2 divide-y divide-border sm:grid-cols-4 sm:divide-x sm:divide-y-0">
          {stats.map((stat, index) => (
            <div
              key={stat.label}
              className={cn(
                "flex items-center gap-3 py-3 sm:px-4 sm:py-0",
                index === 0 && "sm:pl-0",
                index === stats.length - 1 && "sm:pr-0"
              )}
            >
              <div
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-lg",
                  stat.bg
                )}
              >
                <stat.icon className={cn("size-4.5", stat.color)} />
              </div>
              <div>
                <p className="text-xl leading-none font-semibold">
                  {stat.value}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {stat.label}
                </p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <StaffCards
        staff={staff}
        currentAccountId={session.accountId}
        currentRole={session.role}
      />
    </div>
  )
}
