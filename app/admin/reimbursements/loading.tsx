import { Skeleton } from "@/components/ui/skeleton"
import { HeaderSkeleton, TableSkeleton } from "@/components/ui/page-skeleton"

export default function Loading() {
  return (
    <div className="flex flex-col gap-5">
      <HeaderSkeleton />

      {/* Queue / Funds tabs. */}
      <Skeleton className="h-9 w-48" />

      <TableSkeleton rows={6} columns={4} />
    </div>
  )
}
