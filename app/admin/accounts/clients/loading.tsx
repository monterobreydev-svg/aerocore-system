import { Skeleton } from "@/components/ui/skeleton"
import { CardGridSkeleton, HeaderSkeleton } from "@/components/ui/page-skeleton"

export default function Loading() {
  return (
    <div className="flex flex-col gap-5">
      <HeaderSkeleton />

      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-full max-w-xs" />
        <Skeleton className="ml-auto h-9 w-28" />
      </div>

      <CardGridSkeleton cards={9} />
    </div>
  )
}
