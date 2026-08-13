import { Skeleton } from "@/components/ui/skeleton"

// ---------------------------------------------------------------------------
// What a page looks like while its data is still in flight
// ---------------------------------------------------------------------------
//
// These are not decoration. A route's `loading.tsx` is what Next streams the
// instant a link is clicked, so the shell — sidebar, header, page title — paints
// immediately and the browser stops looking frozen while Postgres works. The
// difference on a slow connection is the difference between "this app is quick"
// and "did my tap register".
//
// They are shaped like the real content on purpose: matching the heading, the
// stat row, the table's column count. A skeleton that doesn't match its page
// causes a visible jolt when the data lands, which is worse than no skeleton.

/** Page title and its one-line description. */
export function HeaderSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-4 w-72 max-w-full" />
    </div>
  )
}

/** A row of summary tiles, as on Documents and the attendance record. */
export function StatsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="rounded-xl border p-3">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-2.5 h-6 w-12" />
        </div>
      ))}
    </div>
  )
}

/**
 * A list of rows. `columns` controls how many trailing cells are drawn on
 * desktop, matching the table it stands in for.
 */
export function TableSkeleton({
  rows = 8,
  columns = 3,
}: {
  rows?: number
  columns?: number
}) {
  return (
    <div className="overflow-hidden rounded-xl border">
      {Array.from({ length: rows }).map((_, row) => (
        <div
          key={row}
          className="flex items-center gap-3 border-b p-3 last:border-b-0"
          // Each row a little fainter than the last, so the list reads as
          // receding into the fold rather than as eight identical bars.
          style={{ opacity: 1 - row * (0.5 / rows) }}
        >
          <Skeleton className="size-8 shrink-0 rounded-lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-[min(14rem,60%)]" />
            <Skeleton className="h-3 w-[min(9rem,40%)]" />
          </div>
          {Array.from({ length: columns - 1 }).map((_, cell) => (
            <Skeleton key={cell} className="hidden h-3 w-24 shrink-0 sm:block" />
          ))}
        </div>
      ))}
    </div>
  )
}

/** A grid of cards — the staff list, the client list, the folder tiles. */
export function CardGridSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: cards }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-xl border p-3">
          <Skeleton className="size-9 shrink-0 rounded-lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** The month grid, which is the schedules page's first paint. */
export function CalendarSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
      <div className="grid grid-cols-7 border-b bg-muted/40">
        {Array.from({ length: 7 }).map((_, index) => (
          <div key={index} className="flex justify-center px-2 py-2">
            <Skeleton className="h-3 w-8" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {Array.from({ length: 35 }).map((_, index) => (
          <div
            key={index}
            className="min-h-[4.5rem] border-b border-l p-1.5 first:border-l-0 sm:min-h-[7rem]"
          >
            <Skeleton className="size-5 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
