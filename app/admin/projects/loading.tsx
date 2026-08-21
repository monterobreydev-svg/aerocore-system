import { Skeleton } from "@/components/ui/skeleton"
import { HeaderSkeleton } from "@/components/ui/page-skeleton"

export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <HeaderSkeleton />
      <Skeleton className="h-28 w-full rounded-xl" />
    </div>
  )
}
