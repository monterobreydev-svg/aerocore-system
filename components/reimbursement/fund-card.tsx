"use client"

import { AlertTriangle, Plus } from "lucide-react"
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
// still in their hands. Underneath sits the arithmetic that produced it —
// everything the office has handed over, less everything already accounted for.
// Without the starting figure the balance is just a number that moves on its
// own; with it, the card explains itself.
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
  const overspent = remaining < 0
  // Clamped so an overspent fund doesn't render a bar wider than its track;
  // the warning line below carries that fact instead.
  const usedPct =
    released > 0 ? Math.min(100, (liquidated / released) * 100) : liquidated > 0 ? 100 : 0

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
            {Math.abs(remaining).toLocaleString("en-PH", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
          {overspent && (
            <span className="text-xs font-medium text-rose-300">short</span>
          )}
        </p>

        {/* Starting fund drained left to right. The bar is the sentence
            "you've used this much of what you were given" said in one glance,
            which is the question the figures below answer in full. */}
        <div
          className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-sky-100/15"
          role="presentation"
        >
          <div
            className={`h-full rounded-full ${overspent ? "bg-rose-400" : "bg-cyan-300"}`}
            style={{ width: `${usedPct}%` }}
          />
        </div>
        <p className="relative mt-1.5 text-[11px] text-sky-100/70">
          {released > 0 ? (
            <>
              {peso(liquidated)} liquidated of {peso(released)} released
            </>
          ) : (
            "No fund has been released to you yet."
          )}
        </p>

        <div className="relative mt-4 grid grid-cols-3 gap-3 border-t border-sky-100/15 pt-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium tracking-wide text-sky-300/70 uppercase">
              Starting fund
            </p>
            <p className="mt-0.5 truncate text-sm font-medium tabular-nums">
              {peso(released)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium tracking-wide text-sky-300/70 uppercase">
              Liquidated
            </p>
            <p className="mt-0.5 truncate text-sm font-medium tabular-nums">
              −{peso(liquidated)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium tracking-wide text-sky-300/70 uppercase">
              Last released
            </p>
            <p className="mt-0.5 truncate text-sm font-medium">
              {lastReleasedAt ? (
                releaseDate(lastReleasedAt)
              ) : (
                <span className="text-sky-100/60">None yet</span>
              )}
            </p>
          </div>
        </div>

        {overspent && (
          <p className="relative mt-3 flex items-start gap-2 rounded-lg bg-rose-500/15 px-2.5 py-1.5 text-[11px] leading-snug text-rose-100">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>
              You&apos;ve liquidated {peso(Math.abs(remaining))} more than the
              fund released to you — that part came out of your own pocket and
              is owed back to you.
            </span>
          </p>
        )}
      </div>

      <Button type="button" size="lg" className="w-full" onClick={onStart}>
        <Plus />
        Start today&apos;s liquidation
      </Button>
    </div>
  )
}
