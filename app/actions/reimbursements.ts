"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db/prisma"
import { canReachEmployee, verifySession } from "@/lib/auth"
import {
  buildObjectKey,
  isAllowedUploadType,
  isR2Configured,
  keySegment,
  MAX_UPLOAD_BYTES,
  presignDownload,
  presignUpload,
  uniqueObjectKey,
} from "@/lib/storage/r2"
import {
  buildFundContexts,
  FUND_RELEASE_METHODS,
  isLateExpense,
  nextReferenceNo,
  peso,
  splitAmount,
} from "@/lib/reimbursement"
import {
  CLAIM_DETAIL_SELECT,
  loadFunders,
  toAdminClaim,
} from "@/lib/reimbursement/query"
import { notifyEmployee, notifyReviewers } from "@/lib/notifications/notify"
import {
  CLAIM_PAGE_SIZE,
  type AdminClaim,
} from "@/components/reimbursement/admin-claim"

async function requireAdmin() {
  const session = await verifySession()
  if (session.role !== "DIRECTOR" && session.role !== "ADMINISTRATOR") {
    return null
  }
  return session
}

function revalidateAll() {
  revalidatePath("/employee/reimbursements")
  revalidatePath("/admin/reimbursements")
}

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------

export type UploadTicket =
  | { ok: true; url: string; key: string }
  | { ok: false; message: string }

