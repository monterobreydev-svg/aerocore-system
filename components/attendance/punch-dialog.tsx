"use client"

import { useActionState, useEffect, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  MapPin,
  Upload,
} from "lucide-react"
import {
  createAttendanceUploadUrl,
  getAttendanceFileUrl,
  timeIn,
  timeOut,
  type PunchState,
} from "@/app/actions/attendance"
import { COARSE_FIX_METRES, coordinateLabel } from "@/lib/attendance"
import { compressImage, formatBytes } from "@/lib/compress-image"
import { useBrowserCapability } from "@/lib/use-browser-capability"
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
import { Field, FieldLabel } from "@/components/ui/field"
import { FileUpload, type UploadedFile } from "@/components/reimbursement/file-upload"
import {
  SelfieCapture,
  type CapturedSelfie,
} from "@/components/attendance/selfie-capture"

type Fix = {
  latitude: number
  longitude: number
  accuracy?: number
}

type Located =
  | { state: "locating" }
  | { state: "found"; fix: Fix }
  | { state: "failed"; reason: string }

function describeGeolocationError(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) {
    return "Location was blocked. Allow location for this site, then reopen this screen."
  }
  if (error.code === error.POSITION_UNAVAILABLE) {
    return "Your location couldn't be determined. Move somewhere with a clearer view of the sky and try again."
  }
  return "Getting your location took too long. Try again."
}

/**
 * One screen for a punch: the live photo, the GPS fix, and — on the way out —
 * the optional report. The selfie uploads as soon as it's taken, so the moment
 * the person taps the button there's nothing left to wait for but the record.
 */
export function PunchDialog({
  kind,
  open,
  onOpenChange,
}: {
  kind: "time-in" | "time-out"
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const isTimeIn = kind === "time-in"
  const [state, action, pending] = useActionState<PunchState, FormData>(
    isTimeIn ? timeIn : timeOut,
    undefined
  )

  const [selfie, setSelfie] = useState<CapturedSelfie | null>(null)
  const [selfieKey, setSelfieKey] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [located, setLocated] = useState<Located>({ state: "locating" })

  // Absent outside a secure context, exactly like the camera. Read at render
  // time so the reason is drawn immediately instead of after a wasted pass.
  const geolocationAvailable = useBrowserCapability(() =>
    Boolean(navigator.geolocation)
  )
  const [report, setReport] = useState<UploadedFile | null>(null)
  const [note, setNote] = useState("")

  // Asked for the moment this opens, so the fix is usually already in hand by
  // the time the photo is taken — a cold GPS start can take fifteen seconds.
  useEffect(() => {
    if (!geolocationAvailable) return
    let cancelled = false

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (cancelled) return
        setLocated({
          state: "found",
          fix: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          },
        })
      },
      (error) => {
        if (cancelled) return
        setLocated({ state: "failed", reason: describeGeolocationError(error) })
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 }
    )

    return () => {
      cancelled = true
    }
  }, [geolocationAvailable])

  useEffect(() => {
    if (state?.success) onOpenChange(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

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
        kind,
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

  // Without the API there is nothing to wait for, so say why rather than
  // spinning on "Getting your location…" forever.
  const location: Located = geolocationAvailable
    ? located
    : {
        state: "failed",
        reason:
          typeof window !== "undefined" && window.isSecureContext
            ? "This browser can't provide a location."
            : "Location only works over a secure (https) connection. Open the system using its https address.",
      }

  const fix = location.state === "found" ? location.fix : null
  const coarse = fix?.accuracy != null && fix.accuracy > COARSE_FIX_METRES
  const ready = Boolean(selfieKey && fix) && !pending && !uploading

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[94dvh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 p-0 sm:max-w-md">
        <DialogHeader className="border-b p-4 pr-12">
          <DialogTitle>{isTimeIn ? "Time in" : "Time out"}</DialogTitle>
          <DialogDescription className="text-xs">
            A photo taken now and your location are recorded with the time.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto p-4">
          <div className="flex flex-col gap-4">
            <SelfieCapture onCapture={handleCapture} />

            {/* Upload and location both report themselves, because both can
                fail silently on a weak signal and the person needs to know
                before they walk away from the site. */}
            <div className="flex flex-col gap-2 text-xs">
              {selfie && (
                <p
                  className={cn(
                    "flex items-center gap-2",
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
            </div>

            {/* The end-of-day report belongs to the punch that closes the day,
                not to a page of its own — it's written about this shift and read
                next to it. */}
            {!isTimeIn && (
              <div className="flex flex-col gap-3 rounded-xl border p-3">
                <div>
                  <p className="text-sm font-medium">
                    Report{" "}
                    <span className="font-normal text-muted-foreground">
                      — optional
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Anything the office should have on record for today.
                  </p>
                </div>

                <Field>
                  <FieldLabel className="text-xs">Attach a file</FieldLabel>
                  <FileUpload
                    folder="receipts"
                    value={report}
                    onChange={setReport}
                    disabled={pending}
                    label="Attach report"
                    // Filed under attendance, not receipts — and read back by
                    // the rule that owns attendance evidence.
                    upload={(filename, contentType, size) =>
                      createAttendanceUploadUrl(
                        "report",
                        filename,
                        contentType,
                        size
                      )
                    }
                    resolveUrl={getAttendanceFileUrl}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="report-note" className="text-xs">
                    Notes
                  </FieldLabel>
                  <Textarea
                    id="report-note"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    rows={3}
                    maxLength={2000}
                    placeholder="What was done, what's outstanding, anything that held the job up."
                    disabled={pending}
                  />
                </Field>
              </div>
            )}

            {state?.message && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {state.message}
              </p>
            )}
          </div>
        </div>

        <form action={action} className="border-t bg-muted/50 p-4">
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
          {!isTimeIn && (
            <>
              <input type="hidden" name="reportKey" value={report?.key ?? ""} />
              <input
                type="hidden"
                name="reportName"
                value={report?.name ?? ""}
              />
              <input type="hidden" name="reportNote" value={note} />
            </>
          )}

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
                <Upload />
                {isTimeIn ? "Time in now" : "Time out now"}
              </>
            )}
          </Button>
          {!ready && !pending && (
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              {!selfieKey
                ? "Take your photo first."
                : "Waiting for your location…"}
            </p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}
