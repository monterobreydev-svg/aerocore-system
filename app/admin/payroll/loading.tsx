import { Skeleton } from "@/components/ui/skeleton"
import { HeaderSkeleton, TableSkeleton } from "@/components/ui/page-skeleton"

// Shaped like the page: the period pager, the four totals, then the roster.
export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <HeaderSkeleton />

      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-64 rounded-lg" />
        <Skeleton className="ml-auto h-8 w-full rounded-lg sm:w-56" />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-lg border px-3 py-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-2 h-5 w-24" />
          </div>
        ))}
      </div>

      <TableSkeleton rows={8} columns={5} />
    </div>
  )
}
