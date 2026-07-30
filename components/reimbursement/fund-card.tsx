"use client"

import { Plus } from "lucide-react"
import { peso } from "@/lib/reimbursement"
import { Button } from "@/components/ui/button"

// The one number an employee actually wants: how much of the working fund is
// still in their hands. Released and liquidated sit underneath as the working
// that produced it, so the figure is never a black box.
export function FundCard({
  released,
  liquidated,
  onStart,
}: {
  released: number
  liquidated: number
  onStart: () => void
}) {
  const remaining = released - liquidated

  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-2xl bg-teal-950 p-5 text-teal-50 dark:bg-teal-950">
        {/* Soft off-centre glow, the only decoration — keeps the card from
            reading as a flat block without competing with the figure. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-teal-400/10 blur-2xl"
        />

        <p className="relative text-xs font-medium tracking-widest text-teal-300/80 uppercase">
          Remaining fund
        </p>
        <p className="relative mt-1 flex items-baseline gap-1 font-semibold tabular-nums">
          <span className="text-xl text-teal-300/80">₱</span>
          <span className="text-4xl leading-none tracking-tight">
            {remaining.toLocaleString("en-PH", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </p>

        <div className="relative mt-4 grid grid-cols-2 gap-4 border-t border-teal-100/15 pt-3">
          <div>
            <p className="text-[11px] font-medium tracking-widest text-teal-300/70 uppercase">
              Released
            </p>
            <p className="mt-0.5 text-sm font-medium tabular-nums">
              {peso(released)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium tracking-widest text-teal-300/70 uppercase">
              Liquidated
            </p>
            <p className="mt-0.5 text-sm font-medium tabular-nums">
              {peso(liquidated)}
            </p>
          </div>
        </div>
      </div>

      <Button type="button" size="lg" className="w-full" onClick={onStart}>
        <Plus />
        Start today&apos;s liquidation
      </Button>
    </div>
  )
}
