import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { getCurrentEmployee } from "@/lib/dal"
import { requireAdminSide } from "@/lib/auth"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Authoritative gate: the role here comes from the database, not the token,
  // so a demoted or deactivated account loses the admin shell immediately.
  await requireAdminSide()
  const { firstName, lastName, role } = await getCurrentEmployee()

  return (
    <DashboardShell role={role} employeeName={`${firstName} ${lastName}`}>
      {children}
    </DashboardShell>
  )
}
