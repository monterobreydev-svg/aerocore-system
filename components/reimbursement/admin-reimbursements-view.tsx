"use client"

import { useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { Plus, Search, X } from "lucide-react"
import { peso } from "@/lib/reimbursement"
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
import { ClaimRows, Pager } from "@/components/reimbursement/claim-table"
import {
  CLAIM_PAGE_SIZE,
  type AdminClaim,
  type AdminTab,
  type EmployeeBalance,
  type FundLedgerRow,
  type Paging,
} from "@/components/reimbursement/admin-claim"

// Both of these are a tap away and neither is on the first paint. The detail
// dialog in particular carries the review form, so it stays out of the chunk
// that just lists liquidations.
const AdminClaimDialog = dynamic(() =>
  import("@/components/reimbursement/admin-claim-dialog").then(
    (m) => m.AdminClaimDialog
  )
)
const ReleaseFundDialog = dynamic(() =>
  import("@/components/reimbursement/release-fund-dialog").then(
    (m) => m.ReleaseFundDialog
  )
)

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
}

export function AdminReimbursementsView({
  queue,
  releases,
  balances,
  paging,
}: {
  queue: AdminClaim[]
  releases: FundLedgerRow[]
  balances: EmployeeBalance[]
  paging: Paging
}) {
  const [selected, setSelected] = useState<AdminClaim | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [releaseOpen, setReleaseOpen] = useState(false)
  const [presetEmployee, setPresetEmployee] = useState<string | undefined>()
  const [query, setQuery] = useState("")
  const [queuePage, setQueuePage] = useState(1)
  // Which tab is open is browser state: every tab's first page is already in
  // this payload, so switching between them costs nothing. Only paging goes
  // back to the server.
  const [tab, setTab] = useState<AdminTab>(paging.tab)

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return queue
    return queue.filter((claim) => {
      return [
        claim.referenceNo,
        claim.employeeName,
        claim.employeeNo,
        ...claim.items.map((i) => i.description),
        ...claim.items.flatMap((i) => i.clients.map((c) => c.name)),
        ...claim.items.flatMap((i) => i.clients.map((c) => c.soNumber)),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle)
    })
  }, [queue, query])

  const queuePages = Math.max(1, Math.ceil(visible.length / CLAIM_PAGE_SIZE))
  // Searching can shrink the list under the current page — land on the last one
  // that still has rows rather than showing an empty table.
  const queueAt = Math.min(queuePage, queuePages)
  const queueRows = visible.slice(
    (queueAt - 1) * CLAIM_PAGE_SIZE,
    queueAt * CLAIM_PAGE_SIZE
  )

  // Only people who actually have money in play — a roster of everyone with
  // nothing released is noise on this page.
  const activeBalances = balances.filter(
    (b) => b.released > 0 || b.liquidated > 0
  )

  // The paging link carries the tab it came from, so the page it loads opens
  // where the administrator was.
  function releaseHref(page: number) {
    return `/admin/reimbursements?tab=funds&rp=${page}`
  }

  function openClaim(claim: AdminClaim) {
    setSelected(claim)
    setDetailOpen(true)
  }

  function openRelease(employeeId?: string) {
    setPresetEmployee(employeeId)
    setReleaseOpen(true)
  }

  return (
    <div className="flex flex-col gap-3">
      <Tabs value={tab} onValueChange={(value) => setTab(value as AdminTab)}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList variant="line" className="border-b">
            <TabsTrigger value="queue" className="px-3">
              For review
              {queue.length > 0 ? (
                <Badge variant="secondary" className="ml-1.5">
                  {queue.length}
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

        <TabsContent value="queue" className="flex flex-col gap-3 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-56 flex-1 sm:max-w-xs">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setQueuePage(1)
                }}
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

            {/* No status filter: everything here is waiting on a decision. Once
                one is made the liquidation leaves this list for the employee's
                staff record, which is where the full history lives. */}
            <p className="text-xs text-muted-foreground">
              Decided liquidations move to the employee&apos;s staff record.
            </p>
          </div>

          {visible.length === 0 ? (
            <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              {queue.length === 0
                ? "Nothing waiting on a decision."
                : "No liquidations match that search."}
            </div>
          ) : (
            <>
              <ClaimRows claims={queueRows} onOpen={openClaim} />
              <Pager
                page={queueAt}
                pages={queuePages}
                total={visible.length}
                noun="awaiting a decision"
                onPage={setQueuePage}
              />
            </>
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

          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Release history
            </p>
            {paging.releaseTotal === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing released yet.
              </p>
            ) : (
              <>
                <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead className="whitespace-nowrap">
                          Date
                        </TableHead>
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
                              // Capped, or one long voucher filename stretches
                              // the whole column.
                              <FileLink
                                fileKey={release.proofKey}
                                name={release.proofName}
                                className="max-w-40"
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
                <Pager
                  page={paging.releasePage}
                  pages={paging.releasePages}
                  total={paging.releaseTotal}
                  noun="releases"
                  hrefFor={releaseHref}
                />
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {detailOpen && selected && (
        <AdminClaimDialog
          key={selected.id}
          claim={selected}
          open
          onOpenChange={setDetailOpen}
        />
      )}

      {releaseOpen && (
        <ReleaseFundDialog
          key={presetEmployee ?? "any"}
          employees={balances}
          presetEmployeeId={presetEmployee}
          open
          onOpenChange={setReleaseOpen}
        />
      )}
    </div>
  )
}
