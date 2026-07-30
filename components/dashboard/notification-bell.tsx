"use client"

import Link from "next/link"
import { useOptimistic, useTransition } from "react"
import { Bell, CalendarClock, Receipt, Trash2, Wallet } from "lucide-react"
import type { NotificationType } from "@/app/generated/prisma/client"
import {
  NOTIFICATION_ACCENT,
  timeAgo,
  type InboxItem,
} from "@/lib/notifications"
import {
  clearNotifications,
  dismissNotification,
} from "@/app/actions/notifications"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const ICONS: Record<NotificationType, typeof Bell> = {
  SCHEDULE_ASSIGNED: CalendarClock,
  LIQUIDATION_SUBMITTED: Receipt,
  FUND_RELEASED: Wallet,
}

// Stable identity so the optimistic reducer's initial state never re-renders
// the list for nothing.
const NONE: ReadonlySet<string> = new Set()

// Sentinel for "clear all", so one reducer covers both paths.
const ALL = "*"

export function NotificationBell({
  items,
  pendingCount,
}: {
  items: InboxItem[]
  pendingCount: number
}) {
  const [, startTransition] = useTransition()

  // Dismissal is one-way, so the optimistic state is append-only: add an id and
  // the row leaves the list at once, then the revalidated layout replaces this
  // with the truth — including whatever was queued behind the eight shown.
  const [dismissed, dismiss] = useOptimistic(
    NONE,
    (state: ReadonlySet<string>, id: string) => new Set(state).add(id)
  )

  const visible = dismissed.has(ALL)
    ? []
    : items.filter((item) => !dismissed.has(item.id))

  // The badge counts everything outstanding, including rows past the eight
  // carried here, so it only drops by what was actually just cleared.
  const pending = dismissed.has(ALL)
    ? 0
    : Math.max(0, pendingCount - (items.length - visible.length))

  function open(item: InboxItem) {
    startTransition(async () => {
      dismiss(item.id)
      await dismissNotification(item.id)
    })
  }

  function clearAll() {
    startTransition(async () => {
      dismiss(ALL)
      await clearNotifications()
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative rounded-lg"
            aria-label={
              pending > 0 ? `Notifications, ${pending} new` : "Notifications"
            }
          >
            <Bell className="size-[18px]" />
            {pending > 0 && (
              <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-sky-600 px-1 text-[10px] leading-none font-semibold text-white tabular-nums">
                {pending > 9 ? "9+" : pending}
              </span>
            )}
          </Button>
        }
      />

      <DropdownMenuContent
        align="end"
        className="w-80 max-w-[calc(100vw-1.5rem)] p-0"
      >
        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
          <p className="text-sm font-semibold">Notifications</p>
          {visible.length > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Trash2 className="size-3.5" />
              Clear all
            </button>
          )}
        </div>

        <DropdownMenuSeparator className="mx-0 my-0" />

        {visible.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">
            You&apos;re all caught up.
          </div>
        ) : (
          <div className="max-h-[min(22rem,60svh)] overflow-y-auto p-1">
            {visible.map((item) => {
              const Icon = ICONS[item.type]

              const inner = (
                <>
                  <span
                    className={cn(
                      "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg",
                      NOTIFICATION_ACCENT[item.type]
                    )}
                  >
                    <Icon className="size-3.5" />
                  </span>

                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm leading-tight font-medium">
                        {item.title}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {timeAgo(item.createdAt)}
                      </span>
                    </span>
                    <span className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground">
                      {item.body}
                    </span>
                  </span>
                </>
              )

              const className = "items-start gap-2.5 rounded-lg px-2 py-2"

              // A notification with somewhere to go is a link, so it can be
              // opened in a new tab and reads as tappable. One without still
              // clears itself, and keeps the list open so several can be
              // cleared in a row.
              return item.href ? (
                <DropdownMenuItem
                  key={item.id}
                  className={className}
                  onClick={() => open(item)}
                  render={<Link href={item.href}>{inner}</Link>}
                />
              ) : (
                <DropdownMenuItem
                  key={item.id}
                  className={className}
                  closeOnClick={false}
                  onClick={() => open(item)}
                >
                  {inner}
                </DropdownMenuItem>
              )
            })}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
