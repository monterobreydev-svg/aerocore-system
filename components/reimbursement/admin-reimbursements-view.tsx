"use client"

import { useMemo, useState } from "react"
import { Plus, Search, X } from "lucide-react"
import type { ReimbursementStatus } from "@/app/generated/prisma/client"
import {
  REIMBURSEMENT_STATUSES,
  REIMBURSEMENT_STATUS_CHIP,
  REIMBURSEMENT_STATUS_DOT,
  REIMBURSEMENT_STATUS_LABELS,
  peso,
} from "@/lib/reimbursement"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { FileLink } from "@/components/reimbursement/file-upload"
import { AdminClaimSheet } from "@/components/reimbursement/admin-claim-sheet"
import {
  ReleaseFundDialog,
  type EmployeeBalance,
} from "@/components/reimbursement/release-fund-dialog"

export type AdminClaimItem = {
  id: string
  clientName: string | null
  soNumber: string | null
  description: string
  amount: number
}

export type AdminClaim = {
  id: string
  referenceNo: string
  employeeId: string
  employeeName: string
  employeeNo: string | null
  status: ReimbursementStatus
  totalAmount: number
  expenseDate: string
  receiptKey: string | null
  receiptName: string | null
  isLate: boolean
  lateReason: string | null
  note: string | null
  submittedAt: string
  reviewedAt: string | null
  reviewNote: string | null
  reviewedByName: string | null
  items: AdminClaimItem[]
}

export type FundLedgerRow = {
  id: string
  employeeId: string
  employeeName: string
  amount: number
  method: string | null
  reference: string | null
  note: string | null
  proofKey: string | null
  proofName: string | null
  releasedAt: string
  releasedByName: string
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
}

