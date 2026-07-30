"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { EMPLOYEE_NAV } from "@/components/dashboard/nav-items"

export function MobileTabBar() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 bg-[linear-gradient(to_top,color-mix(in_oklab,var(--brand)_9%,transparent),color-mix(in_oklab,var(--brand)_4%,transparent))] pb-[env(safe-area-inset-bottom)] backdrop-blur-md before:pointer-events-none before:absolute before:inset-x-0 before:-top-px before:h-px before:bg-gradient-to-r before:from-transparent before:via-brand/35 before:to-transparent md:hidden"
      aria-label="Bottom navigation"
    >
      <div className="grid grid-cols-5">
        {EMPLOYEE_NAV.map((item) => {
          const isActive =
            item.url === pathname ||
            (item.url !== "/employee" && pathname.startsWith(item.url))

          return (
            <Link
              key={item.url}
              href={item.url}
              className={cn(
                "relative flex flex-col items-center gap-1 py-2.5 text-[0.6875rem] font-medium text-muted-foreground transition-colors",
                // A short bar at the top of the active tab: on a phone the
                // colour alone is easy to miss with a thumb over it.
                isActive &&
                  "text-brand before:absolute before:top-0 before:h-0.5 before:w-8 before:rounded-full before:bg-brand"
              )}
            >
              <item.icon
                className={cn("size-5", isActive && "fill-brand/15")}
              />
              <span>{item.title}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
