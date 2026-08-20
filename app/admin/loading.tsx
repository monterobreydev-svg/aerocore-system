import { Skeleton } from "@/components/ui/skeleton"

// Shaped like the overview: the date, the run of figures under it, then the
// two columns — the floor's strip on the left, the margin on the right. It
// matches the real page's proportions so the switch is a fill, not a jolt.
export default function Loading() {
  return (
    <div className="flex flex-col gap-7 lg:gap-9">
      <header>
        <Skeleton className="h-6 w-56" />
        <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 border-t pt-5 sm:flex sm:flex-wrap">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="sm:pr-6">
              <Skeleton className="h-7 w-10" />
              <Skeleton className="mt-2 h-3 w-20" />
            </div>
          ))}
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-0 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-8 lg:pr-9">
          <section>
            <Skeleton className="h-3 w-24" />
            <div className="mt-4 flex flex-col gap-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="flex items-center gap-3">
                  <Skeleton className="h-3 w-[5.5rem] shrink-0 sm:w-32" />
                  {/* Staggered, so the placeholder reads as a day filling up
                      rather than as six identical bars. */}
                  <Skeleton
                    className="h-2 min-w-0 flex-1"
                    style={{ maxWidth: `${95 - index * 9}%` }}
                  />
                </div>
              ))}
            </div>
          </section>

          <section>
            <Skeleton className="h-3 w-24" />
            <div className="mt-4 flex flex-col gap-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="flex gap-4">
                  <Skeleton className="h-4 w-12 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <Skeleton className="h-3.5 w-40 max-w-full" />
                    <Skeleton className="mt-2 h-3 w-56 max-w-full" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="min-w-0 border-t pt-7 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-9">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="border-b py-5 first:pt-0">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-3 h-6 w-28" />
              <Skeleton className="mt-2 h-3 w-36 max-w-full" />
            </div>
          ))}
        </aside>
      </div>
    </div>
  )
}
