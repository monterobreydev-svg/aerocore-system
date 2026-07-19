"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRight } from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  ADMIN_NAV,
  isNavCollapsible,
  type NavEntry,
  type NavGroup,
} from "@/components/dashboard/nav-items"
import type { Role } from "@/app/generated/prisma/client"
import { isAdminPathAllowedForRole } from "@/lib/roles"

function filterGroupsForRole(groups: NavGroup[], role: Role): NavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items
        .map((entry): NavEntry | null => {
          if (isNavCollapsible(entry)) {
            const items = entry.items.filter((child) =>
              isAdminPathAllowedForRole(child.url, role)
            )
            return items.length > 0 ? { ...entry, items } : null
          }

          return isAdminPathAllowedForRole(entry.url, role) ? entry : null
        })
        .filter((entry): entry is NavEntry => entry !== null),
    }))
    .filter((group) => group.items.length > 0)
}

const navButtonClassName =
  "rounded-lg px-2.5 py-2 text-[0.9rem] font-medium text-sidebar-foreground/80 transition-colors data-active:bg-sky-600/10 data-active:font-semibold data-active:text-sky-700 data-active:hover:bg-sky-600/10 dark:data-active:bg-sky-500/15 dark:data-active:text-sky-400 dark:data-active:hover:bg-sky-500/15 [&_svg]:size-4 [&_svg]:text-muted-foreground data-active:[&_svg]:text-sky-600 dark:data-active:[&_svg]:text-sky-400"

function isPathActive(url: string, pathname: string) {
  return (
    url === pathname ||
    (url !== "/admin" && url !== "/employee" && pathname.startsWith(url))
  )
}

function NavMenuEntry({
  entry,
  pathname,
}: {
  entry: NavEntry
  pathname: string
}) {
  if (isNavCollapsible(entry)) {
    const isChildActive = entry.items.some((child) =>
      isPathActive(child.url, pathname)
    )

    return (
      <Collapsible defaultOpen={isChildActive} className="group/collapsible">
        <SidebarMenuItem>
          <CollapsibleTrigger
            render={
              <SidebarMenuButton
                isActive={isChildActive}
                tooltip={entry.title}
                className={navButtonClassName}
              >
                <entry.icon />
                <span>{entry.title}</span>
                <ChevronRight className="ml-auto size-4 shrink-0 transition-transform group-data-[panel-open]/collapsible:rotate-90" />
              </SidebarMenuButton>
            }
          />
          <CollapsibleContent>
            <SidebarMenuSub>
              {entry.items.map((child) => (
                <SidebarMenuSubItem key={child.url}>
                  <SidebarMenuSubButton
                    isActive={isPathActive(child.url, pathname)}
                    render={
                      <Link href={child.url}>
                        <child.icon />
                        <span>{child.title}</span>
                      </Link>
                    }
                  />
                </SidebarMenuSubItem>
              ))}
            </SidebarMenuSub>
          </CollapsibleContent>
        </SidebarMenuItem>
      </Collapsible>
    )
  }

  const isActive = isPathActive(entry.url, pathname)

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={isActive}
        tooltip={entry.title}
        className={navButtonClassName}
        render={
          <Link href={entry.url}>
            <entry.icon />
            <span>{entry.title}</span>
          </Link>
        }
      />
    </SidebarMenuItem>
  )
}

export function AppSidebar({ role }: { role: Role }) {
  const pathname = usePathname()
  const groups = filterGroupsForRole(ADMIN_NAV, role)

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-16 flex-row items-center border-b px-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="rounded-lg hover:bg-transparent active:bg-transparent"
              render={
                <Link href="/">
                  <div className="relative size-9 shrink-0">
                    <Image
                      src="/logo.png"
                      alt="AeroCoole"
                      fill
                      sizes="36px"
                      className="object-contain"
                    />
                  </div>
                  <span className="font-heading text-lg font-semibold tracking-tight">
                    AeroCoole
                  </span>
                </Link>
              }
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="gap-1 px-1 py-2">
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="px-2 text-[0.6875rem] font-semibold tracking-wider text-muted-foreground/70 uppercase">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((entry) => (
                  <NavMenuEntry
                    key={entry.title}
                    entry={entry}
                    pathname={pathname}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  )
}
