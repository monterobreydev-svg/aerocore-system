"use client"

import { useState } from "react"
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock,
  Loader2,
  LogIn,
  LogOut,
  MapPin,
  Plus,
  Timer,
  X,
} from "lucide-react"
import {
  kioskReportBranches,
  kioskReportClients,
  kioskReportUploadUrl,
  kioskRequestOvertime,
  kioskTimeIn,
  kioskTimeOut,
  kioskUploadUrl,
  kioskWhoIs,
  type KioskWho,
  type ReportClient,
} from "@/app/actions/attendance"
import { ReportForm } from "@/components/attendance/report-form"
import {
  siteLabel,
  type DraftReport,
} from "@/components/attendance/report-draft"
import {
  clockTime,
  COARSE_FIX_METRES,
  MAX_OVERTIME_HOURS,
} from "@/lib/attendance"
import { compressImage } from "@/lib/compress-image"
import { useGeolocationFix } from "@/lib/use-geolocation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  SelfieCapture,
  type CapturedSelfie,
} from "@/components/attendance/selfie-capture"

type Known = Extract<KioskWho, { ok: true }>

/**
 * What became of the last overtime request.
 *
 * The kiosk could file overtime and then said nothing — the crew asked for
 * hours into a machine and had to ring the office to find out whether they had
 * them. Rejections carry the office's note, because "no" without a reason is
 * the version that gets argued about at the gate.
 */
function OvertimeStatusCard({
  request,
}: {
  request: Known["overtimeRequest"]
}) {
  if (!request) return null

  const granted = request.approvedHours ?? request.hours
  // "asked for 4, granted 3" is the case worth spelling out — a bare "3h
  // approved" against a request for 4 reads as the office losing an hour.
  const trimmed =
    request.status === "APPROVED" && granted !== request.hours

  const tone =
    request.status === "APPROVED"
      ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
      : request.status === "REJECTED"
        ? "border-destructive/30 bg-destructive/5 text-destructive"
        : "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400"

  const Icon =
    request.status === "APPROVED"
      ? Check
      : request.status === "REJECTED"
        ? X
        : Clock

  const headline =
    request.status === "APPROVED"
      ? trimmed
        ? `Overtime approved — ${granted}h of the ${request.hours}h you asked for`
        : `Overtime approved — ${granted}h`
      : request.status === "REJECTED"
        ? "Overtime not approved"
        : `Overtime requested — ${request.hours}h, waiting for the office`

  return (
    <div className={cn("flex items-start gap-2.5 rounded-xl border px-3 py-2.5", tone)}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{headline}</span>
        <span className="mt-0.5 block text-xs opacity-80">
          {/* Which day it was for, so an answer arriving the next morning
              isn't mistaken for one about today. */}
          Requested {dayAndTime(request.requestedAt)}
          {request.reviewedAt && ` · answered ${dayAndTime(request.reviewedAt)}`}
        </span>
        {request.reviewNote && (
          <span className="mt-1 block text-xs opacity-90">
            “{request.reviewNote}”
          </span>
        )}
      </span>
    </div>
  )
}

/** "Mon 8:30 PM" — enough to place an answer against the shift it is about. */
function dayAndTime(iso: string) {
  const date = new Date(iso)
  return `${date.toLocaleDateString(undefined, { weekday: "short" })} ${clockTime(iso)}`
}

/** What this thing does, said before anyone has typed anything. */
const CAPABILITIES = [
  { icon: LogIn, label: "Time in" },
  { icon: LogOut, label: "Time out" },
  { icon: Timer, label: "Overtime" },
] as const

/** A requirement that has to be met before a punch can be saved. */
function Requirement({
  met,
  busy,
  icon: Icon,
  label,
  detail,
  tone,
}: {
  met: boolean
  busy?: boolean
  icon: React.ElementType
  label: string
  detail: string
  tone?: "warning"
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border px-3 py-2.5",
        met && !tone && "border-emerald-500/30 bg-emerald-500/5",
        tone === "warning" && "border-amber-500/30 bg-amber-500/5"
      )}
    >
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full",
          met
            ? tone === "warning"
              ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
              : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
            : "bg-muted text-muted-foreground"
        )}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : met ? (
          <Check className="size-4" />
        ) : (
          <Icon className="size-4" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {detail}
        </span>
      </span>
    </div>
  )
}

