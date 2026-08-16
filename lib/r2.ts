import "server-only"
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

// Cloudflare R2 speaks the S3 API, so the AWS SDK drives it — the only
// differences are the account-scoped endpoint and that region must be "auto".
//
// Required in .env:
//   R2_ACCOUNT_ID          the hex id from the R2 dashboard URL
//   R2_ACCESS_KEY_ID       from an R2 API token with Object Read & Write
//   R2_SECRET_ACCESS_KEY
//   R2_BUCKET              e.g. aerocore-uploads
const ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const BUCKET = process.env.R2_BUCKET

export function isR2Configured() {
  return Boolean(ACCOUNT_ID && ACCESS_KEY_ID && SECRET_ACCESS_KEY && BUCKET)
}

let client: S3Client | null = null

function r2() {
  if (!isR2Configured()) {
    throw new Error(
      "Cloudflare R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET in .env."
    )
  }
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: ACCESS_KEY_ID!,
      secretAccessKey: SECRET_ACCESS_KEY!,
    },
  })
  return client
}

// What a browser is allowed to hand us. Receipts are photographed on phones or
// exported as PDFs; anything else is almost certainly a mistake or an attack.
export const ALLOWED_UPLOAD_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
] as const

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

// The prefixes uploads are filed under. Each one has its own rules about what's
// allowed in it — receipts are PDF-only, a punch selfie is an image by
// definition — enforced by the action that mints the URL.
export type UploadFolder =
  | "receipts"
  | "funding-proof"
  | "attendance"
  | "reports"

export function isAllowedUploadType(type: string) {
  return (ALLOWED_UPLOAD_TYPES as readonly string[]).includes(type)
}

// Anything going into a key has to survive being a path segment: no slashes, no
// spaces, no accents that a download tool might mangle. Underscores live through
// it because they're what separates the fields of a filename. Empty in,
// "unnamed" out, so a key is never left with a hole in it.
export function keySegment(value: string, fallback = "unnamed", maxLength = 60) {
  const cleaned = value
    // NFKD splits an accent off its letter; the next pass then drops it, so
    // "José" comes through as "Jose" rather than "Jos".
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
  return cleaned || fallback
}

function extensionOf(filename: string) {
  if (!filename.includes(".")) return "bin"
  const raw = filename.split(".").pop()!
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin"
}

// Keys are server-generated: a client-supplied path could escape its prefix or
// overwrite someone else's file. The layout is browsable on purpose, because
// somebody eventually opens the bucket to find one receipt:
//
//   receipts/Prince/2026-07-30/2026-07-30_Prince_3.pdf
//   funding-proof/Obrey/2026-07-30/2026-07-30_1094230423.jpg
//
// owner is whoever uploaded it — the employee for a receipt, the administrator
// for proof of a transfer. The original filename is still kept in Postgres.
export function buildObjectKey({
  folder,
  owner,
  date,
  label,
  filename,
}: {
  folder: UploadFolder
  /** Uploader's first name; becomes the folder under the prefix. */
  owner: string
  /** YYYY-MM-DD — the day the money moved, not necessarily today. */
  date: string
  /** Filename without extension, already composed by the caller. */
  label: string
  /** The uploaded file's name, read only for its extension. */
  filename: string
}) {
  // The label is already three sanitised fields joined by underscores, so it
  // gets more room than a single name would.
  return `${folder}/${keySegment(owner, "unknown", 40)}/${date}/${keySegment(label, "unnamed", 120)}.${extensionOf(filename)}`
}

/**
 * Where a filed report lives, which is the same tree the Documents tab shows:
 *
 *   reports/2026/PMS/AEON-CREDIT-SERVICE/MAKATI/08-August/PMS-1042_ACS_MAKATI.pdf
 *
 * The branch segment is skipped for a client that has none, so a single-site
 * client's months sit directly under its own folder rather than under an empty
 * one. Every segment is composed by the caller from database rows — see
 * `lib/documents.ts` — so the bucket can be opened directly and read like a
 * filing cabinet, which is eventually what somebody does.
 */
export function buildReportKey({
  year,
  typeFolder,
  clientName,
  branchName,
  monthFolder,
  fileName,
}: {
  year: number
  typeFolder: string
  clientName: string
  branchName: string | null
  monthFolder: string
  /** Already composed and extension-bearing. */
  fileName: string
}) {
  // Sanitised either side of the dot, never across it: `keySegment` turns every
  // non-word character into a hyphen, and run over a whole filename it would
  // quietly eat the extension separator and leave "...MAKATI-pdf".
  const dot = fileName.lastIndexOf(".")
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName
  const extension = dot > 0 ? fileName.slice(dot + 1) : ""
  const leaf = extension
    ? `${keySegment(stem, "report", 120)}.${keySegment(extension, "bin", 8)}`
    : keySegment(stem, "report", 120)

  const segments = [
    "reports",
    String(year),
    keySegment(typeFolder, "report", 32),
    keySegment(clientName, "client", 64),
    ...(branchName ? [keySegment(branchName, "branch", 64)] : []),
    keySegment(monthFolder, "month", 16),
    leaf,
  ]

  return segments.join("/")
}

// Two people with the same first name, or a second attempt at the same
// liquidation, would otherwise land on one key and silently overwrite. Names
// stay clean in the common case and only pick up a "-2" when they have to.
export async function uniqueObjectKey(key: string, attempts = 5) {
  const dot = key.lastIndexOf(".")
  const stem = dot > 0 ? key.slice(0, dot) : key
  const extension = dot > 0 ? key.slice(dot) : ""

  for (let n = 1; n <= attempts; n++) {
    const candidate = n === 1 ? key : `${stem}-${n}${extension}`
    if (!(await objectExists(candidate))) return candidate
  }
  // Every variant is taken — fall back to a stamp rather than clobbering one.
  return `${stem}-${Date.now()}${extension}`
}

async function objectExists(key: string) {
  try {
    await r2().send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }))
    return true
  } catch {
    // A missing object throws NotFound; so does a permissions problem, and in
    // that case proceeding with the plain name is the old behaviour anyway.
    return false
  }
}

// The browser PUTs straight to R2 with this URL, so a 10 MB receipt never
// travels through a server action (which has a much smaller body limit).
export async function presignUpload(key: string, contentType: string) {
  return getSignedUrl(
    r2(),
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: 300 }
  )
}

// Receipts and funding proofs are private — the bucket stays closed and each
// view gets a short-lived signed URL instead of a public link.
export async function presignDownload(key: string, filename?: string) {
  return getSignedUrl(
    r2(),
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ...(filename
        ? {
            ResponseContentDisposition: `inline; filename="${filename.replace(/"/g, "")}"`,
          }
        : {}),
    }),
    { expiresIn: 600 }
  )
}

/**
 * One object's bytes, read on the server.
 *
 * Only for building an archive — anything a browser is meant to *see* goes out
 * as a presigned URL instead, so the file travels from storage to the phone
 * directly rather than through here twice. Missing objects come back null
 * rather than throwing: one deleted file should not take a folder download
 * down with it.
 */
export async function getObjectBytes(key: string) {
  try {
    const object = await r2().send(
      new GetObjectCommand({ Bucket: BUCKET, Key: key })
    )
    return (await object.Body?.transformToByteArray()) ?? null
  } catch {
    return null
  }
}

export async function deleteObject(key: string) {
  await r2().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
}
