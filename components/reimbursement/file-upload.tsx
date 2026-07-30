"use client"

import { useRef, useState } from "react"
import { FileText, Loader2, Paperclip, X } from "lucide-react"
import { createUploadUrl, getFileUrl } from "@/app/actions/reimbursements"
import { cn } from "@/lib/utils"
import { compressImage, formatBytes } from "@/lib/compress-image"
import { Button } from "@/components/ui/button"

export type UploadedFile = {
  key: string
  name: string
  type: string
}

// Two-step upload: ask the server for a presigned PUT, then send the bytes
// straight to R2 from the browser. The file never passes through a server
// action, which keeps big phone photos from hitting the body-size limit.
export function FileUpload({
  folder,
  value,
  onChange,
  disabled,
  label = "Attach file",
  className,
}: {
  folder: "receipts" | "funding-proof"
  value: UploadedFile | null
  onChange: (file: UploadedFile | null) => void
  disabled?: boolean
  label?: string
  className?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Shown once after a compress so the employee can see the data they saved.
  const [saved, setSaved] = useState<string | null>(null)

  async function handleFile(original: File) {
    setError(null)
    setBusy(true)
    try {
      // Shrink first, then ask for a URL — the ticket is signed against the
      // final content type and the size check should see what we actually send.
      const file = await compressImage(original)
      if (file.size < original.size) {
        setSaved(
          `${formatBytes(original.size)} → ${formatBytes(file.size)}`
        )
      }

      const ticket = await createUploadUrl(folder, file.name, file.type, file.size)
      if (!ticket.ok) {
        setError(ticket.message)
        return
      }

      const response = await fetch(ticket.url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      })
      if (!response.ok) {
        setError("Upload failed. Check your connection and try again.")
        return
      }

      onChange({ key: ticket.key, name: file.name, type: file.type })
    } catch {
      setError("Upload failed. Check your connection and try again.")
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  if (value) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <FileText className="size-3.5 shrink-0 text-muted-foreground" />
        <button
          type="button"
          onClick={async () => {
            const url = await getFileUrl(value.key)
            if (url) window.open(url, "_blank", "noopener,noreferrer")
          }}
          className="min-w-0 flex-1 truncate text-left text-xs text-sky-700 underline-offset-2 outline-none hover:underline dark:text-sky-400"
        >
          {value.name}
        </button>
        {saved && (
          <span className="shrink-0 text-[11px] text-emerald-700 dark:text-emerald-400">
            {saved}
          </span>
        )}
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setSaved(null)
            onChange(null)
          }}
          aria-label="Remove file"
          className="rounded p-0.5 text-muted-foreground outline-none hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
        className="hidden"
        disabled={disabled || busy}
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) handleFile(file)
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 w-full justify-start px-2 text-xs font-normal"
        disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Paperclip className="size-3.5" />
        )}
        {busy ? "Uploading…" : label}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

// Opens a private object through a freshly signed URL. Nothing is public, so
// the link has to be minted at click time rather than baked into the page.
export function FileLink({
  fileKey,
  name,
  className,
}: {
  fileKey: string
  name: string
  className?: string
}) {
  const [busy, setBusy] = useState(false)

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          const url = await getFileUrl(fileKey)
          if (url) window.open(url, "_blank", "noopener,noreferrer")
        } finally {
          setBusy(false)
        }
      }}
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5 text-xs text-sky-700 underline-offset-2 outline-none hover:underline disabled:opacity-60 dark:text-sky-400",
        className
      )}
    >
      {busy ? (
        <Loader2 className="size-3.5 shrink-0 animate-spin" />
      ) : (
        <FileText className="size-3.5 shrink-0" />
      )}
      <span className="truncate">{name}</span>
    </button>
  )
}
