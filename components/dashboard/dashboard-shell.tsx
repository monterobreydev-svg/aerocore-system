import type { Role } from "@/app/generated/prisma/client"
import { getNotificationInbox } from "@/lib/db/dal"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AppSidebar } from "@/components/dashboard/app-sidebar"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"

export async function DashboardShell({
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
    <SidebarProvider>
      <TooltipProvider delay={300}>
        <AppSidebar role={role} />
        {/* The content area stays plain white — the blue lives in the bars
            around it, not under the cards. */}
        <SidebarInset>
          <DashboardHeader
            employeeName={employeeName}
            role={role}
            notifications={items}
            pendingCount={pendingCount}
          />
          {/* Gutters scale with the screen. 16px each side of a 360px phone is
              9% of the width spent on nothing — noticeable when the content is
              a table of figures. */}
          <div className="flex flex-1 flex-col gap-4 p-3 sm:p-4 md:p-6">
            {children}
          </div>
        </SidebarInset>
      </TooltipProvider>
    </SidebarProvider>
  )
}
