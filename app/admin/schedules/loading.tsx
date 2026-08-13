import { Skeleton } from "@/components/ui/skeleton"
import {
  CalendarSkeleton,
  HeaderSkeleton,
} from "@/components/ui/page-skeleton"

export default function Loading() {
  return (
    <div className="flex flex-col gap-5">
      <HeaderSkeleton />

      {/* Toolbar: month stepper, view switcher, new-schedule button. */}
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-9 w-32" />
        <Skeleton className="ml-auto h-9 w-32" />
      </div>

      {/* The work-type colour key. */}
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 7 }).map((_, index) => (
          <Skeleton key={index} className="h-5 w-20 rounded-full" />
        ))}
      </div>

      <CalendarSkeleton />
    </div>
  )
}
