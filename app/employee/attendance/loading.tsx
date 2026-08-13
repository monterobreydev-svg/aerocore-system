import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="flex flex-col gap-5">
      {/* Today's card, with the punch button — the whole reason the page is
          opened, and the part that must not move when the data lands. */}
      <div className="flex flex-col gap-3 rounded-2xl border p-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-12 w-full rounded-md" />
      </div>

      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-28" />
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton
            key={index}
            className="h-14 w-full rounded-xl"
            style={{ opacity: 1 - index * 0.15 }}
          />
        ))}
      </div>
    </div>
  )
}
