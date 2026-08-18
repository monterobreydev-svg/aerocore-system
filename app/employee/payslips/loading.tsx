import { Skeleton } from "@/components/ui/skeleton"

// Six payslips is six payslips' worth of arithmetic on the server — see
// RECENT_RELEASES — so this is one of the slower screens an employee opens, and
// the one where waiting with no feedback is least acceptable: they are usually
// here because they want to check what landed in the bank.
export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>

      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="flex items-center gap-3 rounded-xl border p-4"
            // Fading down the list, so it reads as receding into the fold
            // rather than as three identical placeholders.
            style={{ opacity: 1 - index * 0.25 }}
          >
            <Skeleton className="size-10 shrink-0 rounded-lg" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-40 max-w-full" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-5 w-20 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  )
}
