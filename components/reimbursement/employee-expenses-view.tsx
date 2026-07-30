"use client"

import { useState } from "react"
import {

  ChevronDown,
  Info,
  Plus,
  Receipt,
} from "lucide-react"
import type { ReimbursementStatus } from "@/app/generated/prisma/client"
import {
  REIMBURSEMENT_GUIDELINES,
  REIMBURSEMENT_STATUS_CHIP,
  REIMBURSEMENT_STATUS_LABELS,
  peso,
} from "@/lib/reimbursement"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import dynamic from "next/dynamic"
import { FileLink } from "@/components/reimbursement/file-upload"
import { FundCard } from "@/components/reimbursement/fund-card"
import type { ClientChoice } from "@/components/reimbursement/client-choice"

// The whole filing form -- client combobox, upload, repeating rows -- is behind
// a tap. Most visits are just to check a balance, so it should not be part of
// what the page costs to open.
const LiquidationForm = dynamic(() =>
  import("@/components/reimbursement/liquidation-form").then((m) => m.LiquidationForm)
)

export type ClaimItem = {
  id: string
  clientName: string | null
  soNumber: string | null
  description: string
  amount: number
}

export type Claim = {
  id: string
  referenceNo: string
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
  items: ClaimItem[]
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function ClaimCard({ claim }: { claim: Claim }) {
  const [open, setOpen] = useState(false)

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="group/claim rounded-xl ring-1 ring-foreground/10"
    >
      <CollapsibleTrigger className="flex w-full items-center gap-3 p-3 text-left outline-none">
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">
              {claim.referenceNo}
            </span>
            <Badge className={REIMBURSEMENT_STATUS_CHIP[claim.status]}>
              {REIMBURSEMENT_STATUS_LABELS[claim.status]}
            </Badge>
            {claim.isLate && (
              <Badge className="bg-amber-600/10 text-amber-700 dark:text-amber-400">
                Late
              </Badge>
            )}
          </span>
          <span className="text-xs text-muted-foreground">
            {shortDate(claim.expenseDate)} · {claim.items.length}{" "}
            {claim.items.length === 1 ? "entry" : "entries"}
          </span>
        </span>

        <span className="shrink-0 text-right">
          <span className="block text-sm font-semibold tabular-nums">
            {peso(claim.totalAmount)}
          </span>
        </span>

        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]/claim:rotate-180" />
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="flex flex-col gap-3 border-t p-3">
          {claim.status === "REJECTED" && claim.reviewNote && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <span className="font-medium">Rejected:</span> {claim.reviewNote}
            </p>
          )}
          {claim.status === "APPROVED" && (
            <p className="rounded-lg bg-sky-600/10 px-3 py-2 text-xs text-sky-700 dark:text-sky-400">
              Approved{claim.reviewedAt ? ` on ${shortDate(claim.reviewedAt)}` : ""}.
              Funds are released within 1–2 working days.
            </p>
          )}
          {claim.isLate && claim.lateReason && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <span className="font-medium">Reason for late filing:</span>{" "}
              {claim.lateReason}
            </p>
          )}

          {/* One receipt for the whole day, so it sits with the claim rather
              than repeating against every line. */}
          {claim.receiptKey && claim.receiptName ? (
            <FileLink fileKey={claim.receiptKey} name={claim.receiptName} />
          ) : (
            <p className="text-xs text-muted-foreground">
              No receipts attached to this liquidation.
            </p>
          )}

          <div className="flex flex-col divide-y">
            {claim.items.map((item) => (
              <div key={item.id} className="flex gap-3 py-2 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-tight">{item.description}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    {item.clientName ? (
                      <span>{item.clientName}</span>
                    ) : (
                      <span>Not client-specific</span>
                    )}
                    {item.soNumber && <span>· S.O. {item.soNumber}</span>}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-medium tabular-nums">
                  {peso(item.amount)}
                </span>
              </div>
            ))}
          </div>

          {claim.note && (
            <p className="text-xs text-muted-foreground">Note: {claim.note}</p>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function EmployeeExpensesView({
  claims,
  clients,
  released,
  liquidated,
  lastReleasedAt,
}: {
  claims: Claim[]
  clients: ClientChoice[]
  released: number
  liquidated: number
  lastReleasedAt: string | null
}) {
  const [formOpen, setFormOpen] = useState(false)

  return (
    <div className="flex flex-col gap-4">
      <FundCard
        released={released}
        liquidated={liquidated}
        lastReleasedAt={lastReleasedAt}
        onStart={() => setFormOpen(true)}
      />

      {/* Always visible, never behind a tap — these are the rules that decide
          whether someone gets their money back, and a collapsed panel is a
          panel nobody reads. Three columns on desktop keeps it to one band. */}
      <section className="rounded-xl bg-sky-600/5 p-3 ring-1 ring-sky-600/15">
        <p className="mb-2 flex items-center gap-2 text-sm font-medium">
          <Info className="size-4 shrink-0 text-sky-700 dark:text-sky-400" />
          Liquidation guidelines
        </p>
        <ul className="grid gap-2.5 sm:grid-cols-3">
          {REIMBURSEMENT_GUIDELINES.map((rule) => (
            <li key={rule.title} className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-sky-600 dark:bg-sky-400" />
              <span className="min-w-0">
                <span className="block text-xs leading-tight font-medium">
                  {rule.title}
                </span>
                <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                  {rule.detail}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {claims.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <Receipt className="size-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">No liquidations yet</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
              When you spend your own money on a job, file it here with the
              receipt and you&apos;ll be reimbursed.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setFormOpen(true)}
          >
            <Plus />
            New liquidation
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {claims.map((claim) => (
            <ClaimCard key={claim.id} claim={claim} />
          ))}
        </div>
      )}

      {formOpen && (
        <LiquidationForm clients={clients} open onOpenChange={setFormOpen} />
      )}
    </div>
  )
}
