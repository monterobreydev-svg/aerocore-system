import { Skeleton } from "@/components/ui/skeleton"
import { HeaderSkeleton } from "@/components/ui/page-skeleton"

export default function Loading() {
  return (
    <div className="flex flex-col gap-5">
      <HeaderSkeleton />

      {/* The fund card is the reason anyone opens this page, so its shape is
          the one worth holding still while the numbers arrive. */}
      <div className="flex flex-col gap-3">
        <Skeleton className="h-[13.5rem] w-full rounded-2xl" />
        <Skeleton className="h-11 w-full rounded-md" />
      </div>

      <Skeleton className="h-14 w-full rounded-xl" />

      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-32" />
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-[4.5rem] w-full rounded-xl" />
        ))}
      </div>
    </div>
  )
}
