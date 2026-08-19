// Shrinks a photo in the browser before it is uploaded.
//
// A receipt snapped on an Android phone is typically 3–8 MB at 4000px wide.
// Nobody ever views it above ~1600px, so uploading the original burns the
// employee's mobile data for no benefit — and on 3G a 5 MB upload is well over
// a minute of waiting. Resizing to 1600px at quality 0.72 usually lands around
// 200–400 KB: the same readable receipt, a tenth of the bytes.
//
// Runs on the main thread but only briefly, and only on a file the user just
// picked, so the cost is invisible next to the upload it replaces.

const MAX_DIMENSION = 1600
const QUALITY = 0.72

// PDFs are already compact and re-encoding them isn't possible here. HEIC can't
// be decoded by every browser, so it's passed through untouched rather than
// risking a blank canvas.
function shouldCompress(file: File) {
  return (
    file.type === "image/jpeg" ||
    file.type === "image/png" ||
    file.type === "image/webp"
  )
}

export async function compressImage(file: File): Promise<File> {
  if (!shouldCompress(file)) return file
  if (typeof createImageBitmap !== "function") return file

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(
      1,
      MAX_DIMENSION / Math.max(bitmap.width, bitmap.height)
    )

    // Already small enough and already a JPEG — re-encoding would only lose
    // quality for no saving.
    if (scale === 1 && file.type === "image/jpeg") {
      bitmap.close()
      return file
    }

    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext("2d")
    if (!context) {
      bitmap.close()
      return file
    }
    context.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY)
    )
    if (!blob) return file

    // A screenshot of flat colour can grow as a JPEG. Keep whichever is smaller.
    if (blob.size >= file.size) return file

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg"
    return new File([blob], name, {
      type: "image/jpeg",
      lastModified: Date.now(),
    })
  } catch {
    // Decode failed (exotic format, out of memory on a low-end device) — send
    // the original rather than blocking the upload.
    return file
  }
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
