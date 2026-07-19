import type { Role } from "@/app/generated/prisma/client"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AppSidebar } from "@/components/dashboard/app-sidebar"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"

export function DashboardShell({
  role,
  employeeName,
  children,
}: {
  role: Role
  employeeName: string
  children: React.ReactNode
}) {
  return (
    <SidebarProvider>
      <TooltipProvider delay={300}>
        <AppSidebar />
        <SidebarInset>
          <DashboardHeader employeeName={employeeName} role={role} />
          <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
            {children}
          </div>
        </SidebarInset>
      </TooltipProvider>
    </SidebarProvider>
  )
}
