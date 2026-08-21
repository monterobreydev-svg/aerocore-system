import type { LucideIcon } from "lucide-react"
import {
  BarChart3,
  Building2,
  CalendarCheck,
  CalendarDays,
  Clock,
  FileText,
  FolderKanban,
  Home,
  LayoutDashboard,
  Receipt,
  UserCog,
  Users,
  Wallet,
} from "lucide-react"

export type NavItem = {
  title: string
  url: string
  icon: LucideIcon
}

export type NavCollapsible = {
  title: string
  icon: LucideIcon
  items: NavItem[]
}

export type NavEntry = NavItem | NavCollapsible

export function isNavCollapsible(entry: NavEntry): entry is NavCollapsible {
  return "items" in entry
}

export type NavGroup = {
  label: string
  items: NavEntry[]
}

export const ADMIN_NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [{ title: "Dashboard", url: "/admin", icon: LayoutDashboard }],
  },
  {
    label: "Workforce",
    items: [
      { title: "Attendance", url: "/admin/attendance", icon: CalendarCheck },
      { title: "Schedules", url: "/admin/schedules", icon: CalendarDays },
      { title: "Projects", url: "/admin/projects", icon: FolderKanban },
      {
        title: "Accounts",
        icon: Users,
        items: [
          { title: "Staff", url: "/admin/accounts/staff", icon: UserCog },
          { title: "Clients", url: "/admin/accounts/clients", icon: Building2 },
        ],
      },
    ],
  },
  {
    label: "Finance",
    items: [
      { title: "Payroll", url: "/admin/payroll", icon: Wallet },
      { title: "Reimbursements", url: "/admin/reimbursements", icon: Receipt },
    ],
  },
  {
    label: "Insights",
    items: [
      { title: "Documents", url: "/admin/documents", icon: FileText },
      { title: "Reports", url: "/admin/reports", icon: BarChart3 },
    ],
  },
]

// Flat, not grouped: the employee side is designed as a phone-first app with a
// bottom tab bar (see MobileTabBar/EmployeeTopNav), so this list should stay
// short — five items is about the practical limit for a tab bar.
export const EMPLOYEE_NAV: NavItem[] = [
  { title: "Home", url: "/employee", icon: Home },
  { title: "Attendance", url: "/employee/attendance", icon: Clock },
  { title: "Schedule", url: "/employee/schedule", icon: CalendarDays },
  { title: "Payroll", url: "/employee/payslips", icon: Wallet },
  { title: "Expenses", url: "/employee/reimbursements", icon: Receipt },
]
