"use client"

import Image from "next/image"
import Link from "next/link"
import {
  ChevronDown,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Settings,
} from "lucide-react"
import { logout } from "@/app/actions/auth"
import type { Role } from "@/app/generated/prisma/client"
import { isAdminSideRole, roleLabel } from "@/lib/auth/roles"
import type { InboxItem } from "@/lib/notifications"
import { NotificationBell } from "@/components/dashboard/notification-bell"
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

export function EmployeeHeader({
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
    month: "long",
    day: "numeric",
  })

  return (
    <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-3 border-b bg-background/85 bg-[linear-gradient(to_bottom,color-mix(in_oklab,var(--brand)_9%,transparent),color-mix(in_oklab,var(--brand)_4%,transparent))] px-4 backdrop-blur-md after:pointer-events-none after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-gradient-to-r after:from-transparent after:via-brand/35 after:to-transparent supports-backdrop-filter:bg-background/70 sm:px-6">
      <div className="relative size-8 shrink-0">
        <Image
          src="/logo.png"
          alt="AeroCoole"
          fill
          sizes="32px"
          className="object-contain"
        />
      </div>

      <div className="flex flex-col justify-center leading-tight">
        <span className="text-sm font-semibold">
          {greeting}, {firstName}
        </span>
        <span className="text-xs text-muted-foreground">{today}</span>
      </div>

      <div className="ml-auto flex items-center gap-1">
        {/* The way back for someone who came from the admin console. The
            employee nav has no admin link anywhere else — tab bar and top nav
            are both the same five fixed items — so without this an admin who
            crosses over can only get back by editing the URL. Label collapses
            to the icon on a phone, where the header is already full. */}
        {isAdminSideRole(role) && (
          <Button
            variant="ghost"
            size="lg"
            // It renders as an <a>, so Base UI must not assume native button
            // semantics — otherwise it adds the button role and key handling
            // on top of the link's own, and warns about exactly that.
            nativeButton={false}
            className="gap-1.5 px-2 text-muted-foreground"
            render={
              <Link href="/admin">
                <LayoutDashboard />
                <span className="hidden sm:inline">Admin console</span>
                <span className="sr-only sm:hidden">Admin console</span>
              </Link>
            }
          />
        )}

        <NotificationBell items={notifications} pendingCount={pendingCount} />

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" className="h-9 gap-1.5 rounded-lg px-1.5">
                <Avatar className="size-7 rounded-lg">
                  <AvatarFallback className="rounded-lg bg-gradient-to-br from-brand to-brand-strong text-[0.7rem] font-semibold text-brand-foreground">
                    {initials(employeeName)}
                  </AvatarFallback>
                </Avatar>
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
                <Link href="/employee/settings">
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
                <Link href="/employee/settings?tab=security">
                  <KeyRound />
                  Change password
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
