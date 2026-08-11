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

/**
 * One punch: the photograph, when it was taken and where the device said it
 * was. The accuracy figure is shown next to the coordinates rather than hidden
 * behind them — a position "at the site" to within two kilometres is not the
 * same claim as one to within eight metres, and the two look identical if all
 * you print is latitude and longitude.
 */
function Punch({
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
    <div className="flex min-w-0 flex-col gap-2">
      <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        <Icon className="size-3.5" />
        Time {kind}
        {at && (
          <span className="ml-auto font-mono text-sm tracking-normal text-foreground normal-case">
            {clockTime(at)}
          </span>
        )}
      </p>

      {/* 4:5 rather than 3:4 — two portraits side by side in a narrow dialog
          are the tallest thing on it, and this keeps the reports below the
          fold by less. */}
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl bg-muted">
        {!at ? (
          <p className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
            Still on the clock — no time out yet.
          </p>
        ) : loading ? (
          <span className="flex h-full items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </span>
        ) : selfieUrl ? (
          <a href={selfieUrl} target="_blank" rel="noopener noreferrer">
            {/* Signed R2 URLs expire and aren't a configured next/image host,
                so this stays a plain img. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selfieUrl}
              alt={`Photo taken at time ${kind}`}
              className="size-full object-cover"
            />
          </a>
        ) : (
          <p className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-xs text-muted-foreground">
            <ImageOff className="size-5" />
            The photo couldn&apos;t be loaded.
          </p>
        )}
      </div>

      {fix ? (
        <div className="flex flex-col gap-1">
          <a
            href={mapsLink(fix.latitude, fix.longitude)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-sky-700 underline-offset-2 hover:underline dark:text-sky-400"
          >
            <MapPin className="size-3.5 shrink-0" />
            <span className="min-w-0 truncate font-mono">
              {coordinateLabel(fix.latitude, fix.longitude)}
            </span>
            <ExternalLink className="size-3 shrink-0" />
          </a>
          <p
            className={cn(
              "flex items-center gap-1.5 text-[11px]",
              coarse
                ? "text-amber-600 dark:text-amber-400"
                : "text-muted-foreground"
            )}
          >
            {coarse && <AlertTriangle className="size-3 shrink-0" />}
            {fix.accuracy == null
              ? "Accuracy not reported"
              : `±${Math.round(fix.accuracy)}m${coarse ? " — too rough to place at a site" : ""}`}
          </p>
        </div>
      ) : (
        at && (
          <p className="text-[11px] text-muted-foreground">
            No location recorded.
          </p>
        )
      )}
    </div>
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[88dvh] grid-rows-[auto_minmax(0,1fr)] gap-0 p-0 sm:max-w-md">
        <DialogHeader className="border-b px-4 py-3 pr-12">
          <DialogTitle className="text-sm">{row.employeeName}</DialogTitle>
          <DialogDescription className="text-xs">
            {dayLabel(row.date, true)}
            {row.employeeNo && ` · ${row.employeeNo}`}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto p-4">
          <div className="flex flex-col gap-4">
            {/* The headline: how long they were on the clock, in both the shape
                a person reads and the shape payroll adds up. */}
            <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-muted/50 px-3.5 py-2.5">
              <div>
                <p className="text-xl leading-none font-semibold tabular-nums">
                  {row.minutes == null ? "—" : minutesLabel(row.minutes)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.timeOut ? (
                    <>
                      {clockTime(row.timeIn)} — {clockTime(row.timeOut)}
                      {/* A shift that ran past midnight is ordinary, but
                          "22:00 — 06:00" reads as going backwards unless the
                          second day is named. */}
                      {row.spansDays > 0 && (
                        <span className="text-violet-700 dark:text-violet-400">
                          {" "}
                          on {dayLabel(row.timeOut)}
                        </span>
                      )}
                    </>
                  ) : (
                    `In at ${clockTime(row.timeIn)}, not yet out`
                  )}
                </p>
              </div>
              {row.minutes != null && (
                <p className="text-sm text-muted-foreground tabular-nums">
                  {decimalHours(row.minutes).toFixed(2)} hours
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Punch
                kind="in"
                at={row.timeIn}
                fix={row.timeInFix}
                selfieUrl={urls.in}
                loading={loading}
              />
              <Punch
                kind="out"
                at={row.timeOut}
                fix={row.timeOutFix}
                selfieUrl={urls.out}
                loading={loading}
              />
            </div>

            {/* One card per site visited. A crew can cover three branches in a
                day, so this is a list — and the serial is what the office
                quotes back to the client, so it leads. */}
            {row.reports.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Reports filed · {row.reports.length}
                </p>
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
              </div>
            )}

            {row.reportNote && (
              <div className="flex flex-col gap-1.5 rounded-xl border p-3">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Notes
                </p>
                <p className="text-sm whitespace-pre-wrap">{row.reportNote}</p>
              </div>
            )}

            {overtime && (
              <div className="flex flex-col gap-2 rounded-xl border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Overtime · +{grantedHours(overtime)}h
                    {/* Shown only when the office granted something other than
                        what was asked — otherwise it's noise on every row. */}
                    {overtime.approvedHours != null && (
                      <span className="ml-1.5 text-amber-600 normal-case dark:text-amber-400">
                        ({overtime.hours}h requested)
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
                    className="border-t pt-3"
                  />
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {overtime.status === "APPROVED" ? "Approved" : "Rejected"} by{" "}
                    {overtime.reviewedByName ?? "the office"}
                    {overtime.reviewedAt &&
                      ` on ${dayLabel(overtime.reviewedAt)}`}
                    {overtime.reviewNote && ` — ${overtime.reviewNote}`}
                  </p>
                )}
              </div>
            )}

            {/* Said once, here, rather than implied by a map pin: this is a
                claim the device made, not an independent observation. */}
            <p className="text-[11px] leading-relaxed text-muted-foreground">
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
