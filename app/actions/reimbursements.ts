"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { verifySession } from "@/lib/auth"
import {
  buildObjectKey,
  isAllowedUploadType,
  isR2Configured,
  MAX_UPLOAD_BYTES,
  presignDownload,
  presignUpload,
} from "@/lib/r2"
import { isLateExpense, nextReferenceNo, peso } from "@/lib/reimbursement"
import { notifyEmployee, notifyReviewers } from "@/lib/notify"

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

// Hands the browser a short-lived URL to PUT a file straight into R2. Going
// direct keeps a 10 MB receipt out of the server action body, which is capped
// far lower. The key is generated here, never accepted from the client.
export async function createUploadUrl(
  folder: "receipts" | "funding-proof",
  filename: string,
  contentType: string,
  size: number
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
  if (!isAllowedUploadType(contentType)) {
    return { ok: false, message: "Upload a JPG, PNG, WEBP, HEIC or PDF." }
  }
  if (!Number.isFinite(size) || size <= 0 || size > MAX_UPLOAD_BYTES) {
    return { ok: false, message: "Files must be smaller than 10 MB." }
  }

  const key = buildObjectKey(folder, filename)
  return { ok: true, url: await presignUpload(key, contentType), key }
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
// Submitting a liquidation
// ---------------------------------------------------------------------------

// A line is just where the money went. When it was spent and the scan proving
// it belong to the claim — one liquidation covers one day, filed with one
// compiled receipt.
const ItemSchema = z.object({
  clientId: z.string().trim().optional(),
  soNumber: z.string().trim().max(60).optional(),
  description: z.string().trim().min(1, "Describe what was bought."),
  amount: z.number().positive("Enter an amount greater than zero."),
})

const LiquidationSchema = z.object({
  expenseDate: z.string().min(1, "Pick the date being liquidated."),
  receiptKey: z.string().trim().optional(),
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
      errors: flat.fieldErrors,
      message:
        flat.fieldErrors.items?.[0] ??
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
    items,
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
      receiptKey: receiptKey || null,
      receiptName: receiptName || null,
      receiptType: receiptType || null,
      isLate,
      lateReason: isLate ? (lateReason ?? null) : null,
      note: note || null,
      items: {
        create: items.map((item) => ({
          clientId: item.clientId || null,
          soNumber: item.soNumber || null,
          description: item.description,
          amount: item.amount,
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
      errors?: { amount?: string[]; proof?: string[]; employeeId?: string[] }
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
    method: z.string().trim().max(60).optional(),
    reference: z.string().trim().max(120).optional(),
    note: z.string().trim().max(1000).optional(),
    proofKey: z.string().trim().optional(),
    proofName: z.string().trim().optional(),
    proofType: z.string().trim().optional(),
  })

  const validated = schema.safeParse({
    employeeId: formData.get("employeeId"),
    amount: formData.get("amount"),
    method: formData.get("method"),
    reference: formData.get("reference"),
    note: formData.get("note"),
    proofKey: formData.get("proofKey"),
    proofName: formData.get("proofName"),
    proofType: formData.get("proofType"),
  })
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors }
  }

  const { employeeId, amount, method, reference, note, proofKey, proofName, proofType } =
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
      method: method || null,
      reference: reference || null,
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
    body: method
      ? `${peso(amount)} was released to you via ${method}.`
      : `${peso(amount)} was released to you.`,
    destination: "reimbursements",
  })

  revalidateAll()
  return { success: true }
}
