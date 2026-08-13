"use client"

import Link from "next/link"
import { ChevronDown, KeyRound, LogOut, Settings, UserRound } from "lucide-react"
import { logout } from "@/app/actions/auth"
import type { Role } from "@/app/generated/prisma/client"
import { roleLabel } from "@/lib/roles"
import type { InboxItem } from "@/lib/notifications"
import { NotificationBell } from "@/components/dashboard/notification-bell"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

function greetingForHour(hour: number) {
  if (hour < 12) return "Good morning"
  if (hour < 18) return "Good afternoon"
  return "Good evening"
}

export function DashboardHeader({
  employeeName,
  role,
  notifications,
  pendingCount,
}: {
  employeeName: string
  role: Role
  notifications: InboxItem[]
  pendingCount: number
}) {
  const firstName = employeeName.split(" ")[0]
  const now = new Date()
  const greeting = greetingForHour(now.getHours())
  const today = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  return (
    // Two layers: the translucent page colour keeps the blur working, and a
    // faint brand veil over it gives the bar its own cool cast without tinting
    // the content below. The hairline picks up the hue in the middle and fades at
    // both ends, so it reads as part of the shell rather than a grey rule.
    <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-3 border-b bg-background/85 bg-[linear-gradient(to_bottom,color-mix(in_oklab,var(--brand)_9%,transparent),color-mix(in_oklab,var(--brand)_4%,transparent))] px-4 backdrop-blur-md after:pointer-events-none after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-gradient-to-r after:from-transparent after:via-brand/35 after:to-transparent supports-backdrop-filter:bg-background/70 sm:px-6">
      <SidebarTrigger className="-ml-1 rounded-lg" />
      <Separator orientation="vertical" className="h-5" />

      <div className="flex flex-col justify-center leading-tight">
        <span className="text-sm font-semibold sm:text-base">
          {greeting}, {firstName}
        </span>
        <span className="hidden text-xs text-muted-foreground sm:block">
          {today}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <NotificationBell items={notifications} pendingCount={pendingCount} />

        <Separator orientation="vertical" className="h-5" />

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                className="h-9 gap-2 rounded-lg px-1.5 pr-2"
              >
                <Avatar className="size-7 rounded-lg">
                  <AvatarFallback className="rounded-lg bg-gradient-to-br from-brand to-brand-strong text-[0.7rem] font-semibold text-brand-foreground">
                    {initials(employeeName)}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden max-w-32 truncate text-sm font-medium sm:inline">
                  {employeeName}
                </span>
                <ChevronDown className="size-3.5 text-muted-foreground" />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col">
                  <span className="truncate text-sm font-medium">
                    {employeeName}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {roleLabel(role)}
                  </span>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              render={
                <Link href="/admin/settings">
                  <Settings />
                  Account settings
                </Link>
              }
            />
            {/* Same page, Security tab — the password form lives in settings
                rather than the menu, but it's the errand people come to this
                menu for, so it gets its own way in. */}
            <DropdownMenuItem
              render={
                <Link href="/admin/settings?tab=security">
                  <KeyRound />
                  Change password
                </Link>
              }
            />
            <DropdownMenuSeparator />
            {/* Admins are employees too, on the same single account — this is
                where they go to file their own claims and read their own
                payslips, rather than being issued a second login. */}
            <DropdownMenuItem
              render={
                <Link href="/employee">
                  <UserRound />
                  My employee portal
                </Link>
              }
            />
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => logout()}>
              <LogOut />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
