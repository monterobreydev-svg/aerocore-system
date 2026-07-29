import type { TaxStatus } from "@/app/generated/prisma/client"

const TAX_STATUS_LABELS: Record<TaxStatus, string> = {
  VAT: "VAT registered",
  NON_VAT: "Non-VAT",
  VAT_EXEMPT: "VAT exempt",
  ZERO_RATED: "Zero-rated",
}

export function taxStatusLabel(status: TaxStatus) {
  return TAX_STATUS_LABELS[status]
}

export const TAX_STATUS_OPTIONS = Object.keys(TAX_STATUS_LABELS) as TaxStatus[]
