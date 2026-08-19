"use client"

import { useState } from "react"
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
  useSidebar,
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
import { isAdminPathAllowedForRole } from "@/lib/auth/roles"
import { LinkPending } from "@/components/ui/link-pending"

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
  // Collapsed, the primitive pins the button to a 2rem square and clips it.
  // Centre the *box* in the rail — never its contents: the icon sits at the
  // left of that square by design, and centring the row slides it out of the
  // clip and drags the middle of the label into view instead.
  "group-data-[collapsible=icon]:mx-auto",
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

/**
 * Dismiss the sidebar after tapping a link — on a phone only.
 *
 * On a phone the sidebar is a sheet covering the page, so leaving it open after
 * a tap hides the very thing that was just navigated to: the page loads behind
 * a panel, and it looks like nothing happened until you find the scrim and
 * dismiss it yourself. On a desktop the rail is permanent furniture and closing
 * it on every click would be maddening, which is why this checks.
 */
function useCloseOnNavigate() {
  const { isMobile, setOpenMobile } = useSidebar()

  return () => {
    if (isMobile) setOpenMobile(false)
  }
}

function CollapsibleNavEntry({
  entry,
  pathname,
}: {
  entry: NavCollapsible
  pathname: string
}) {
  const closeOnNavigate = useCloseOnNavigate()
  const isChildActive = entry.items.some((child) =>
    isPathActive(child.url, pathname)
  )
  const [open, setOpen] = useState(isChildActive)

  // Auto-expand when navigation lands on one of this section's own pages
  // (e.g. following a link straight to /admin/accounts/staff). Doesn't
  // force-close when navigating away — that stays under the user's control.
  //
  // Adjusted during render rather than in an effect: the effect version ran a
  // second render on every navigation into the section and tripped the lint
  // rule against synchronous setState in an effect. Tracking the previous value
  // is what makes this fire on the *transition* into active, not on every
  // render while active — which is what would fight the user's own collapse.
  const [wasChildActive, setWasChildActive] = useState(isChildActive)
  if (isChildActive !== wasChildActive) {
    setWasChildActive(isChildActive)
    if (isChildActive) setOpen(true)
  }

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
                    <Link href={child.url} onClick={closeOnNavigate}>
                      <child.icon />
                      <span>{child.title}</span>
                      <LinkPending className="ml-auto" />
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
  const closeOnNavigate = useCloseOnNavigate()

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
          <Link href={entry.url} onClick={closeOnNavigate}>
            <entry.icon />
            <span>{entry.title}</span>
            {/* A prefetched route skips the pending phase entirely, so this
                only ever shows when the navigation is genuinely waiting. */}
            <LinkPending className="ml-auto" />
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
      {/* A plain link, not a SidebarMenuButton. The button forces a 2rem square
          with its own padding when the rail collapses — sizes meant for a nav
          icon, not a brand mark — and overriding them means fighting `!important`
          in both directions. Without it the header just does what it's told:
          logo centred when collapsed, logo and wordmark when open. */}
      <SidebarHeader className="h-16 flex-row items-center justify-center border-b border-sidebar-border/60 px-4 group-data-[collapsible=icon]:px-0">
        <Link
          href="/"
          className="flex w-full items-center gap-2.5 rounded-lg outline-none group-data-[collapsible=icon]:w-auto"
        >
          {/* The logo is a dark-on-light mark, so it needs a lit tile to sit on
              now that the rail is navy. */}
          <div className="relative flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/90 ring-1 ring-white/25">
            <Image
              src="/logo.png"
              alt="AeroCoole"
              fill
              sizes="36px"
              className="object-contain p-1"
            />
          </div>
          <span className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
            <span className="font-heading truncate text-lg leading-none font-semibold tracking-tight text-sidebar-foreground">
              Aero
              <span className="text-sidebar-primary">Coole</span>
            </span>
            <span className="mt-1 truncate text-[0.625rem] font-medium tracking-[0.16em] text-sidebar-foreground/45 uppercase">
              Admin console
            </span>
          </span>
        </Link>
      </SidebarHeader>

      {/* Collapsed, every horizontal pad has to go: 3rem of rail minus the
          content's px-1 and the group's p-2 left 1.5rem for a 2rem button, which
          is what pushed the icons off centre. */}
      <SidebarContent className="gap-1 px-1 py-2 group-data-[collapsible=icon]:px-0">
        {groups.map((group) => (
          <SidebarGroup
            key={group.label}
            className="group-data-[collapsible=icon]:px-0"
          >
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
