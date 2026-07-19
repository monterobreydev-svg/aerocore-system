"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { EMPLOYEE_NAV } from "@/components/dashboard/nav-items"

export function EmployeeTopNav() {
  const pathname = usePathname()

  return (
    <nav
      className="sticky top-16 z-10 hidden border-b bg-background/80 px-6 backdrop-blur-sm md:block"
      aria-label="Section navigation"
    >
      <div className="flex gap-1">
        {EMPLOYEE_NAV.map((item) => {
          const isActive =
            item.url === pathname ||
            (item.url !== "/employee" && pathname.startsWith(item.url))

          return (
            <Link
              key={item.url}
              href={item.url}
              className={cn(
                "flex items-center gap-2 border-b-2 border-transparent px-3 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                isActive && "border-sky-600 text-sky-700 dark:text-sky-400"
              )}
            >
              <item.icon className="size-4" />
              {item.title}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
