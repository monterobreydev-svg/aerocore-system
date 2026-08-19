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

/**
 * How long a customer code may be.
 *
 * Generous, because the code belongs to the customer rather than to us — it is
 * whatever their own filing uses, and some of those are long. The cap is here
 * to stop a pasted paragraph, not to impose a house format.
 */
export const CUSTOMER_CODE_MAX_LENGTH = 32
