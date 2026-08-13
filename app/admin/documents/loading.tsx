import { Skeleton } from "@/components/ui/skeleton"
import {
  CardGridSkeleton,
  HeaderSkeleton,
  StatsSkeleton,
} from "@/components/ui/page-skeleton"

export default function Loading() {
  return (
    <div className="flex flex-col gap-5">
      <HeaderSkeleton />
      <Skeleton className="h-10 w-full rounded-md" />
      <StatsSkeleton count={3} />
      <Skeleton className="h-4 w-56" />
      <CardGridSkeleton />
    </div>
  )
}
