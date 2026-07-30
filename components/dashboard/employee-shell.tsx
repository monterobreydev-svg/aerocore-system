import type { Role } from "@/app/generated/prisma/client"
import { getNotificationInbox } from "@/lib/dal"
import { EmployeeHeader } from "@/components/dashboard/employee-header"
import { EmployeeTopNav } from "@/components/dashboard/employee-top-nav"
import { MobileTabBar } from "@/components/dashboard/mobile-tab-bar"

export async function EmployeeShell({
  role,
  employeeName,
  children,
}: {
  role: Role
  employeeName: string
  children: React.ReactNode
}) {
  const { items, pendingCount } = await getNotificationInbox()

  return (
    <div className="flex min-h-svh flex-1 flex-col">
      <EmployeeHeader
        employeeName={employeeName}
        role={role}
        notifications={items}
        pendingCount={pendingCount}
      />
      <EmployeeTopNav />
      <main className="flex flex-1 flex-col gap-4 p-4 pb-20 sm:p-6 md:pb-6">
        {children}
      </main>
      <MobileTabBar />
    </div>
  )
}
