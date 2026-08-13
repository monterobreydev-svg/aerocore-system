"use client"

import { useActionState, useEffect, useState } from "react"
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ClipboardList,
  FileText,
  Loader2,
  LogOut,
  MapPin,
  Plus,
  Trash2,
} from "lucide-react"
import {
  createAttendanceUploadUrl,
  listReportBranches,
  listReportClients,
  timeOut,
  type PunchState,
  type ReportClient,
} from "@/app/actions/attendance"
import { COARSE_FIX_METRES, coordinateLabel } from "@/lib/attendance"
import { compressImage, formatBytes } from "@/lib/compress-image"
import { useGeolocationFix } from "@/lib/use-geolocation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  SelfieCapture,
  type CapturedSelfie,
} from "@/components/attendance/selfie-capture"
import {
  ReportForm,
  type Branch,
} from "@/components/attendance/report-form"
import {
  REPORT_TYPES,
  siteLabel,
  type DraftReport,
} from "@/components/attendance/report-draft"

type Step = "photo" | "reports" | "confirm"

const STEPS: { id: Step; label: string; icon: typeof Camera }[] = [
  { id: "photo", label: "Photo", icon: Camera },
  { id: "reports", label: "Reports", icon: ClipboardList },
  { id: "confirm", label: "Confirm", icon: CheckCircle2 },
]

// Ids for the draft list only. `crypto.randomUUID` is a secure-context API and
// is simply undefined over plain http on a phone, which silently broke the
// buttons that depend on it the last time it was used here.
let draftSequence = 0

/**
 * Timing out, as three screens instead of one.
 *
 * A day can cover several sites and each one produces a report with a type, a
 * client, a branch, a serial and a file. Stacked under the camera preview that
 * was several screens of scrolling on a phone, with the submit button somewhere
 * past the bottom. Splitting it means each screen asks one thing, and the
 * reports step can hold as many as the day actually needed.
 */
