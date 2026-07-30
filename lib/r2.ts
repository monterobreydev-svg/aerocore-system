import "server-only"
import { randomUUID } from "crypto"
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"
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

export function isAllowedUploadType(type: string) {
  return (ALLOWED_UPLOAD_TYPES as readonly string[]).includes(type)
}

// Keys are server-generated: a client-supplied path could escape its prefix or
// overwrite someone else's file. The original name is kept in Postgres instead.
export function buildObjectKey(folder: "receipts" | "funding-proof", filename: string) {
  const extension = filename.includes(".")
    ? filename.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8)
    : "bin"
  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  return `${folder}/${month}/${randomUUID()}.${extension}`
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

export async function deleteObject(key: string) {
  await r2().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
}
