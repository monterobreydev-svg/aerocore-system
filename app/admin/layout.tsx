import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { getCurrentEmployee } from "@/lib/dal"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { firstName, lastName, role } = await getCurrentEmployee()

  return (
    <DashboardShell role={role} employeeName={`${firstName} ${lastName}`}>
      {children}
    </DashboardShell>
  )
}