export function TimeOutDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [state, action, pending] = useActionState<PunchState, FormData>(
    timeOut,
    undefined
  )

  const [step, setStep] = useState<Step>("photo")

  const [selfie, setSelfie] = useState<CapturedSelfie | null>(null)
  const [selfieKey, setSelfieKey] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const location = useGeolocationFix()

  const [reports, setReports] = useState<DraftReport[]>([])
  const [adding, setAdding] = useState(false)
  const [note, setNote] = useState("")

  // Fetched on demand and kept for the life of the dialog, so opening the form
  // a second time for a second site costs nothing.
  const [clients, setClients] = useState<ReportClient[] | null>(null)
  const [loadingClients, setLoadingClients] = useState(false)
  const [branchCache, setBranchCache] = useState<Record<string, Branch[]>>({})

  useEffect(() => {
    if (state?.success) onOpenChange(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  async function openReportForm() {
    if (!clients) {
      setLoadingClients(true)
      try {
        setClients(await listReportClients())
      } finally {
        setLoadingClients(false)
      }
    }
    setAdding(true)
  }

  async function loadBranches(clientId: string) {
    const cached = branchCache[clientId]
    if (cached) return cached
    const list = await listReportBranches(clientId)
    setBranchCache((current) => ({ ...current, [clientId]: list }))
    return list
  }

  async function handleCapture(captured: CapturedSelfie | null) {
    setSelfie(captured)
    setSelfieKey(null)
    setUploadError(null)
    setSaved(null)
    if (!captured) return

    setUploading(true)
    try {
      const original = new File([captured.blob], "selfie.jpg", {
        type: "image/jpeg",
      })
      const file = await compressImage(original)
      if (file.size < original.size) {
        setSaved(`${formatBytes(original.size)} → ${formatBytes(file.size)}`)
      }

      const ticket = await createAttendanceUploadUrl(
        "time-out",
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
        setUploadError(
          `Storage rejected the photo (${response.status}). Retake and try again.`
        )
        return
      }
      setSelfieKey(ticket.key)
    } catch {
      setUploadError("The photo couldn't be sent. Check your signal and retake.")
    } finally {
      setUploading(false)
    }
  }

  const fix = location.state === "found" ? location.fix : null
  const coarse = fix?.accuracy != null && fix.accuracy > COARSE_FIX_METRES
  const ready = Boolean(selfieKey && fix) && !pending && !uploading

  const stepIndex = STEPS.findIndex((entry) => entry.id === step)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 p-0 sm:max-w-lg">
        <DialogHeader className="gap-3 border-b p-4 pr-12">
          <div>
            <DialogTitle>Time out</DialogTitle>
            <DialogDescription className="text-xs">
              A photo taken now and your location are recorded with the time.
            </DialogDescription>
          </div>

          {/* Where you are and what is left, without stealing a screen for it. */}
          <ol className="flex items-center gap-1.5">
            {STEPS.map((entry, index) => {
              const done = index < stepIndex
              const current = index === stepIndex
              return (
                <li key={entry.id} className="flex flex-1 flex-col gap-1">
                  <span
                    className={cn(
                      "h-1 rounded-full transition-colors",
                      done || current ? "bg-brand" : "bg-muted"
                    )}
                  />
                  <span
                    className={cn(
                      "text-[10px] font-medium tracking-wide uppercase",
                      current ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {entry.label}
                  </span>
                </li>
              )
            })}
          </ol>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto p-4">
          {/* ---------------------------------------------------------- */}
          {step === "photo" && (
            <div className="flex flex-col gap-4">
              <SelfieCapture onCapture={handleCapture} />

              {selfie && (
                <p
                  className={cn(
                    "flex items-center gap-2 text-xs",
                    uploadError ? "text-destructive" : "text-muted-foreground"
                  )}
                >
                  {uploading ? (
                    <Loader2 className="size-3.5 shrink-0 animate-spin" />
                  ) : uploadError ? (
                    <AlertTriangle className="size-3.5 shrink-0" />
                  ) : (
                    <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  )}
                  <span className="min-w-0">
                    {uploading
                      ? "Sending photo…"
                      : uploadError
                        ? uploadError
                        : `Photo saved${saved ? ` · ${saved}` : ""}`}
                  </span>
                </p>
              )}
            </div>
          )}

          {/* ---------------------------------------------------------- */}
          {step === "reports" &&
            (adding && clients ? (
              <ReportForm
                clients={clients}
                loadBranches={loadBranches}
                onCancel={() => setAdding(false)}
                onAdd={(draft) => {
                  setReports((current) => [
                    ...current,
                    { ...draft, id: `draft-${++draftSequence}` },
                  ])
                  setAdding(false)
                }}
              />
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-xs text-muted-foreground">
                  Add one for each site you worked on today. Skip this if there
                  was nothing to file.
                </p>

                {reports.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-8 text-center">
                    <ClipboardList className="mx-auto size-6 text-muted-foreground" />
                    <p className="mt-2 text-sm text-muted-foreground">
                      No reports added yet.
                    </p>
                  </div>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {reports.map((report) => (
                      <li
                        key={report.id}
                        className="flex items-start gap-3 rounded-xl border p-3"
                      >
                        <span
                          className={cn(
                            "mt-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
                            report.type === "PMS"
                              ? "bg-sky-600/10 text-sky-700 dark:text-sky-400"
                              : "bg-violet-600/10 text-violet-700 dark:text-violet-400"
                          )}
                        >
                          {
                            REPORT_TYPES.find((t) => t.value === report.type)
                              ?.label
                          }
                        </span>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {siteLabel(report)}
                          </p>
                          <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                            {report.serialNo}
                          </p>
                          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <FileText className="size-3 shrink-0" />
                            <span className="min-w-0 truncate">
                              {report.fileName}
                            </span>
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setReports((current) =>
                              current.filter((r) => r.id !== report.id)
                            )
                          }
                          aria-label={`Remove the report for ${siteLabel(report)}`}
                          className="rounded-md p-1 text-muted-foreground outline-none hover:bg-muted hover:text-destructive"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <Button
                  type="button"
                  variant="outline"
                  onClick={openReportForm}
                  disabled={loadingClients}
                  className="h-11 w-full"
                >
                  {loadingClients ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Plus />
                  )}
                  {reports.length === 0 ? "Add a report" : "Add another report"}
                </Button>
              </div>
            ))}

          {/* ---------------------------------------------------------- */}
          {step === "confirm" && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2 rounded-xl border p-3 text-xs">
                <p className="flex items-center gap-2">
                  {selfieKey ? (
                    <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <AlertTriangle className="size-3.5 shrink-0 text-destructive" />
                  )}
                  {selfieKey ? "Photo taken and saved" : "No photo yet"}
                </p>

                <p
                  className={cn(
                    "flex items-start gap-2",
                    location.state === "failed"
                      ? "text-destructive"
                      : "text-muted-foreground"
                  )}
                >
                  {location.state === "locating" ? (
                    <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin" />
                  ) : (
                    <MapPin className="mt-0.5 size-3.5 shrink-0" />
                  )}
                  <span className="min-w-0">
                    {location.state === "locating" && "Getting your location…"}
                    {location.state === "failed" && location.reason}
                    {fix && (
                      <>
                        {coordinateLabel(fix.latitude, fix.longitude)}
                        {fix.accuracy != null && (
                          <span className={cn(coarse && "text-amber-600")}>
                            {" "}
                            · ±{Math.round(fix.accuracy)}m
                            {coarse && " (rough — step outside if you can)"}
                          </span>
                        )}
                      </>
                    )}
                  </span>
                </p>

                <p className="flex items-center gap-2 text-muted-foreground">
                  <ClipboardList className="size-3.5 shrink-0" />
                  {reports.length === 0
                    ? "No reports filed"
                    : `${reports.length} report${reports.length === 1 ? "" : "s"} to file`}
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="report-note"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Notes — optional
                </label>
                <Textarea
                  id="report-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder="Anything the office should know that isn't in a report."
                  disabled={pending}
                />
              </div>

              {state?.message && (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {state.message}
                </p>
              )}
            </div>
          )}
        </div>

        {/* ------------------------------------------------------------ */}
        <div className="border-t bg-muted/50 p-4">
          {step === "confirm" ? (
            <form action={action} className="flex flex-col gap-2">
              <input type="hidden" name="selfieKey" value={selfieKey ?? ""} />
              <input
                type="hidden"
                name="latitude"
                value={fix?.latitude ?? ""}
                readOnly
              />
              <input
                type="hidden"
                name="longitude"
                value={fix?.longitude ?? ""}
                readOnly
              />
              <input
                type="hidden"
                name="accuracy"
                value={fix?.accuracy ?? ""}
                readOnly
              />
              <input type="hidden" name="reportNote" value={note} />
              {/* One field rather than a numbered set of them: the count is
                  variable and the server re-checks every id anyway. Listed
                  explicitly so the draft's display-only fields — the client and
                  branch names shown in the list — don't ride along. */}
              <input
                type="hidden"
                name="reports"
                value={JSON.stringify(
                  reports.map((report) => ({
                    type: report.type,
                    clientId: report.clientId,
                    branchId: report.branchId,
                    serialNo: report.serialNo,
                    fileKey: report.fileKey,
                    fileName: report.fileName,
                  }))
                )}
                readOnly
              />

              <Button
                type="submit"
                size="lg"
                disabled={!ready}
                className="h-11 w-full"
              >
                {pending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Recording…
                  </>
                ) : (
                  <>
                    <LogOut />
                    Time out now
                  </>
                )}
              </Button>

              {!ready && !pending && (
                <p className="text-center text-[11px] text-muted-foreground">
                  {!selfieKey
                    ? "Go back and take your photo."
                    : "Waiting for your location…"}
                </p>
              )}

              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => setStep("reports")}
              >
                Back
              </Button>
            </form>
          ) : (
            <div className="flex items-center gap-2">
              {step !== "photo" && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  onClick={() => {
                    if (adding) return setAdding(false)
                    setStep("photo")
                  }}
                >
                  Back
                </Button>
              )}
              <Button
                type="button"
                size="lg"
                className="h-11 flex-1"
                disabled={step === "photo" ? !selfieKey || uploading : adding}
                onClick={() =>
                  setStep(step === "photo" ? "reports" : "confirm")
                }
              >
                {step === "photo"
                  ? uploading
                    ? "Sending photo…"
                    : "Next"
                  : reports.length === 0
                    ? "Skip — no reports"
                    : `Next · ${reports.length} report${reports.length === 1 ? "" : "s"}`}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
