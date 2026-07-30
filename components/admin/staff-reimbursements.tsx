"use client"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { Loader2, Receipt } from "lucide-react"
import { listEmployeeReimbursements } from "@/app/actions/reimbursements"
import { peso } from "@/lib/reimbursement"
import { Badge } from "@/components/ui/badge"
import { Pager } from "@/components/ui/pager"
import { ClaimRows } from "@/components/reimbursement/claim-table"
import {
  CLAIM_PAGE_SIZE,
  type AdminClaim,
} from "@/components/reimbursement/admin-claim"

const AdminClaimDialog = dynamic(() =>
  import("@/components/reimbursement/admin-claim-dialog").then(
    (m) => m.AdminClaimDialog
  )
)

type Page = { rows: AdminClaim[]; total: number; page: number; pages: number }

// Every liquidation this person has filed — approved, rejected and still
// waiting. The reimbursements page is a work queue and shows only what needs
// deciding; the record belongs to the person. Fetched on demand rather than
// shipped with the staff list: that list is every employee, and their history is
// unbounded — sending both together is the O(employees x liquidations) payload
// that makes a phone sit on a blank screen.
export function StaffReimbursements({
  employeeId,
  firstName,
}: {
  employeeId: string
  firstName: string
}) {
  const [page, setPage] = useState(1)
  // Cached per page, so stepping back through history is free.
  const [cache, setCache] = useState<Record<number, Page>>({})

  const current = cache[page]

  useEffect(() => {
    if (cache[page]) return
    let cancelled = false
    listEmployeeReimbursements(employeeId, page).then((result) => {
      if (!cancelled) setCache((prev) => ({ ...prev, [result.page]: result }))
    })
    return () => {
      cancelled = true
    }
  }, [employeeId, page, cache])

  const [selected, setSelected] = useState<AdminClaim | null>(null)
  const [open, setOpen] = useState(false)

  if (!current) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed p-12 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading {firstName}&apos;s liquidations…
      </div>
    )
  }

  if (current.total === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-12 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <Receipt className="size-5 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium">No liquidations yet</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            Everything {firstName} files lands here — approved, rejected or still
            waiting on a decision — with the amount, the breakdown and who
            decided it.
          </p>
        </div>
      </div>
    )
  }

  // Only what's actually been accounted for. A rejected claim isn't money the
  // office has agreed to, so counting it in a total would overstate the page.
  const approvedTotal = current.rows
    .filter((claim) => claim.status === "APPROVED")
    .reduce((sum, claim) => sum + claim.totalAmount, 0)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Every liquidation filed, newest first. Open a row for the breakdown,
          receipt and fund it was spent against.
        </p>
        <Badge variant="secondary" className="tabular-nums">
          {peso(approvedTotal)} approved on this page
        </Badge>
      </div>

      <ClaimRows
        claims={current.rows}
        onOpen={(claim) => {
          setSelected(claim)
          setOpen(true)
        }}
        showDecision
        hideEmployee
      />

      <Pager
        page={current.page}
        pages={current.pages}
        total={current.total}
        noun="liquidations"
        pageSize={CLAIM_PAGE_SIZE}
        onPage={setPage}
      />

      {open && selected && (
        <AdminClaimDialog
          key={selected.id}
          claim={selected}
          open
          onOpenChange={setOpen}
        />
      )}
    </div>
  )
}