export function AdminReimbursementsView({
  claims,
  releases,
  balances,
}: {
  claims: AdminClaim[]
  releases: FundLedgerRow[]
  balances: EmployeeBalance[]
}) {
  const [selected, setSelected] = useState<AdminClaim | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [releaseOpen, setReleaseOpen] = useState(false)
  const [presetEmployee, setPresetEmployee] = useState<string | undefined>()
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<ReimbursementStatus | "all">(
    "all"
  )

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return claims.filter((claim) => {
      if (statusFilter !== "all" && claim.status !== statusFilter) return false
      if (!needle) return true
      return [
        claim.referenceNo,
        claim.employeeName,
        claim.employeeNo,
        ...claim.items.map((i) => i.description),
        ...claim.items.map((i) => i.soNumber),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle)
    })
  }, [claims, query, statusFilter])

  const counts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const claim of claims) map[claim.status] = (map[claim.status] ?? 0) + 1
    return map
  }, [claims])

  // Only people who actually have money in play — a roster of everyone with
  // nothing released is noise on this page.
  const activeBalances = balances.filter(
    (b) => b.released > 0 || b.liquidated > 0
  )

  function openRelease(employeeId?: string) {
    setPresetEmployee(employeeId)
    setReleaseOpen(true)
  }

  return (
    <div className="flex flex-col gap-3">
      <Tabs defaultValue="liquidations">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList variant="line" className="border-b">
            <TabsTrigger value="liquidations" className="px-3">
              Liquidations
              {counts.PENDING_REVIEW ? (
                <Badge variant="secondary" className="ml-1.5">
                  {counts.PENDING_REVIEW}
                </Badge>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="funds" className="px-3">
              Working funds
            </TabsTrigger>
          </TabsList>

          <Button type="button" onClick={() => openRelease()}>
            <Plus />
            Release fund
          </Button>
        </div>

        <TabsContent value="liquidations" className="flex flex-col gap-3 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-56 flex-1 sm:max-w-xs">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search employee, reference or S.O."
                aria-label="Search liquidations"
                className="h-9 pl-9"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground outline-none hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                variant={statusFilter === "all" ? "secondary" : "ghost"}
                size="sm"
                className="h-8"
                onClick={() => setStatusFilter("all")}
              >
                All
              </Button>
              {REIMBURSEMENT_STATUSES.map((status) => (
                <Button
                  key={status}
                  type="button"
                  variant={statusFilter === status ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8 gap-1.5"
                  onClick={() => setStatusFilter(status)}
                >
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      REIMBURSEMENT_STATUS_DOT[status]
                    )}
                  />
                  {REIMBURSEMENT_STATUS_LABELS[status]}
                  {counts[status] ? (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {counts[status]}
                    </span>
                  ) : null}
                </Button>
              ))}
            </div>
          </div>

          {visible.length === 0 ? (
            <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              {claims.length === 0
                ? "No liquidations have been filed yet."
                : "No liquidations match those filters."}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Reference</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead className="whitespace-nowrap">Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((claim) => (
                    <TableRow
                      key={claim.id}
                      className="cursor-pointer"
                      onClick={() => {
                        setSelected(claim)
                        setSheetOpen(true)
                      }}
                    >
                      <TableCell>
                        <div className="font-mono text-xs">
                          {claim.referenceNo}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {claim.items.length}{" "}
                          {claim.items.length === 1 ? "entry" : "entries"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{claim.employeeName}</div>
                        {claim.employeeNo && (
                          <div className="font-mono text-xs text-muted-foreground">
                            {claim.employeeNo}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="text-sm">
                          {shortDate(claim.expenseDate)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          filed {shortDate(claim.submittedAt)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium tabular-nums">
                        {peso(claim.totalAmount)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          <Badge
                            className={REIMBURSEMENT_STATUS_CHIP[claim.status]}
                          >
                            {REIMBURSEMENT_STATUS_LABELS[claim.status]}
                          </Badge>
                          {claim.isLate && (
                            <Badge className="bg-amber-600/10 text-amber-700 dark:text-amber-400">
                              Late
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="funds" className="flex flex-col gap-4 pt-4">
          <div>
            <p className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Who is holding what
            </p>
            {activeBalances.length === 0 ? (
              <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                No funds have been released yet.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead>Employee</TableHead>
                      <TableHead className="text-right">Released</TableHead>
                      <TableHead className="text-right">Liquidated</TableHead>
                      <TableHead className="text-right">On hand</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeBalances.map((balance) => {
                      const onHand = balance.released - balance.liquidated
                      return (
                        <TableRow
                          key={balance.id}
                          className="hover:bg-transparent"
                        >
                          <TableCell>
                            <div className="text-sm">{balance.name}</div>
                            {balance.employeeNo && (
                              <div className="font-mono text-xs text-muted-foreground">
                                {balance.employeeNo}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {peso(balance.released)}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {peso(balance.liquidated)}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "text-right text-sm font-semibold tabular-nums",
                              onHand < 0 && "text-destructive"
                            )}
                          >
                            {peso(onHand)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => openRelease(balance.id)}
                            >
                              Top up
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Release history
            </p>
            {releases.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing released yet.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="whitespace-nowrap">Date</TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Proof</TableHead>
                      <TableHead>Released by</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {releases.map((release) => (
                      <TableRow
                        key={release.id}
                        className="hover:bg-transparent"
                      >
                        <TableCell className="whitespace-nowrap text-sm">
                          {shortDate(release.releasedAt)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {release.employeeName}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium tabular-nums">
                          {peso(release.amount)}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div>{release.method ?? "—"}</div>
                          {release.reference && (
                            <div className="font-mono text-xs text-muted-foreground">
                              {release.reference}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {release.proofKey && release.proofName ? (
                            <FileLink
                              fileKey={release.proofKey}
                              name={release.proofName}
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {release.releasedByName}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <AdminClaimSheet
        key={selected?.id}
        claim={selected}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />

      <ReleaseFundDialog
        employees={balances}
        presetEmployeeId={presetEmployee}
        open={releaseOpen}
        onOpenChange={setReleaseOpen}
      />
    </div>
  )
}
