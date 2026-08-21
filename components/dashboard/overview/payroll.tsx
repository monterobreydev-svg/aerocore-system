import { Wallet } from "lucide-react"

import type { Overview } from "@/lib/dashboard"
import { cn } from "@/lib/utils"
import {
  Composition,
  Panel,
  PanelBody,
  PanelHead,
  Ring,
} from "@/components/dashboard/overview/parts"

// ---------------------------------------------------------------------------
// Payroll
// ---------------------------------------------------------------------------
//
// What this cutoff has cost so far, and what it is made of.
//
// The ring is not decoration and it is not a pie: it is the one proportion on
// the page that is a fraction of a known whole — how far into the fortnight the
// day is. A payroll figure quoted without it invites the wrong comparison with
// the last one, because half a cutoff always looks like a saving.
//
// This whole panel is absent for a role that may not see pay. It is not fetched
// and hidden — see `seesMoney` in lib/dashboard.

/** Whole pesos. The centavos on a fortnight's payroll are noise at this size. */
export function pesos(amount: number) {
  return `₱${Math.round(amount).toLocaleString("en-PH")}`
}

export function Payroll({
  payroll,
}: {
  payroll: NonNullable<Overview["payroll"]>
}) {
  const through = payroll.dayOfCutoff / payroll.daysInCutoff

  return (
    <Panel>
      <PanelHead
        icon={Wallet}
        title="Payroll"
        meta={payroll.label}
        href={`/admin/payroll?cutoff=${payroll.day}`}
        action="Cutoff"
      />

      <PanelBody>
        <div className="flex items-center gap-4">
          <Ring
            fraction={through}
            primary={String(payroll.dayOfCutoff)}
            secondary={`of ${payroll.daysInCutoff}`}
          />

          <div className="min-w-0 flex-1">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.625rem] font-medium tracking-[0.08em] uppercase",
                payroll.released
                  ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground"
              )}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  payroll.released ? "bg-emerald-500" : "bg-muted-foreground/50"
                )}
              />
              {payroll.released ? "Released" : "Open"}
            </span>

            <p className="mt-2 truncate text-2xl leading-none font-semibold tracking-tight tabular-nums">
              {pesos(payroll.gross)}
            </p>
            <p className="mt-1.5 truncate text-xs text-muted-foreground tabular-nums">
              {pesos(payroll.net)} net · {payroll.headcount} paid
            </p>
          </div>
        </div>

        {payroll.parts.length > 0 && (
          <div className="mt-5 border-t pt-4">
            <p className="mb-2.5 text-[0.6875rem] font-medium tracking-[0.12em] text-muted-foreground uppercase">
              What the gross is made of
            </p>
            <Composition segments={payroll.parts} format={pesos} />
          </div>
        )}
      </PanelBody>

      {payroll.openDays > 0 && (
        <p className="border-t bg-amber-500/8 px-4 py-3 text-xs leading-relaxed text-amber-700 sm:px-5 dark:text-amber-400">
          {payroll.openDays} punch{payroll.openDays === 1 ? "" : "es"} in this
          cutoff never closed — they pay nothing until they do.
        </p>
      )}
    </Panel>
  )
}
