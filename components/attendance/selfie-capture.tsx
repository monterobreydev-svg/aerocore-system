"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Camera, RotateCcw, ShieldAlert } from "lucide-react"
import { useBrowserCapability } from "@/lib/hooks/use-browser-capability"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

export type CapturedSelfie = { blob: Blob; previewUrl: string }

type Phase =
  | { state: "starting" }
  | { state: "live" }
  | { state: "captured" }
  | { state: "blocked"; reason: string; fixable: boolean }

// Why a camera can refuse, in words the person holding the phone can act on.
// "NotAllowedError" is not one of those words.
function describe(error: unknown): { reason: string; fixable: boolean } {
  const name = (error as { name?: string })?.name

  if (name === "NotAllowedError" || name === "SecurityError") {
    return {
      reason:
        "Camera access was blocked. Allow the camera for this site in your browser settings, then try again.",
      fixable: true,
    }
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return { reason: "No camera was found on this device.", fixable: false }
  }
  if (name === "NotReadableError") {
    return {
      reason:
        "The camera is already in use by another app. Close it and try again.",
      fixable: true,
    }
  }
  return { reason: "The camera couldn't be started.", fixable: true }
}

/**
 * A live capture, not a file picker: the photo can only come from the camera in
 * this page, taken now. That is the whole point of the punch selfie, and it's
 * also why this needs HTTPS — `navigator.mediaDevices` does not exist in a page
 * served over plain http to anything but localhost.
 */
export function SelfieCapture({
  onCapture,
  className,
}: {
  onCapture: (selfie: CapturedSelfie | null) => void
  className?: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [captureState, setPhase] = useState<Phase>({ state: "starting" })
  const [preview, setPreview] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  // Absent, not merely unpermitted, outside a secure context. Derived at render
  // time so the explanation is the first thing drawn rather than a camera error
  // that arrives a frame later.
  const supported = useBrowserCapability(() =>
    Boolean(navigator.mediaDevices?.getUserMedia)
  )

  const phase: Phase = supported
    ? captureState
    : {
        state: "blocked",
        reason:
          typeof window !== "undefined" && window.isSecureContext
            ? "This browser can't open the camera."
            : "The camera only works over a secure (https) connection. Open the system using its https address, or ask IT for the link.",
        fixable: false,
      }

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  // Opening the camera is the effect, and `attempt` is how the retry button
  // re-runs it. The cancelled flag matters: getUserMedia can resolve after the
  // dialog has closed, and a stream handed to a dead component keeps the
  // camera light on until the tab is closed.
  useEffect(() => {
    if (!supported) return
    let cancelled = false

    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
        setPhase({ state: "live" })
      } catch (error) {
        if (!cancelled) setPhase({ state: "blocked", ...describe(error) })
      }
    })()

    return () => {
      cancelled = true
      stop()
    }
  }, [supported, attempt, stop])

  // Revoke the object URL when it's replaced or the component goes away — a
  // retake on a slow phone otherwise leaks a few MB per attempt.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  async function capture() {
    const video = videoRef.current
    if (!video) return

    const canvas = document.createElement("canvas")
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext("2d")
    if (!context) return
    // Drawn unmirrored: the preview is flipped so it feels like a mirror, but
    // the stored photograph should be what the camera actually saw.
    context.drawImage(video, 0, 0, canvas.width, canvas.height)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.75)
    )
    if (!blob) return

    stop()
    const url = URL.createObjectURL(blob)
    setPreview(url)
    setPhase({ state: "captured" })
    onCapture({ blob, previewUrl: url })
  }

  // An event handler, so setting state here is fine — it is the effect body
  // that must not. Bumping the attempt re-runs the effect above.
  function retry() {
    setPhase({ state: "starting" })
    setAttempt((n) => n + 1)
  }

  function retake() {
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    onCapture(null)
    retry()
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-sidebar">
        {phase.state === "blocked" ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <ShieldAlert className="size-8 text-amber-400" />
            <p className="text-sm text-sidebar-foreground/80">{phase.reason}</p>
            {phase.fixable && (
              <Button type="button" variant="outline" size="sm" onClick={retry}>
                <RotateCcw />
                Try again
              </Button>
            )}
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              className={cn(
                "size-full scale-x-[-1] object-cover",
                phase.state !== "live" && "invisible"
              )}
            />
            {preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt="The photo just taken"
                className="absolute inset-0 size-full scale-x-[-1] object-cover"
              />
            )}
            {phase.state === "starting" && (
              <p className="absolute inset-0 flex items-center justify-center text-sm text-sidebar-foreground/70">
                Starting camera…
              </p>
            )}
          </>
        )}
      </div>

      {phase.state === "live" && (
        <Button type="button" size="lg" onClick={capture} className="w-full">
          <Camera />
          Take photo
        </Button>
      )}

      {phase.state === "captured" && (
        <Button
          type="button"
          size="lg"
          variant="outline"
          onClick={retake}
          className="w-full"
        >
          <RotateCcw />
          Retake
        </Button>
      )}
    </div>
  )
}
