import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      {/* Today / Month switch. */}
      <Skeleton className="h-8 w-40 rounded-lg" />

      <div>
        <Skeleton className="h-6 w-56" />
        <Skeleton className="mt-1.5 h-4 w-24" />
      </div>

      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="flex gap-3">
            <Skeleton className="h-4 w-14 shrink-0" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-[min(16rem,70%)]" />
              <Skeleton className="h-3 w-[min(10rem,45%)]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
