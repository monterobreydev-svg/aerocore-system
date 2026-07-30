"use client"

import { useEffect, useState } from "react"
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
  type NavCollapsible,
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

// Active is a brand-tinted panel with a cyan bar flush to its left edge; hover is
// a neutral lift. Two different signals, so "where I am" never looks like "where
// my mouse is" — which a single grey highlight can't distinguish.
const navButtonClassName = [
  "relative rounded-lg px-2.5 py-2 text-[0.9rem] font-medium text-sidebar-foreground/75 transition-colors",
  "hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
  "data-active:bg-sidebar-primary/15 data-active:font-semibold data-active:text-sidebar-primary data-active:hover:bg-sidebar-primary/20",
  "data-active:before:absolute data-active:before:top-1/2 data-active:before:left-0 data-active:before:h-4.5 data-active:before:w-[3px] data-active:before:-translate-y-1/2 data-active:before:rounded-r-full data-active:before:bg-sidebar-primary",
  // The bar would land on top of the icon once the rail is down to 3rem.
  "group-data-[collapsible=icon]:before:hidden",
  "[&_svg]:size-4 [&_svg]:text-sidebar-foreground/55 data-active:[&_svg]:text-sidebar-primary",
].join(" ")

const subNavButtonClassName =
  "text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-foreground data-active:bg-sidebar-primary/12 data-active:font-medium data-active:text-sidebar-primary [&>svg]:text-sidebar-foreground/50 data-active:[&>svg]:text-sidebar-primary"

function isPathActive(url: string, pathname: string) {
  return (
    url === pathname ||
    (url !== "/admin" && url !== "/employee" && pathname.startsWith(url))
  )
}

function CollapsibleNavEntry({
  entry,
  pathname,
}: {
  entry: NavCollapsible
  pathname: string
}) {
  const isChildActive = entry.items.some((child) =>
    isPathActive(child.url, pathname)
  )
  const [open, setOpen] = useState(isChildActive)

  // Auto-expand when navigation lands on one of this section's own pages
  // (e.g. following a link straight to /admin/accounts/staff). Doesn't
  // force-close when navigating away — that stays under the user's control.
  useEffect(() => {
    if (isChildActive) setOpen(true)
  }, [isChildActive])

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="group/collapsible"
    >
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
                  className={subNavButtonClassName}
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

function NavMenuEntry({
  entry,
  pathname,
}: {
  entry: NavEntry
  pathname: string
}) {
  if (isNavCollapsible(entry)) {
    return <CollapsibleNavEntry entry={entry} pathname={pathname} />
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
      <SidebarHeader className="h-16 flex-row items-center border-b border-sidebar-border/60 px-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="rounded-lg hover:bg-transparent active:bg-transparent"
              render={
                <Link href="/">
                  {/* The logo is a dark-on-light mark, so it needs a lit tile to
                      sit on now that the rail is navy. */}
                  <div className="relative flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/90 ring-1 ring-white/25">
                    <Image
                      src="/logo.png"
                      alt="AeroCoole"
                      fill
                      sizes="36px"
                      className="object-contain p-1"
                    />
                  </div>
                  <span className="flex min-w-0 flex-col">
                    <span className="font-heading truncate text-lg leading-none font-semibold tracking-tight text-sidebar-foreground">
                      Aero
                      <span className="text-sidebar-primary">Coole</span>
                    </span>
                    <span className="mt-1 truncate text-[0.625rem] font-medium tracking-[0.16em] text-sidebar-foreground/45 uppercase">
                      Admin console
                    </span>
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
            <SidebarGroupLabel className="px-2 text-[0.6875rem] font-semibold tracking-wider text-sidebar-foreground/45 uppercase">
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
