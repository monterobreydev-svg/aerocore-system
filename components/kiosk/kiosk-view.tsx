"use client"

import { useState } from "react"
import Image from "next/image"
import { CalendarDays, Clock } from "lucide-react"
import { useNow } from "@/lib/hooks/use-now"
import { cn } from "@/lib/utils"
import { KioskPunch } from "@/components/kiosk/kiosk-punch"
import {
  KioskSchedule,
  type KioskDay,
} from "@/components/kiosk/kiosk-schedule"

/**
 * The live time, because this is a clock.
 *
 * On the app's own `useNow`, which reports 0 until the first client tick —
 * there is no "now" on the server the phone would agree with, and printing one
 * is a hydration mismatch. The tick is half a minute, which is close enough
 * for a display showing hours and minutes; the time actually recorded on a
 * punch is the server's, not this.
 */
function Now() {
  const tick = useNow()
  const now = tick === 0 ? null : new Date(tick)

  return (
    <div className="text-right tabular-nums">
      <p className="text-2xl leading-none font-semibold text-white">
        {now
          ? now.toLocaleTimeString(undefined, {
              hour: "numeric",
              minute: "2-digit",
            })
          : "—:—"}
      </p>
      <p className="mt-1 text-[11px] text-white/60">
        {now
          ? now.toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
            })
          : ""}
      </p>
    </div>
  )
}

export function KioskView({
  days,
  storageReady,
}: {
  days: KioskDay[]
  storageReady: boolean
}) {
  const [tab, setTab] = useState<"clock" | "schedule">("clock")

  const tabs = [
    { id: "clock" as const, label: "Time clock", icon: Clock },
    { id: "schedule" as const, label: "Schedule", icon: CalendarDays },
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* The masthead carries the brand and the time together — on a shared
          phone at a gate, "is this the right app and is that clock right" are
          the same glance. */}
      <header className="flex items-center gap-3 rounded-2xl bg-gradient-to-br from-sidebar to-[color-mix(in_oklab,var(--sidebar)_78%,var(--brand))] p-4 ring-1 ring-foreground/10">
        <div className="relative flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/90 ring-1 ring-white/25">
          <Image
            src="/logo.png"
            alt="AeroCoole"
            fill
            sizes="44px"
            className="object-contain p-1.5"
            priority
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-heading truncate text-lg leading-none font-semibold tracking-tight text-white">
            Aero<span className="text-sidebar-primary">Coole</span>
          </p>
          <p className="mt-1.5 text-[11px] font-medium tracking-[0.14em] text-white/50 uppercase">
            Time clock
          </p>
        </div>
        <Now />
      </header>

      {/* Big targets: tapped with a thumb, outdoors, sometimes with gloves. */}
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            aria-pressed={tab === entry.id}
            className={cn(
              "flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-colors",
              tab === entry.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground"
            )}
          >
            <entry.icon className="size-4" />
            {entry.label}
          </button>
        ))}
      </div>

      {tab === "clock" ? (
        <KioskPunch storageReady={storageReady} />
      ) : (
        <KioskSchedule days={days} />
      )}
    </div>
  )
}