/**
 * The shared-phone time clock.
 *
 * Written for somebody standing at a gate with one borrowed handset: what the
 * machine can do is stated before they touch it, the next step is always the
 * biggest thing on screen, and the decision of *which* punch this is gets made
 * by the system rather than asked of the person — if they are on the clock,
 * the button says Time out, and that is the only button.
 */
export function KioskPunch({ storageReady }: { storageReady: boolean }) {
  const [username, setUsername] = useState("")
  const [who, setWho] = useState<Known | null>(null)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [looking, setLooking] = useState(false)

  const [mode, setMode] = useState<"punch" | "overtime" | null>(null)
  const [selfieKey, setSelfieKey] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ title: string; at: string } | null>(null)
  const [note, setNote] = useState("")
  const [otHours, setOtHours] = useState("")
  const [otReason, setOtReason] = useState("")

  // The day's paperwork, built here and filed with the punch — same as the
  // signed-in time out. Each file is already in storage by the time it lands
  // in this list; the punch carries the references.
  const [reports, setReports] = useState<DraftReport[]>([])
  const [reportForm, setReportForm] = useState(false)
  const [clients, setClients] = useState<ReportClient[] | null>(null)
  const [loadingClients, setLoadingClients] = useState(false)

  const location = useGeolocationFix()
  const fix = location.state === "found" ? location.fix : null
  const coarse = fix?.accuracy != null && fix.accuracy > COARSE_FIX_METRES

  function reset() {
    setWho(null)
    setUsername("")
    setMode(null)
    setSelfieKey(null)
    setUploadError(null)
    setError(null)
    setDone(null)
    setNote("")
    setOtHours("")
    setOtReason("")
    // The next person's paperwork is not this person's.
    setReports([])
    setReportForm(false)
  }

  async function lookup() {
    const typed = username.trim()
    if (!typed) return

    setLooking(true)
    setLookupError(null)
    try {
      const result = await kioskWhoIs(typed)
      if (!result.ok) {
        setLookupError(result.message)
        return
      }
      setWho(result)
    } finally {
      setLooking(false)
    }
  }

  async function handleCapture(captured: CapturedSelfie | null) {
    setSelfieKey(null)
    setUploadError(null)
    if (!captured || !who) return

    setUploading(true)
    try {
      const original = new File([captured.blob], "selfie.jpg", {
        type: "image/jpeg",
      })
      const file = await compressImage(original)

      const ticket = await kioskUploadUrl(
        username.trim(),
        who.state === "in" ? "time-out" : "time-in",
        file.name,
        file.type,
        file.size
      )
      if (!ticket.ok) {
        setUploadError(ticket.message)
        return
      }

      const response = await fetch(ticket.url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      })
      if (!response.ok) {
        setUploadError("The photo didn't send. Check the signal and retake it.")
        return
      }
      setSelfieKey(ticket.key)
    } catch {
      setUploadError("The photo couldn't be sent. Retake it.")
    } finally {
      setUploading(false)
    }
  }

  async function submitPunch() {
    if (!who || !selfieKey || !fix) return

    setSaving(true)
    setError(null)
    try {
      const form = new FormData()
      form.set("username", username.trim())
      form.set("selfieKey", selfieKey)
      form.set("latitude", String(fix.latitude))
      form.set("longitude", String(fix.longitude))
      if (fix.accuracy != null) form.set("accuracy", String(fix.accuracy))

      const goingOut = who.state === "in"
      if (goingOut) {
        // The punch and its paperwork are filed together — the action writes
        // them in one transaction, so a time out never lands claiming reports
        // that didn't save.
        form.set(
          "reports",
          JSON.stringify(
            reports.map((report) => ({
              type: report.type,
              clientId: report.clientId,
              branchId: report.branchId,
              serialNo: report.serialNo,
              fileKey: report.fileKey,
              fileName: report.fileName,
            }))
          )
        )
        if (note.trim()) form.set("reportNote", note.trim())
      }

      const result = goingOut
        ? await kioskTimeOut(undefined, form)
        : await kioskTimeIn(undefined, form)

      if (result?.success) {
        setDone({
          title: goingOut ? "Timed out" : "Timed in",
          at: clockTime(result.at ?? new Date().toISOString()),
        })
        return
      }
      setError(result?.message ?? "That didn't save. Try again.")
    } finally {
      setSaving(false)
    }
  }

  /**
   * The client list is fetched when the form is first opened, not with the
   * page: most punches file no paperwork at all, and every phone would
   * otherwise pay for a list it never shows.
   */
  async function openReportForm() {
    setReportForm(true)
    if (clients) return

    setLoadingClients(true)
    try {
      setClients(await kioskReportClients(username.trim()))
    } finally {
      setLoadingClients(false)
    }
  }

  async function submitOvertime() {
    if (!who) return

    setSaving(true)
    setError(null)
    try {
      const form = new FormData()
      form.set("username", username.trim())
      form.set("hours", otHours)
      form.set("reason", otReason)

      const result = await kioskRequestOvertime(undefined, form)
      if (result?.success) {
        setDone({ title: "Overtime requested", at: `${otHours}h sent to the office` })
        return
      }
      setError(result?.message ?? "That didn't send. Try again.")
    } finally {
      setSaving(false)
    }
  }

  const storageWarning = !storageReady && (
    <p className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-400">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span>
        Photos can&apos;t be saved yet, so timing in and out is switched off.
        Ask the office to set up file storage.
      </span>
    </p>
  )

  // ---- Done ------------------------------------------------------------
  if (done && who) {
    return (
      <div className="flex flex-col items-center gap-5 rounded-2xl border bg-card px-6 py-10 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-emerald-500/12 ring-8 ring-emerald-500/5">
          <CheckCircle2 className="size-8 text-emerald-600 dark:text-emerald-400" />
        </span>
        <div>
          <p className="text-xl font-semibold">{done.title}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{done.at}</p>
          <p className="mt-2 text-sm text-muted-foreground">{who.name}</p>
        </div>
        <Button size="lg" className="h-13 w-full max-w-xs text-base" onClick={reset}>
          Done — next person
          <ArrowRight />
        </Button>
      </div>
    )
  }

  // ---- Step 1: who is this? -------------------------------------------
  if (!who) {
    return (
      <div className="flex flex-col gap-4">
        {storageWarning}

        <div className="rounded-2xl border bg-card p-4">
          <label htmlFor="kiosk-username" className="text-base font-semibold">
            Type your username
          </label>
          <p className="mt-1 text-sm text-muted-foreground">
            The one the office gave you. No password needed here.
          </p>

          <Input
            id="kiosk-username"
            value={username}
            onChange={(event) => {
              setUsername(event.target.value)
              setLookupError(null)
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") void lookup()
            }}
            // Phone keyboards capitalise the first letter, and usernames are
            // matched exactly — so the keyboard has to be told not to.
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            spellCheck={false}
            placeholder="juan.delacruz"
            className="mt-4 h-14 text-center text-lg"
            disabled={looking}
          />

          {lookupError && (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {lookupError}
            </p>
          )}

          <Button
            size="lg"
            className="mt-3 h-14 w-full text-base"
            onClick={() => void lookup()}
            disabled={looking || username.trim() === ""}
          >
            {looking ? <Loader2 className="animate-spin" /> : <ArrowRight />}
            {looking ? "Checking…" : "Continue"}
          </Button>
        </div>

        {/* Says what the machine is for before anyone commits to it — the
            three things it does, whichever one today turns out to be. */}
        <div className="grid grid-cols-3 gap-2">
          {CAPABILITIES.map((entry) => (
            <div
              key={entry.label}
              className="flex flex-col items-center gap-1.5 rounded-xl border bg-card/50 px-2 py-3"
            >
              <entry.icon className="size-4 text-brand" />
              <span className="text-[11px] font-medium text-muted-foreground">
                {entry.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ---- Step 2: what can they do? --------------------------------------
  const goingOut = who.state === "in"
  const ready = Boolean(selfieKey && fix) && !uploading

  return (
    <div className="flex flex-col gap-4">
      {/* Always says whose punch this is about, in case the phone changed
          hands mid-flow. */}
      <div className="flex items-center gap-3 rounded-2xl border bg-card p-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-strong text-sm font-semibold text-brand-foreground">
          {who.name
            .split(" ")
            .map((part) => part[0])
            .join("")
            .slice(0, 2)
            .toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{who.name}</span>
          <span
            className={cn(
              "mt-0.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
              who.state === "in"
                ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400"
                : who.state === "done"
                  ? "bg-muted text-muted-foreground"
                  : "bg-amber-500/12 text-amber-700 dark:text-amber-400"
            )}
          >
            {who.state === "in" && (
              <span className="size-1.5 rounded-full bg-emerald-500" />
            )}
            {who.state === "out" && "Not timed in yet"}
            {who.state === "in" && `On the clock since ${clockTime(who.timeIn!)}`}
            {who.state === "done" && `Finished at ${clockTime(who.timeOut!)}`}
          </span>
        </span>
        <Button variant="ghost" size="sm" onClick={reset}>
          Not you?
        </Button>
      </div>

      {storageWarning}

      {/* Above the buttons and outside every branch: the answer matters
          whether they are about to time in, already on the clock, or finished
          for the day — and the day they finished is often the day the office
          gets round to deciding. */}
      <OvertimeStatusCard request={who.overtimeRequest} />

      {who.state === "done" ? (
        <div className="rounded-2xl border border-dashed px-6 py-10 text-center">
          <CheckCircle2 className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">Done for today</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Nothing else to do here.
          </p>
        </div>
      ) : mode === null ? (
        <div className="flex flex-col gap-2">
          <Button
            size="lg"
            className="h-16 w-full text-base"
            disabled={!storageReady}
            onClick={() => setMode("punch")}
          >
            {goingOut ? <LogOut /> : <LogIn />}
            {goingOut ? "Time out" : "Time in"}
          </Button>

          {/* Overtime only exists once somebody is on the clock, and only the
              office's window decides whether it can be asked for now. */}
          {who.state === "in" && (
            <Button
              variant="outline"
              size="lg"
              className="h-13 w-full"
              disabled={who.overtime.state !== "open"}
              onClick={() => setMode("overtime")}
            >
              <Timer />
              {who.overtimeRequested
                ? "Overtime already requested"
                : who.overtime.state === "open"
                  ? "Request overtime"
                  : who.overtime.state === "early"
                    ? `Overtime opens ${clockTime(who.overtime.opensAt)}`
                    : "Overtime not available"}
            </Button>
          )}

          {who.shiftEndsAt && (
            <p className="flex items-center justify-center gap-1.5 pt-1 text-xs text-muted-foreground">
              <Clock className="size-3.5" />
              Shift ends {clockTime(who.shiftEndsAt)}
            </p>
          )}
        </div>
      ) : mode === "overtime" ? (
        <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
          <p className="text-sm font-semibold">Request overtime</p>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="ot-hours" className="text-sm font-medium">
              Extra hours needed
            </label>
            <Input
              id="ot-hours"
              type="number"
              inputMode="decimal"
              min="0.5"
              max={MAX_OVERTIME_HOURS}
              step="0.5"
              value={otHours}
              onChange={(event) => setOtHours(event.target.value)}
              className="h-12 text-base"
              placeholder="2"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="ot-reason" className="text-sm font-medium">
              Why is it needed?
            </label>
            <Textarea
              id="ot-reason"
              value={otReason}
              onChange={(event) => setOtReason(event.target.value)}
              rows={3}
              placeholder="The unit still needs testing"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            The office decides. Approved hours are only paid for the time
            actually worked.
          </p>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setMode(null)}
              disabled={saving}
            >
              Back
            </Button>
            <Button
              className="flex-1"
              onClick={() => void submitOvertime()}
              disabled={saving || !otHours || otReason.trim() === ""}
            >
              {saving ? "Sending…" : "Send request"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <SelfieCapture onCapture={handleCapture} />

          {/* Both requirements as a checklist, so "why is the button grey" is
              never a question. */}
          <div className="flex flex-col gap-2">
            <Requirement
              met={Boolean(selfieKey)}
              busy={uploading}
              icon={Camera}
              label="Photo"
              detail={
                uploadError
                  ? uploadError
                  : uploading
                    ? "Sending…"
                    : selfieKey
                      ? "Taken and saved"
                      : "Take a photo above"
              }
              tone={uploadError ? "warning" : undefined}
            />
            <Requirement
              met={Boolean(fix)}
              busy={location.state === "locating"}
              icon={MapPin}
              label="Location"
              detail={
                location.state === "found"
                  ? coarse
                    ? `Found, but only to ±${Math.round(fix!.accuracy!)}m`
                    : "Found"
                  : location.state === "failed"
                    ? location.reason
                    : "Finding you…"
              }
              tone={coarse || location.state === "failed" ? "warning" : undefined}
            />
          </div>

          {goingOut && (
            <>
              {/* The day's paperwork. One card per site visited — a crew can
                  cover three branches in a day, and each one has its own form
                  with its own serial. */}
              <div className="flex flex-col gap-2 rounded-xl border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <ClipboardList className="size-4 text-muted-foreground" />
                    Reports
                    {reports.length > 0 && (
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] tabular-nums">
                        {reports.length}
                      </span>
                    )}
                  </p>
                  {!reportForm && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={loadingClients}
                      onClick={() => void openReportForm()}
                    >
                      {loadingClients ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Plus />
                      )}
                      Add
                    </Button>
                  )}
                </div>

                {reports.length === 0 && !reportForm && (
                  <p className="text-xs text-muted-foreground">
                    None attached. Add the PMS or service form for each site
                    you worked on today — or leave it and time out.
                  </p>
                )}

                {reports.length > 0 && (
                  <ul className="flex flex-col divide-y">
                    {reports.map((report) => (
                      <li
                        key={report.id}
                        className="flex items-start gap-2 py-2"
                      >
                        <span
                          className={cn(
                            "mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
                            report.type === "PMS"
                              ? "bg-sky-600/10 text-sky-700 dark:text-sky-400"
                              : "bg-violet-600/10 text-violet-700 dark:text-violet-400"
                          )}
                        >
                          {report.type}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-mono text-sm">
                            {report.serialNo}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {siteLabel(report)}
                          </span>
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Remove ${report.serialNo}`}
                          onClick={() =>
                            setReports((list) =>
                              list.filter((entry) => entry.id !== report.id)
                            )
                          }
                        >
                          <X />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}

                {reportForm && clients && (
                  <div className="border-t pt-3">
                    <ReportForm
                      clients={clients}
                      loadBranches={(clientId) =>
                        kioskReportBranches(username.trim(), clientId)
                      }
                      // Both keyed by the username typed at the front — the
                      // crew filing this has no session to lean on.
                      uploadReport={(input) =>
                        kioskReportUploadUrl(username.trim(), input)
                      }
                      resolveFileUrl={async () => null}
                      onAdd={(draft) => {
                        setReports((list) => [
                          ...list,
                          { ...draft, id: crypto.randomUUID() },
                        ])
                        setReportForm(false)
                      }}
                      onCancel={() => setReportForm(false)}
                    />
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="kiosk-note" className="text-sm font-medium">
                  Anything else to report?{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </label>
                <Textarea
                  id="kiosk-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={2}
                  placeholder="Unit 3 still noisy"
                />
              </div>
            </>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="h-13 flex-1"
              onClick={() => setMode(null)}
              disabled={saving}
            >
              Back
            </Button>
            <Button
              className="h-13 flex-[2] text-base"
              onClick={() => void submitPunch()}
              disabled={saving || !ready}
            >
              {saving ? (
                <>
                  <Loader2 className="animate-spin" />
                  Saving…
                </>
              ) : goingOut ? (
                <>
                  <LogOut />
                  Confirm time out
                </>
              ) : (
                <>
                  <LogIn />
                  Confirm time in
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
