import { Skeleton } from "@/components/ui/skeleton"
import { HeaderSkeleton } from "@/components/ui/page-skeleton"

export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <HeaderSkeleton />

      {/* The period bar: steppers, the range control, the download. */}
      <div className="flex items-center gap-2 border-b pb-2.5">
        <Skeleton className="size-9 rounded-lg" />
        <Skeleton className="h-9 w-56 rounded-lg" />
        <Skeleton className="size-9 rounded-lg" />
        <Skeleton className="ml-auto h-9 w-36 rounded-lg" />
      </div>

      {/* The sheet — one container, so the skeleton is one too rather than a
          scatter of boxes that the real page never becomes. */}
      <div className="overflow-hidden rounded-2xl border">
        <div className="bg-muted/30 px-4 py-6 sm:px-6">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="mt-3 h-6 w-56" />
          <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-6 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index}>
                <Skeleton className="h-[3px] w-7 rounded-full" />
                <Skeleton className="mt-2.5 h-3 w-20" />
                <Skeleton className="mt-2 h-7 w-24" />
                <Skeleton className="mt-2 h-3 w-28" />
              </div>
            ))}
          </div>
        </div>

        {["01", "02"].map((index) => (
          <div key={index} className="border-t px-4 py-6 sm:px-6">
            <div className="flex items-center gap-3">
              <Skeleton className="h-3 w-4" />
              <Skeleton className="h-3 w-24" />
              <span className="h-px flex-1 bg-border" />
            </div>
            <Skeleton className="mt-5 h-44 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  )
}
