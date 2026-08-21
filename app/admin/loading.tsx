import { Skeleton } from "@/components/ui/skeleton"

// Shaped like the overview: the dark banner, then the two columns of panels.
// It matches the real page's proportions — same corner radius, same gaps, same
// column widths — so the switch is a fill rather than a jolt.

/** A panel-shaped placeholder: the title bar, then whatever fills it. */
function PanelSkeleton({
  children,
  className,
}: {
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex items-center gap-3 border-b px-4 py-3 sm:px-5">
        <Skeleton className="size-8 shrink-0 rounded-[0.625rem]" />
        <div className="min-w-0 flex-1">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="mt-1.5 h-3 w-40 max-w-full" />
        </div>
      </div>
      <div className={className ?? "px-4 py-4 sm:px-5"}>{children}</div>
    </div>
  )
}

export default function Loading() {
  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      {/* The banner. Its own surface rather than a skeleton, because the colour
          is the thing that lands first and it is known before the data is. */}
      <div className="rounded-2xl bg-sidebar px-4 py-5 sm:px-6 sm:py-6">
        <Skeleton className="h-3 w-14 bg-white/10" />
        <Skeleton className="mt-2.5 h-6 w-56 max-w-full bg-white/15" />
        <Skeleton className="mt-2 h-3 w-40 max-w-full bg-white/10" />
        <Skeleton className="mt-6 h-2 w-full bg-white/10" />
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-5 sm:gap-x-6">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index}>
              <Skeleton className="h-6 w-10 bg-white/15" />
              <Skeleton className="mt-2.5 h-3 w-16 bg-white/10" />
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
          <PanelSkeleton>
            <div className="flex flex-col gap-2.5">
              {Array.from({ length: 7 }).map((_, index) => (
                <div key={index} className="flex items-center gap-3">
                  <Skeleton className="h-3 w-[5.5rem] shrink-0 sm:w-[8.5rem]" />
                  {/* Staggered, so the placeholder reads as a day filling up
                      and emptying out rather than as seven identical bars. */}
                  <Skeleton
                    className="h-2 min-w-0 flex-1 rounded-full"
                    style={{ maxWidth: `${94 - index * 8}%` }}
                  />
                </div>
              ))}
            </div>
          </PanelSkeleton>

          <PanelSkeleton className="divide-y">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="flex gap-4 px-4 py-3 sm:px-5">
                <Skeleton className="h-8 w-12 shrink-0 sm:w-14" />
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-3.5 w-40 max-w-full" />
                  <Skeleton className="mt-2 h-3 w-56 max-w-full" />
                </div>
              </div>
            ))}
          </PanelSkeleton>

          <PanelSkeleton>
            <div className="flex items-end gap-2">
              {[64, 40, 76, 52, 88, 32, 60].map((height, index) => (
                <Skeleton
                  key={index}
                  className="min-w-0 flex-1 rounded-[3px]"
                  style={{ height }}
                />
              ))}
            </div>
          </PanelSkeleton>
        </div>

        <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
          <PanelSkeleton className="divide-y">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <Skeleton className="size-8 shrink-0 rounded-[0.625rem]" />
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-3.5 w-32 max-w-full" />
                  <Skeleton className="mt-2 h-3 w-44 max-w-full" />
                </div>
              </div>
            ))}
          </PanelSkeleton>

          <PanelSkeleton>
            <div className="flex items-center gap-4">
              <Skeleton className="size-[68px] shrink-0 rounded-full" />
              <div className="min-w-0 flex-1">
                <Skeleton className="h-4 w-16 rounded-full" />
                <Skeleton className="mt-2.5 h-6 w-28 max-w-full" />
                <Skeleton className="mt-2 h-3 w-32 max-w-full" />
              </div>
            </div>
            <Skeleton className="mt-6 h-2 w-full rounded-full" />
          </PanelSkeleton>

          <PanelSkeleton>
            <Skeleton className="h-6 w-24" />
            <Skeleton className="mt-3 h-3 w-40 max-w-full" />
          </PanelSkeleton>
        </div>
      </div>
    </div>
  )
}
