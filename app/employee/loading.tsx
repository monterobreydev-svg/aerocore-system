import { Skeleton } from "@/components/ui/skeleton"

// Shaped like the real home screen: the hero with its punch button, the two
// lists, then the pair of totals. The button's position is what matters most —
// it must not move when the data lands under a thumb already reaching for it.
export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-2xl border">
        <div className="flex flex-col gap-2.5 p-5">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="border-t p-4">
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border p-4">
        <Skeleton className="h-4 w-24" />
        {Array.from({ length: 2 }).map((_, index) => (
          <Skeleton
            key={index}
            className="h-10 w-full rounded-lg"
            style={{ opacity: 1 - index * 0.25 }}
          />
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="flex flex-col gap-2 rounded-2xl border p-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>
    </div>
  )
}
