"use client"

import { useEffect, useState } from "react"
import {
  AlertTriangle,
  ExternalLink,
  ImageOff,
  Loader2,
  LogIn,
  LogOut,
  MapPin,
} from "lucide-react"
import { getAttendanceFileUrl } from "@/app/actions/attendance"
import {
  clockTime,
  COARSE_FIX_METRES,
  coordinateLabel,
  dayLabel,
  decimalHours,
  mapsLink,
  minutesLabel,
} from "@/lib/attendance"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FileLink } from "@/components/reimbursement/file-upload"
import { OvertimeDecision } from "@/components/attendance/overtime-decision"
import {
  grantedHours,
  REPORT_TYPE_LABEL,
  type AttendanceRow,
  type PunchFix,
} from "@/components/attendance/admin-attendance"

const OVERTIME_CHIP: Record<string, string> = {
  PENDING: "bg-amber-600/10 text-amber-700 dark:text-amber-400",
  APPROVED: "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
  REJECTED: "bg-rose-600/10 text-rose-700 dark:text-rose-400",
}

/** A labelled figure in the strip across the top. */
function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint?: React.ReactNode
  tone?: string
}) {
  return (
    <div className="min-w-0 rounded-xl border bg-card p-3">
      <p className="text-[0.6875rem] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className={cn("mt-1 truncate text-lg font-semibold tabular-nums", tone)}>
        {value}
      </p>
      {hint && (
        <p className="mt-0.5 truncate text-[0.6875rem] text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  )
}

/**
 * One punch, as a piece of evidence: the photograph, when it was taken and
 * where the device said it was.
 *
 * Card rather than a bare image with captions floating around it — the three
 * facts are one claim and need to read as a unit, especially with two of them
 * side by side. The accuracy figure sits in the footer beside the coordinates
 * rather than hidden behind them: a position "at the site" to within two
 * kilometres is not the same claim as one to within eight metres, and the two
 * look identical if all you print is latitude and longitude. As a chip it also
 * stops the warning wrapping onto three lines and shoving the card around.
 */
function PunchCard({
  kind,
  at,
  fix,
  selfieUrl,
  loading,
}: {
  kind: "in" | "out"
  at: string | null
  fix: PunchFix | null
  selfieUrl: string | null
  loading: boolean
}) {
  const coarse = fix?.accuracy != null && fix.accuracy > COARSE_FIX_METRES
  const Icon = kind === "in" ? LogIn : LogOut

  return (
    <figure className="flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card">
      <figcaption className="flex items-center gap-1.5 border-b px-3 py-2">
        <Icon
          className={cn(
            "size-3.5",
            kind === "in"
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-muted-foreground"
          )}
        />
        <span className="text-[0.6875rem] font-medium tracking-wide text-muted-foreground uppercase">
          Time {kind}
        </span>
        {at && (
          <span className="ml-auto font-mono text-sm font-medium tabular-nums">
            {clockTime(at)}
          </span>
        )}
      </figcaption>

      {/* 3:4, now the dialog is wide enough for two of these to sit beside the
          paperwork rather than instead of it — but capped, because below `lg`
          the cards go full width and a strict ratio would make each photo
          ~385px tall and push the overtime decision back under the fold. The
          crop that costs is object-cover's, at the edges of a portrait. */}
      <div className="relative aspect-[3/4] max-h-72 w-full bg-muted">
        {!at ? (
          <p className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
            Still on the clock — no time out yet.
          </p>
        ) : loading ? (
          <span className="flex h-full items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </span>
        ) : selfieUrl ? (
          <a
            href={selfieUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group/photo block size-full"
          >
            {/* Signed R2 URLs expire and aren't a configured next/image host,
                so this stays a plain img. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selfieUrl}
              alt={`Photo taken at time ${kind}`}
              className="size-full object-cover transition-opacity group-hover/photo:opacity-90"
            />
            <span className="pointer-events-none absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover/photo:opacity-100">
              <ExternalLink className="size-3" />
              Full size
            </span>
          </a>
        ) : (
          <p className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-xs text-muted-foreground">
            <ImageOff className="size-5" />
            The photo couldn&apos;t be loaded.
          </p>
        )}
      </div>

      {/* Two rows rather than one: a full five-decimal pair and a chip side by
          side don't both fit across half of the evidence column, and
          truncating a coordinate is worse than spending a line on it — half a
          latitude is not a location. */}
      {fix ? (
        <div className="flex flex-col items-start gap-1 border-t px-2.5 py-2">
          {/* No trailing link icon: the pin, the colour and the underline
              already say it opens a map, and at this width every pixel it
              took came out of the coordinate itself. */}
          <a
            href={mapsLink(fix.latitude, fix.longitude)}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in Google Maps"
            className="inline-flex w-full min-w-0 items-center gap-1.5 text-xs text-sky-700 underline-offset-2 hover:underline dark:text-sky-400"
          >
            <MapPin className="size-3.5 shrink-0" />
            <span className="min-w-0 truncate font-mono">
              {coordinateLabel(fix.latitude, fix.longitude)}
            </span>
          </a>
          <span
            title={
              coarse ? "Too rough to place at a site" : "Reported accuracy"
            }
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
              coarse
                ? "bg-amber-600/10 text-amber-700 dark:text-amber-400"
                : "bg-muted text-muted-foreground"
            )}
          >
            {coarse && <AlertTriangle className="size-3 shrink-0" />}
            {fix.accuracy == null
              ? "No accuracy"
              : `±${Math.round(fix.accuracy)}m`}
          </span>
        </div>
      ) : (
        at && (
          <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
            No location recorded.
          </p>
        )
      )}
    </figure>
  )
}

/** A titled block in the right-hand column. */
function Panel({
  title,
  count,
  children,
}: {
  title: string
  count?: number
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <p className="flex items-center gap-1.5 text-[0.6875rem] font-medium tracking-wide text-muted-foreground uppercase">
        {title}
        {count != null && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 tabular-nums">
            {count}
          </span>
        )}
      </p>
      {children}
    </section>
  )
}

export function AttendanceDetailDialog({
  row,
  open,
  onOpenChange,
}: {
  row: AttendanceRow
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [urls, setUrls] = useState<{ in: string | null; out: string | null }>({
    in: null,
    out: null,
  })
  const [loading, setLoading] = useState(true)

  // Signed at open time, not baked into the page: nothing in the bucket is
  // public, and a URL minted when the table rendered would be stale — or worse,
  // sitting in the markup of every row nobody clicked.
  useEffect(() => {
    let cancelled = false

    void (async () => {
      const [timeInUrl, timeOutUrl] = await Promise.all([
        getAttendanceFileUrl(row.timeInSelfieKey),
        row.timeOutSelfieKey
          ? getAttendanceFileUrl(row.timeOutSelfieKey)
          : Promise.resolve(null),
      ])
      if (cancelled) return
      setUrls({ in: timeInUrl, out: timeOutUrl })
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [row.timeInSelfieKey, row.timeOutSelfieKey])

  const overtime = row.overtime
  const working = !row.timeOut

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Wide, and two-column from `lg`. The day is two separate things — the
          evidence for the punch and the paperwork that came out of it — and
          stacking them in a phone-width column pushed the one actionable
          control on the page (the overtime decision) three scrolls down. */}
      {/* `sm:p-0` as well as `p-0`: the popup's own padding is `p-3 sm:p-4`,
          and a variant only loses to the same variant — `p-0` alone leaves
          `sm:p-4` standing, which frames the whole dialog in a 16px band of
          popover white on any screen above 640px. This one is edge-to-edge by
          design: the header and the footer rule are meant to meet its sides. */}
      <DialogContent className="grid max-h-[92dvh] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-2xl sm:p-0 lg:max-w-4xl">
        {/* min-w-0 on both rows: a grid item's min-width defaults to its
            content, so on a phone the header and the body push the panel's
            column wider than the panel itself and get clipped by the
            overflow-hidden above. Same trap as the min-h-0 below. */}
        {/* The right padding has to be restated at `sm`, because `sm:px-5`
            sets padding-right too and would otherwise win over the base
            `pr-12` — putting the status badges straight under the close
            button. That gap is reserved space, not spacing. */}
        <DialogHeader className="min-w-0 flex-row items-center gap-3 border-b bg-muted/30 px-4 py-3 pr-12 sm:px-5 sm:pr-14">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-base">
              {row.employeeName}
            </DialogTitle>
            <DialogDescription className="truncate text-xs">
              {dayLabel(row.date, true)}
              {row.employeeNo && ` · ${row.employeeNo}`}
            </DialogDescription>
          </div>

          {/* State first, because it changes how everything below reads: an
              open day has no duration and no time-out photo, and that should
              be the header's news rather than a puzzle further down. */}
          <div className="flex shrink-0 items-center gap-1.5">
            {overtime?.status === "PENDING" && (
              <Badge className={cn("hidden sm:inline-flex", OVERTIME_CHIP.PENDING)}>
                Overtime to review
              </Badge>
            )}
            <Badge
              className={
                working
                  ? "bg-amber-600/10 text-amber-700 dark:text-amber-400"
                  : "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
              }
            >
              {working ? "On the clock" : "Complete"}
            </Badge>
          </div>
        </DialogHeader>

        <div className="min-h-0 min-w-0 overflow-y-auto p-4 sm:p-5">
          <div className="flex flex-col gap-4">
            {/* The day in four figures, scannable across the top. The span is
                given both as a person reads it and as payroll adds it up. */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
              <Stat label="Time in" value={clockTime(row.timeIn)} />
              <Stat
                label="Time out"
                value={row.timeOut ? clockTime(row.timeOut) : "—"}
                tone={working ? "text-amber-700 dark:text-amber-400" : undefined}
                hint={
                  // A shift that ran past midnight is ordinary, but
                  // "22:00 — 06:00" reads as going backwards unless the second
                  // day is named.
                  working ? (
                    "Not yet out"
                  ) : row.spansDays > 0 ? (
                    <span className="text-violet-700 dark:text-violet-400">
                      on {dayLabel(row.timeOut!)}
                    </span>
                  ) : undefined
                }
              />
              <Stat
                label="On the clock"
                value={row.minutes == null ? "—" : minutesLabel(row.minutes)}
              />
              <Stat
                label="For payroll"
                value={
                  row.minutes == null
                    ? "—"
                    : `${decimalHours(row.minutes).toFixed(2)} h`
                }
                hint={
                  overtime && overtime.status === "APPROVED"
                    ? `+${grantedHours(overtime)}h overtime`
                    : undefined
                }
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-5">
              {/* Evidence. Kept together and kept first — it is what the whole
                  record rests on. */}
              <div className="grid grid-cols-2 gap-3 self-start">
                <PunchCard
                  kind="in"
                  at={row.timeIn}
                  fix={row.timeInFix}
                  selfieUrl={urls.in}
                  loading={loading}
                />
                <PunchCard
                  kind="out"
                  at={row.timeOut}
                  fix={row.timeOutFix}
                  selfieUrl={urls.out}
                  loading={loading}
                />
              </div>

              {/* Paperwork, and the one decision this dialog can take. */}
              <div className="flex min-w-0 flex-col gap-4">
                {overtime && (
                  <Panel title="Overtime">
                    <div
                      className={cn(
                        "flex flex-col gap-2 rounded-xl border p-3",
                        // A request nobody has ruled on is the reason this
                        // dialog gets opened at all, so it is the one block
                        // allowed to raise its voice.
                        overtime.status === "PENDING" &&
                          "border-amber-500/40 bg-amber-500/5"
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold tabular-nums">
                          +{grantedHours(overtime)}h
                          {/* Shown only when the office granted something other
                              than what was asked — otherwise it's noise. */}
                          {overtime.approvedHours != null && (
                            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                              of {overtime.hours}h requested
                            </span>
                          )}
                        </p>
                        <Badge className={OVERTIME_CHIP[overtime.status]}>
                          {overtime.status === "PENDING"
                            ? "Awaiting a decision"
                            : overtime.status === "APPROVED"
                              ? "Approved"
                              : "Rejected"}
                        </Badge>
                      </div>

                      <p className="text-sm">{overtime.reason}</p>

                      {overtime.status === "PENDING" ? (
                        <OvertimeDecision
                          requestId={overtime.id}
                          requestedHours={overtime.hours}
                          className="border-t border-amber-500/25 pt-3"
                        />
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {overtime.status === "APPROVED"
                            ? "Approved"
                            : "Rejected"}{" "}
                          by {overtime.reviewedByName ?? "the office"}
                          {overtime.reviewedAt &&
                            ` on ${dayLabel(overtime.reviewedAt)}`}
                          {overtime.reviewNote && ` — ${overtime.reviewNote}`}
                        </p>
                      )}
                    </div>
                  </Panel>
                )}

                {/* One card per site visited. A crew can cover three branches
                    in a day, so this is a list — and the serial is what the
                    office quotes back to the client, so it leads. */}
                {row.reports.length > 0 && (
                  <Panel title="Reports filed" count={row.reports.length}>
                    <ul className="flex flex-col gap-2">
                      {row.reports.map((report) => (
                        <li
                          key={report.id}
                          className="flex items-start gap-3 rounded-xl border p-3"
                        >
                          <span
                            className={cn(
                              "mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
                              report.type === "PMS"
                                ? "bg-sky-600/10 text-sky-700 dark:text-sky-400"
                                : "bg-violet-600/10 text-violet-700 dark:text-violet-400"
                            )}
                          >
                            {REPORT_TYPE_LABEL[report.type]}
                          </span>

                          <div className="min-w-0 flex-1">
                            <p className="font-mono text-sm font-medium">
                              {report.serialNo}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {report.clientName}
                              {report.branchName && ` — ${report.branchName}`}
                            </p>
                            <FileLink
                              fileKey={report.fileKey}
                              name={report.fileName}
                              className="mt-1.5 max-w-full"
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </Panel>
                )}

                {row.reportNote && (
                  <Panel title="Notes">
                    <p className="rounded-xl border p-3 text-sm whitespace-pre-wrap">
                      {row.reportNote}
                    </p>
                  </Panel>
                )}

                {row.reports.length === 0 && !row.reportNote && !overtime && (
                  <p className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground">
                    No reports, notes or overtime for this day.
                  </p>
                )}
              </div>
            </div>

            {/* Said once, here, rather than implied by a map pin: this is a
                claim the device made, not an independent observation. */}
            <p className="border-t pt-3 text-[11px] leading-relaxed text-muted-foreground">
              Photos are taken by the camera in the app at the moment of the
              punch and can&apos;t be chosen from a gallery. Positions are
              reported by the employee&apos;s device — treat the accuracy figure,
              not the coordinates, as the measure of how much a pin is worth.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
