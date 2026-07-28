import type { Role } from "@/app/generated/prisma/client"
import { roleLabel } from "@/lib/roles"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

// One colour per role so a list can be scanned without reading every label.
// Deliberately restrained: Director carries the only solid fill — it's the
// rarest and most privileged — while the rest are quiet tints.
const ROLE_BADGE_STYLES: Record<Role, string> = {
  DIRECTOR: "bg-foreground text-background",
  ADMINISTRATOR: "bg-violet-600/10 text-violet-700 dark:text-violet-400",
  ENGINEER: "bg-sky-600/10 text-sky-700 dark:text-sky-400",
  EMPLOYEE: "bg-muted text-muted-foreground",
}

export function RoleBadge({
  role,
  className,
}: {
  role: Role
  className?: string
}) {
  return (
    <Badge className={cn(ROLE_BADGE_STYLES[role], className)}>
      {roleLabel(role)}
    </Badge>
  )
}
