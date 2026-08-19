import { EmployeeShell } from "@/components/dashboard/employee-shell"
import { getCurrentEmployee } from "@/lib/db/dal"

export default async function EmployeeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { firstName, lastName, role } = await getCurrentEmployee()

  return (
    <EmployeeShell role={role} employeeName={`${firstName} ${lastName}`}>
      {children}
    </EmployeeShell>
  )
}
