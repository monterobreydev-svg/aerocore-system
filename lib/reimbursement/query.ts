import "server-only"
import type { Prisma } from "@/app/generated/prisma/client"
import { prisma } from "@/lib/db/prisma"
import type { FundContext } from "@/lib/reimbursement"
import type {
  AdminClaim,
  ClaimFunder,
} from "@/components/reimbursement/admin-claim"

// One definition of "a liquidation, in enough detail to decide on it", shared by
// the review page and the per-employee history on the staff record. Two copies
// of this select would drift, and one of them would quietly start shipping
// columns nothing reads.

// Named fields only. `include: { items: true }` here would ship every column of
// every line — receipt types, timestamps and all — for rows the table never
// reads.
export const CLAIM_DETAIL_SELECT = {
  id: true,
  referenceNo: true,
  employeeId: true,
  status: true,
  totalAmount: true,
  expenseDate: true,
  receiptKey: true,
  receiptName: true,
  isLate: true,
  lateReason: true,
  note: true,
  submittedAt: true,
  reviewedAt: true,
  reviewNote: true,
  employee: { select: { firstName: true, lastName: true, employeeNo: true } },
  reviewedBy: {
    select: { employee: { select: { firstName: true, lastName: true } } },
  },
  items: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      description: true,
      amount: true,
      clients: {
        select: {
          soNumber: true,
          amount: true,
          client: { select: { name: true } },
        },
        orderBy: { client: { name: "asc" } },
      },
    },
  },
} satisfies Prisma.ReimbursementSelect

export type ClaimDetailRecord = Prisma.ReimbursementGetPayload<{
  select: typeof CLAIM_DETAIL_SELECT
}>

// Only the releases the visible claims actually point at. The release log is
// paginated, so the transfer that funded a claim on this page may well be on
// another page of it entirely.
export async function loadFunders(releaseIds: string[]) {
  const funders = new Map<string, ClaimFunder>()
  if (releaseIds.length === 0) return funders

  const records = await prisma.fundRelease.findMany({
    where: { id: { in: releaseIds } },
    select: {
      id: true,
      amount: true,
      method: true,
      proofKey: true,
      proofName: true,
      releasedAt: true,
      releasedBy: {
        select: { employee: { select: { firstName: true, lastName: true } } },
      },
    },
  })

  for (const release of records) {
    funders.set(release.id, {
      amount: Number(release.amount),
      releasedAt: release.releasedAt.toISOString(),
      releasedByName: `${release.releasedBy.employee.firstName} ${release.releasedBy.employee.lastName}`,
      method: release.method,
      proofKey: release.proofKey,
      proofName: release.proofName,
    })
  }
  return funders
}

export function toAdminClaim(
  record: ClaimDetailRecord,
  contexts: Record<string, FundContext>,
  funders: Map<string, ClaimFunder>
): AdminClaim {
  const context = contexts[record.id]
  const fundedBy = context?.fundedByReleaseId
  return {
    id: record.id,
    referenceNo: record.referenceNo,
    employeeId: record.employeeId,
    employeeName: `${record.employee.firstName} ${record.employee.lastName}`,
    employeeNo: record.employee.employeeNo,
    status: record.status,
    totalAmount: Number(record.totalAmount),
    expenseDate: record.expenseDate.toISOString(),
    receiptKey: record.receiptKey,
    receiptName: record.receiptName,
    isLate: record.isLate,
    lateReason: record.lateReason,
    note: record.note,
    submittedAt: record.submittedAt.toISOString(),
    reviewedAt: record.reviewedAt?.toISOString() ?? null,
    reviewNote: record.reviewNote,
    reviewedByName: record.reviewedBy
      ? `${record.reviewedBy.employee.firstName} ${record.reviewedBy.employee.lastName}`
      : null,
    items: record.items.map((item) => ({
      id: item.id,
      description: item.description,
      amount: Number(item.amount),
      clients: item.clients.map((link) => ({
        name: link.client.name,
        soNumber: link.soNumber,
        amount: Number(link.amount),
      })),
    })),
    fund: {
      before: context?.before ?? 0,
      after: context?.after ?? 0,
      shortfall: context?.shortfall ?? 0,
    },
    funder: (fundedBy && funders.get(fundedBy)) || null,
  }
}
