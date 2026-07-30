"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { EMPLOYEE_NAV } from "@/components/dashboard/nav-items"

export function EmployeeTopNav() {
  const pathname = usePathname()

  return (
    <nav
      // Fainter than the header above it, so the two bars stack as one band.
      className="sticky top-16 z-10 hidden border-b bg-background/85 bg-[linear-gradient(to_bottom,color-mix(in_oklab,var(--brand)_5%,transparent),transparent)] px-6 backdrop-blur-md supports-backdrop-filter:bg-background/70 md:block"
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
                "flex items-center gap-2 border-b-2 border-transparent px-3 py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground",
                isActive && "border-brand text-brand"
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