// What the form knows that the file itself doesn't. Both are hints only: the
// server still decides the whole key, so a tampered value can at worst produce
// an oddly named file in the sender's own folder.
export type UploadContext = {
  /** Receipts: the day being liquidated (YYYY-MM-DD). */
  expenseDate?: string
  /** Funding proof: who the money is going to, which is what names the file. */
  employeeId?: string
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

function dateOnly(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(
    value.getDate()
  ).padStart(2, "0")}`
}

// Hands the browser a short-lived URL to PUT a file straight into R2. Going
// direct keeps a 10 MB receipt out of the server action body, which is capped
// far lower. The key is generated here, never accepted from the client.
export async function createUploadUrl(
  folder: "receipts" | "funding-proof",
  filename: string,
  contentType: string,
  size: number,
  context: UploadContext = {}
): Promise<UploadTicket> {
  const session = await verifySession()

  // Only admins upload proof of funding; anyone signed in can file a receipt.
  if (folder === "funding-proof") {
    if (session.role !== "DIRECTOR" && session.role !== "ADMINISTRATOR") {
      return { ok: false, message: "You can't upload proof of funding." }
    }
  }

  if (!isR2Configured()) {
    return {
      ok: false,
      message: "File storage isn't configured yet. Ask IT to set up R2.",
    }
  }
  // A day's receipts are compiled into one PDF before they're filed. Photos are
  // still fine for proof of a transfer, which is a single screenshot.
  if (folder === "receipts") {
    if (contentType !== "application/pdf") {
      return { ok: false, message: "Receipts have to be a single PDF file." }
    }
  } else if (!contentType.startsWith("image/") || !isAllowedUploadType(contentType)) {
    // Proof of a transfer is a screenshot. Images only, and not merely as a
    // convention: an image is resized and re-encoded in the browser before it
    // is sent, which a PDF can't be, so this is also what keeps the upload
    // small on a phone.
    return { ok: false, message: "Attach a screenshot — JPG, PNG, WEBP or HEIC." }
  }
  if (!Number.isFinite(size) || size <= 0 || size > MAX_UPLOAD_BYTES) {
    return { ok: false, message: "Files must be smaller than 10 MB." }
  }

  const uploader = await prisma.employee.findUnique({
    where: { id: session.employeeId },
    select: { firstName: true },
  })
  const owner = uploader?.firstName ?? "unknown"

  const { date, label } =
    folder === "receipts"
      ? await receiptNaming(session.employeeId, owner, context.expenseDate)
      : // Proof of a transfer is filed under the day it was sent and the person
        // it went to. That used to be the reference number the administrator
        // typed; with the number gone, the recipient is what anybody looking
        // for a particular transfer actually remembers.
        await fundingProofNaming(context.employeeId)

  const key = await uniqueObjectKey(
    buildObjectKey({ folder, owner, date, label, filename })
  )
  return { ok: true, url: await presignUpload(key, contentType), key }
}

// "2026-07-30_Prince_3" — the day being liquidated, who filed it, and which
// liquidation of theirs it is that month. The count is taken over the month the
// expense falls in, so a late June receipt filed in July numbers against June.
async function receiptNaming(
  employeeId: string,
  firstName: string,
  expenseDate: string | undefined
) {
  const parsed =
    expenseDate && DATE_ONLY.test(expenseDate)
      ? new Date(`${expenseDate}T00:00:00`)
      : null
  const day = parsed && !Number.isNaN(+parsed) ? parsed : new Date()

  const filed = await prisma.reimbursement.count({
    where: {
      employeeId,
      expenseDate: {
        gte: new Date(day.getFullYear(), day.getMonth(), 1),
        lt: new Date(day.getFullYear(), day.getMonth() + 1, 1),
      },
    },
  })

  const date = dateOnly(day)
  return {
    date,
    label: `${date}_${keySegment(firstName, "unknown")}_${filed + 1}`,
  }
}

// "2026-08-12_Juan-Dela-Cruz" — the day the transfer was sent and who received
// it. The name is read from the row rather than taken from the request, so a
// tampered id can at worst produce a proof filed under "unknown".
async function fundingProofNaming(employeeId: string | undefined) {
  const recipient = employeeId
    ? await prisma.employee.findUnique({
        where: { id: employeeId },
        select: { firstName: true, lastName: true },
      })
    : null

  const date = dateOnly(new Date())
  const name = recipient
    ? `${recipient.firstName}-${recipient.lastName}`
    : "unknown"

  return { date, label: `${date}_${keySegment(name, "unknown")}` }
}

// Signed view URL, minted per request. The bucket stays private, so this is
// the only way a receipt is readable — and only for someone allowed to see it.
export async function getFileUrl(key: string): Promise<string | null> {
  const session = await verifySession()
  if (!key || !isR2Configured()) return null

  const isAdmin = session.role === "DIRECTOR" || session.role === "ADMINISTRATOR"
  if (!isAdmin) {
    // An employee may only open the receipt attached to their own claim.
    const owned = await prisma.reimbursement.findFirst({
      where: { receiptKey: key, employeeId: session.employeeId },
      select: { id: true },
    })
    if (!owned) return null
  }

  return presignDownload(key)
}

// ---------------------------------------------------------------------------
// One employee's full liquidation history, for the staff record
// ---------------------------------------------------------------------------

// Everything they've filed — approved, rejected and still waiting. The review
// page is a work queue and only shows what needs deciding; the whole record
// belongs to the person, so it's read from the staff record instead, one page and
// one employee at a time. Sending it with the staff list would be
// O(employees x liquidations) on a page that mostly doesn't open them.
export async function listEmployeeReimbursements(
  employeeId: string,
  page = 1
): Promise<{ rows: AdminClaim[]; total: number; page: number; pages: number }> {
  const empty = { rows: [], total: 0, page: 1, pages: 1 }

  const session = await requireAdmin()
  if (!session || !employeeId) return empty
  if (!(await canReachEmployee(session.role, employeeId))) return empty

  // The running balance has to see everything this person has ever been given
  // and spent, or "fund before" on an old claim would be wrong. Narrow columns,
  // one employee, and none of it is returned as-is.
  const [ledgerReleases, ledgerClaims] = await Promise.all([
    prisma.fundRelease.findMany({
      where: { employeeId },
      select: { id: true, employeeId: true, amount: true, releasedAt: true },
    }),
    prisma.reimbursement.findMany({
      where: { employeeId },
      select: {
        id: true,
        employeeId: true,
        status: true,
        totalAmount: true,
        submittedAt: true,
      },
    }),
  ])

  const total = ledgerClaims.length
  if (total === 0) return empty

  const pages = Math.max(1, Math.ceil(total / CLAIM_PAGE_SIZE))
  const at = Math.min(Math.max(1, Math.trunc(page)), pages)

  const contexts = buildFundContexts(
    ledgerReleases.map((release) => ({
      id: release.id,
      employeeId: release.employeeId,
      amount: Number(release.amount),
      releasedAt: release.releasedAt.toISOString(),
    })),
    ledgerClaims.map((claim) => ({
      id: claim.id,
      employeeId: claim.employeeId,
      status: claim.status,
      totalAmount: Number(claim.totalAmount),
      submittedAt: claim.submittedAt.toISOString(),
    }))
  )

  // Newest filing first, whatever its state — a mixed list can't sort by the
  // review date because the ones still waiting don't have one.
  const records = await prisma.reimbursement.findMany({
    where: { employeeId },
    select: CLAIM_DETAIL_SELECT,
    orderBy: [{ submittedAt: "desc" }],
    skip: (at - 1) * CLAIM_PAGE_SIZE,
    take: CLAIM_PAGE_SIZE,
  })

  const funderIds = [
    ...new Set(
      records
        .map((record) => contexts[record.id]?.fundedByReleaseId)
        .filter((id): id is string => Boolean(id))
    ),
  ]

  const funders = await loadFunders(funderIds)

  return {
    rows: records.map((record) => toAdminClaim(record, contexts, funders)),
    total,
    page: at,
    pages,
  }
}

// ---------------------------------------------------------------------------
// Submitting a liquidation
// ---------------------------------------------------------------------------

// A line is just where the money went. When it was spent and the scan proving
// it belong to the claim — one liquidation covers one day, filed with one
// compiled receipt.
//
// A line can name several jobs: one tank of fuel serving two client sites is a
// single payment, charged evenly to each job it served. Naming none is valid
// too — not everything is billable to a job.
const ItemClientSchema = z.object({
  clientId: z.string().trim().min(1),
  soNumber: z.string().trim().max(60).optional(),
})

const ItemSchema = z.object({
  clients: z.array(ItemClientSchema).max(10).optional(),
  description: z.string().trim().min(1, "Describe what was bought."),
  amount: z.number().positive("Enter an amount greater than zero."),
})

const LiquidationSchema = z.object({
  expenseDate: z.string().min(1, "Pick the date being liquidated."),
  receiptKey: z.string().trim().min(1, "Attach the receipts as one PDF."),
  receiptName: z.string().trim().optional(),
  receiptType: z.string().trim().optional(),
  note: z.string().trim().max(1000).optional(),
  lateReason: z.string().trim().max(1000).optional(),
  items: z.array(ItemSchema).min(1, "Add at least one expense."),
})

export type LiquidationState =
  | {
      errors?: {
        items?: string[]
        expenseDate?: string[]
        lateReason?: string[]
        note?: string[]
        receipt?: string[]
      }
      message?: string
      success?: boolean
      referenceNo?: string
    }
  | undefined

export async function submitLiquidation(
  _state: LiquidationState,
  formData: FormData
): Promise<LiquidationState> {
  const session = await verifySession()

  let parsedItems: unknown
  try {
    parsedItems = JSON.parse(String(formData.get("items") ?? "[]"))
  } catch {
    return { message: "Something went wrong reading the expense rows." }
  }

  const validated = LiquidationSchema.safeParse({
    expenseDate: formData.get("expenseDate"),
    receiptKey: formData.get("receiptKey"),
    receiptName: formData.get("receiptName"),
    receiptType: formData.get("receiptType"),
    note: formData.get("note"),
    lateReason: formData.get("lateReason"),
    items: parsedItems,
  })

  if (!validated.success) {
    const flat = validated.error.flatten()
    return {
      errors: {
        ...flat.fieldErrors,
        receipt: flat.fieldErrors.receiptKey,
      },
      message:
        flat.fieldErrors.items?.[0] ??
        flat.fieldErrors.receiptKey?.[0] ??
        flat.fieldErrors.expenseDate?.[0] ??
        flat.formErrors[0] ??
        "Check the expense rows and try again.",
    }
  }

  const {
    expenseDate: rawDate,
    receiptKey,
    receiptName,
    receiptType,
    note,
    lateReason,
    items: rawItems,
  } = validated.data
  const now = new Date()

  const expenseDate = new Date(`${rawDate}T00:00:00`)
  if (Number.isNaN(+expenseDate)) {
    return { errors: { expenseDate: ["That isn't a valid date."] } }
  }
  if (expenseDate > now) {
    return { errors: { expenseDate: ["You can't liquidate a future date."] } }
  }

  // Recomputed server-side: the browser decides what to show, the server
  // decides what is true. A forged "not late" flag would skip the reason.
  const isLate = isLateExpense(expenseDate, now)
  if (isLate && !lateReason) {
    return {
      errors: {
        lateReason: [
          "This date is outside the filing window. Explain why before submitting.",
        ],
      },
      message: "A reason is required for a late liquidation.",
    }
  }

  // The receipt is the whole basis of the claim, and the office needs one
  // compiled PDF per day rather than a pile of phone photos.
  if (receiptType && receiptType !== "application/pdf") {
    return {
      errors: { receipt: ["Receipts must be a single PDF file."] },
      message: "Receipts must be a single PDF file.",
    }
  }

  // Named clients have to exist, and a job can only be named once per expense —
  // the browser prevents both, but the browser isn't what's authoritative here.
  // The split is recomputed here for the same reason: what each job is charged
  // is an accounting figure, not something to take the client's word for.
  const items = rawItems.map((item) => {
    const named = [
      ...new Map(
        (item.clients ?? []).map((link) => [link.clientId, link])
      ).values(),
    ]
    const shares = splitAmount(item.amount, named.length)
    return {
      description: item.description,
      amount: item.amount,
      clients: named.map((link, index) => ({
        clientId: link.clientId,
        soNumber: link.soNumber,
        amount: shares[index],
      })),
    }
  })

  const namedClientIds = [
    ...new Set(items.flatMap((item) => item.clients.map((c) => c.clientId))),
  ]
  if (namedClientIds.length > 0) {
    const found = await prisma.client.count({
      where: { id: { in: namedClientIds } },
    })
    if (found !== namedClientIds.length) {
      return { message: "One of the jobs you picked no longer exists." }
    }
  }

  const totalAmount = items.reduce((sum, item) => sum + item.amount, 0)

  const latest = await prisma.reimbursement.findFirst({
    orderBy: { referenceNo: "desc" },
    select: { referenceNo: true },
  })
  const referenceNo = nextReferenceNo(latest?.referenceNo, now)

  const claim = await prisma.reimbursement.create({
    data: {
      referenceNo,
      employeeId: session.employeeId,
      totalAmount,
      expenseDate,
      receiptKey,
      receiptName: receiptName || null,
      receiptType: receiptType || null,
      isLate,
      lateReason: isLate ? (lateReason ?? null) : null,
      note: note || null,
      items: {
        create: items.map((item) => ({
          description: item.description,
          amount: item.amount,
          clients: {
            create: item.clients.map((link) => ({
              clientId: link.clientId,
              soNumber: link.soNumber || null,
              amount: link.amount,
            })),
          },
        })),
      },
    },
    select: { employee: { select: { firstName: true, lastName: true } } },
  })

  // Whoever reviews it: the amount and who filed it are the two things that
  // decide whether they open it now or after lunch. Late filings say so,
  // since those are the ones that need a decision rather than a glance.
  await notifyReviewers({
    type: "LIQUIDATION_SUBMITTED",
    title: isLate ? "Late liquidation filed" : "New liquidation filed",
    body: `${claim.employee.firstName} ${claim.employee.lastName} filed ${referenceNo} for ${peso(totalAmount)}.`,
    destination: "reimbursements",
  })

  revalidateAll()
  return { success: true, referenceNo }
}

// ---------------------------------------------------------------------------
// Admin review
// ---------------------------------------------------------------------------

export type ReviewState =
  | { message?: string; success?: boolean }
  | undefined

export async function reviewLiquidation(
  _state: ReviewState,
  formData: FormData
): Promise<ReviewState> {
  const session = await requireAdmin()
  if (!session) {
    return { message: "You don't have permission to review liquidations." }
  }

  const schema = z.object({
    reimbursementId: z.string().min(1),
    decision: z.enum(["APPROVED", "REJECTED"]),
    reviewNote: z.string().trim().max(1000).optional(),
  })

  const validated = schema.safeParse({
    reimbursementId: formData.get("reimbursementId"),
    decision: formData.get("decision"),
    reviewNote: formData.get("reviewNote"),
  })
  if (!validated.success) return { message: "That decision isn't valid." }

  const { reimbursementId, decision, reviewNote } = validated.data

  // Rejecting needs a reason on the record — "no" without a why is the thing
  // employees end up chasing an administrator about.
  if (decision === "REJECTED" && !reviewNote) {
    return { message: "Add a reason when rejecting a liquidation." }
  }

  const existing = await prisma.reimbursement.findUnique({
    where: { id: reimbursementId },
    select: { status: true },
  })
  if (!existing) return { message: "That liquidation no longer exists." }

  await prisma.reimbursement.update({
    where: { id: reimbursementId },
    data: {
      status: decision,
      reviewedById: session.accountId,
      reviewedAt: new Date(),
      reviewNote: reviewNote || null,
    },
  })

  revalidateAll()
  return { success: true }
}

// ---------------------------------------------------------------------------
// Releasing a working fund to an employee
// ---------------------------------------------------------------------------

export type FundingState =
  | {
      errors?: {
        amount?: string[]
        proof?: string[]
        employeeId?: string[]
        method?: string[]
      }
      message?: string
      success?: boolean
    }
  | undefined

// Money handed over before it is spent, so this is recorded against the person
// rather than any one claim. Their balance is everything released minus
// everything they have since liquidated.
export async function releaseFund(
  _state: FundingState,
  formData: FormData
): Promise<FundingState> {
  const session = await requireAdmin()
  if (!session) {
    return { message: "You don't have permission to release funds." }
  }

  const schema = z.object({
    employeeId: z.string().min(1, "Pick an employee."),
    amount: z.coerce.number().positive("Enter an amount greater than zero."),
    // One of the five channels the office actually pays through. Free text here
    // collected four spellings of GCash, and this string is quoted straight
    // back to the employee in the notification they check their account
    // against.
    method: z.enum(FUND_RELEASE_METHODS, {
      message: "Pick how the money was sent.",
    }),
    note: z.string().trim().max(1000).optional(),
    proofKey: z.string().trim().optional(),
    proofName: z.string().trim().optional(),
    proofType: z.string().trim().optional(),
  })

  const validated = schema.safeParse({
    employeeId: formData.get("employeeId"),
    amount: formData.get("amount"),
    method: formData.get("method"),
    note: formData.get("note"),
    proofKey: formData.get("proofKey"),
    proofName: formData.get("proofName"),
    proofType: formData.get("proofType"),
  })
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors }
  }

  const { employeeId, amount, method, note, proofKey, proofName, proofType } =
    validated.data

  // Proof is the whole point of the release log -- a transfer with nothing
  // attached is exactly the record nobody can defend six months later.
  if (!proofKey) {
    return { errors: { proof: ["Attach proof of the transfer."] } }
  }

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true },
  })
  if (!employee) return { errors: { employeeId: ["That employee no longer exists."] } }

  await prisma.fundRelease.create({
    data: {
      employeeId,
      amount,
      method,
      // The column stays for the releases already recorded against a typed
      // reference; nothing writes to it now that the proof screenshot carries
      // the transaction detail.
      reference: null,
      note: note || null,
      proofKey,
      proofName: proofName || null,
      proofType: proofType || null,
      releasedById: session.accountId,
    },
  })

  // The employee is holding this money now, so they're told how much and how
  // it reached them — the method is what they check their account against.
  await notifyEmployee(employeeId, {
    type: "FUND_RELEASED",
    title: "Working fund released",
    body: `${peso(amount)} was released to you via ${method}.`,
    destination: "reimbursements",
  })

  revalidateAll()
  return { success: true }
}
