import { Skeleton } from "@/components/ui/skeleton"

// The tab strip, then the two columns of cards behind it. Shaped like the real
// thing so the tabs don't jump sideways when the account data lands.
export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1.5">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-24 rounded-lg" />
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex flex-col gap-3 rounded-xl border p-4">
            <div className="flex items-center gap-2">
              <Skeleton className="size-4 shrink-0 rounded" />
              <Skeleton className="h-4 w-28" />
            </div>
            <Skeleton className="h-3 w-48 max-w-full" />
            <div className="flex flex-col gap-2 pt-1">
              {Array.from({ length: 3 }).map((_, row) => (
                <div
                  key={row}
                  className="flex items-center justify-between gap-4 border-b pb-2 last:border-b-0"
                >
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-24" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
