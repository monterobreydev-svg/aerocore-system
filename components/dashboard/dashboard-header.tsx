"use client"

import Link from "next/link"
import { Bell, ChevronDown, KeyRound, LogOut, Settings } from "lucide-react"
import { logout } from "@/app/actions/auth"
import type { Role } from "@/app/generated/prisma/client"
import { roleLabel } from "@/lib/roles"
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
}: {
  employeeName: string
  role: Role
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
  const unreadCount = 0

  return (
    <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-sm sm:px-6">
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
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="relative rounded-lg"
                aria-label="Notifications"
              >
                <Bell className="size-[18px]" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-sky-600" />
                )}
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Notifications</DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <div className="px-2 py-6 text-center text-sm text-muted-foreground">
              You&apos;re all caught up.
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator orientation="vertical" className="h-5" />

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                className="h-9 gap-2 rounded-lg px-1.5 pr-2"
              >
                <Avatar className="size-7 rounded-lg">
                  <AvatarFallback className="rounded-lg bg-sky-600/10 text-sky-700 dark:text-sky-400">
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
