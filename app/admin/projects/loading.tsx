import { Skeleton } from "@/components/ui/skeleton"
import { HeaderSkeleton, StatsSkeleton } from "@/components/ui/page-skeleton"

export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <HeaderSkeleton />

      {/* The filter bar: year, client, search, add. */}
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-28 rounded-lg" />
        <Skeleton className="h-9 w-56 rounded-lg" />
        <Skeleton className="h-9 w-64 rounded-lg" />
        <Skeleton className="ml-auto h-9 w-32 rounded-lg" />
      </div>

      {/* The yearly summary, then a month of the ledger. */}
      <StatsSkeleton count={5} />

      <div className="overflow-hidden rounded-xl border">
        <div className="border-b bg-muted/30 px-3 py-2">
          <Skeleton className="h-4 w-32" />
        </div>
        {Array.from({ length: 4 }).map((_, row) => (
          <div
            key={row}
            className="flex items-center gap-3 border-b p-3 last:border-b-0"
            style={{ opacity: 1 - row * 0.15 }}
          >
            <Skeleton className="h-3 w-14 shrink-0" />
            <Skeleton className="h-3 w-[min(16rem,40%)]" />
            <Skeleton className="ml-auto hidden h-3 w-24 shrink-0 sm:block" />
            <Skeleton className="hidden h-3 w-24 shrink-0 sm:block" />
          </div>
        ))}
      </div>
    </div>
  )
}
