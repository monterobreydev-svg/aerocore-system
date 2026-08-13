import { Skeleton } from "@/components/ui/skeleton"
import {
  HeaderSkeleton,
  StatsSkeleton,
  TableSkeleton,
} from "@/components/ui/page-skeleton"

export default function Loading() {
  return (
    <div className="flex flex-col gap-5">
      <HeaderSkeleton />

      {/* Day / Timesheet / Overtime tabs, plus the day stepper. */}
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="ml-auto h-9 w-40" />
      </div>

      <StatsSkeleton />
      <TableSkeleton rows={8} columns={4} />
    </div>
  )
}
