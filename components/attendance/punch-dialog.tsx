"use client"

import { useActionState, useEffect, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  LogIn,
  MapPin,
} from "lucide-react"
import {
  createAttendanceUploadUrl,
  timeIn,
  type PunchState,
} from "@/app/actions/attendance"
import { COARSE_FIX_METRES, coordinateLabel } from "@/lib/attendance"
import { compressImage, formatBytes } from "@/lib/storage/compress-image"
import { useGeolocationFix } from "@/lib/hooks/use-geolocation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
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

/**
 * Timing in: one photo, one position, one button.
 *
 * Deliberately stayed a single screen while timing out became three. Nothing is
 * filed at the start of a shift — there is only the punch — and putting a
 * stepper around one question would be ceremony for its own sake.
 */
export function PunchDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [state, action, pending] = useActionState<PunchState, FormData>(
    timeIn,
    undefined
  )

  const [selfie, setSelfie] = useState<CapturedSelfie | null>(null)
  const [selfieKey, setSelfieKey] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const location = useGeolocationFix()

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
        "time-in",
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 p-0 sm:max-w-md">
        <DialogHeader className="border-b p-4 pr-12">
          <DialogTitle>Time in</DialogTitle>
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
                <LogIn />
                Time in now
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
