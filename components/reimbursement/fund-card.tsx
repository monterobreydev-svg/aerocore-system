"use client"

import { Plus } from "lucide-react"
import { peso } from "@/lib/reimbursement"
import { Button } from "@/components/ui/button"

function releaseDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

// The one number an employee actually wants: how much of the working fund is
// still in their hands. Underneath sits *when* the office last topped them up
// and how much they've already accounted for — the two facts that explain the
// figure without turning it into a ledger.
export function FundCard({
  released,
  liquidated,
  lastReleasedAt,
  onStart,
}: {
  released: number
  liquidated: number
  lastReleasedAt: string | null
  onStart: () => void
}) {
  const remaining = released - liquidated

  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-sky-950 to-cyan-950 p-5 text-sky-50 ring-1 ring-sky-400/15">
        {/* Soft off-centre glow, the only decoration — keeps the card from
            reading as a flat block without competing with the figure. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-cyan-400/10 blur-2xl"
        />

        <p className="relative text-xs font-medium tracking-widest text-sky-300/80 uppercase">
          Remaining fund
        </p>
        <p className="relative mt-1 flex items-baseline gap-1 font-semibold tabular-nums">
          <span className="text-xl text-sky-300/80">₱</span>
          <span className="text-4xl leading-none tracking-tight">
            {remaining.toLocaleString("en-PH", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </p>

        <div className="relative mt-4 grid grid-cols-2 gap-4 border-t border-sky-100/15 pt-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium tracking-widest text-sky-300/70 uppercase">
              Last released
            </p>
            <p className="mt-0.5 truncate text-sm font-medium">
              {lastReleasedAt ? (
                releaseDate(lastReleasedAt)
              ) : (
                <span className="text-sky-100/60">No fund released yet</span>
              )}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium tracking-widest text-sky-300/70 uppercase">
              Liquidated
            </p>
            <p className="mt-0.5 truncate text-sm font-medium tabular-nums">
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
