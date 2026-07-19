"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { EMPLOYEE_NAV } from "@/components/dashboard/nav-items"

export function MobileTabBar() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden"
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
                "flex flex-col items-center gap-1 py-2.5 text-[0.6875rem] font-medium text-muted-foreground transition-colors",
                isActive && "text-sky-600 dark:text-sky-400"
              )}
            >
              <item.icon
                className={cn("size-5", isActive && "fill-sky-600/15")}
              />
              <span>{item.title}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
