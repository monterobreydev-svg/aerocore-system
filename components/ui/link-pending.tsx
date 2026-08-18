"use client"

import { useLinkStatus } from "next/link"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

/**
 * A spinner that appears while the `<Link>` around it is navigating.
 *
 * `loading.tsx` covers moving between routes, but a great deal of navigation in
 * this app stays on one route and only changes the query — page 2 of the
 * documents list, a different folder, another tab, the next day on the
 * timesheet. Those still wait on the server, and without this they wait with no
 * sign that the tap registered, which is what makes people tap again.
 *
 * Must be rendered inside a `<Link>`: `useLinkStatus` reads the status of the
 * nearest one, and returns a permanent `false` anywhere else.
 *
 * The slot is always rendered at a fixed size and only its opacity changes.
 * Mounting a spinner on demand reflows the row it sits in — the link moves out
 * from under the finger at the exact moment it was pressed, which the Next docs
 * call out specifically.
 */
export function LinkPending({ className }: { className?: string }) {
  const { pending } = useLinkStatus()

  return (
    <span
      aria-hidden={!pending}
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center transition-opacity duration-150",
        pending ? "opacity-100" : "opacity-0",
        className
      )}
    >
      {pending && <Spinner className="size-3.5" label="Loading page" />}
    </span>
  )
}

/**
 * A nav item's icon, which becomes a spinner while that item is navigating.
 *
 * The same job as `LinkPending`, for the case where there is nowhere to put an
 * extra spinner: a tab bar item is an icon above a label in a fixed-width
 * column, and adding a slot beside the icon would push the label off centre.
 * Swapping the glyph in place costs no layout at all — the box is the same size
 * before and after — and it points at the tab being waited on rather than at
 * the page in general.
 *
 * Must be rendered inside a `<Link>`; `useLinkStatus` returns a permanent
 * `false` anywhere else.
 */
export function LinkPendingIcon({
  icon: Icon,
  className,
}: {
  icon: React.ElementType
  className?: string
}) {
  const { pending } = useLinkStatus()

  if (pending) {
    return <Spinner className={className} label="Loading page" />
  }
  return <Icon className={className} aria-hidden />
}
