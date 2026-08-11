"use client"

import { useMemo, useState } from "react"
import {
  ArrowDownLeft,
  ChevronDown,
  Info,
  Plus,
  Receipt,
  Wallet,
} from "lucide-react"
import type { ReimbursementStatus } from "@/app/generated/prisma/client"
import {
  REIMBURSEMENT_GUIDELINES,
  REIMBURSEMENT_STATUS_CHIP,
  REIMBURSEMENT_STATUS_LABELS,
  peso,
} from "@/lib/reimbursement"
import { cn } from "@/lib/utils"
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
  description: string
  amount: number
  clients: { name: string; soNumber: string | null; amount: number }[]
}

// Where this liquidation sat in the fund at the moment it was filed. Computed
// on the server against the whole ledger — three numbers, not a row set.
export type ClaimFund = {
  before: number
  after: number
  shortfall: number
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
  fund: ClaimFund
}

export type FundRelease = {
  id: string
  amount: number
  releasedAt: string
  method: string | null
  reference: string | null
  note: string | null
  proofKey: string | null
  proofName: string | null
  releasedByName: string
  /** Fund on hand straight after this top-up landed. */
  balanceAfter: number
}

// One history list, two kinds of event. Money coming in and money going out
// have to sit on the same timeline or the balance appears to change by itself.
type LedgerEntry =
  | { kind: "claim"; at: string; claim: Claim }
  | { kind: "release"; at: string; release: FundRelease }

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

// "Aug 10 – 16" when the week sits inside one month, "Aug 31 – Sep 6" when it
// doesn't. The year is left off: it's this week, nobody needs telling.
function weekRange(start: string, end: string) {
  const from = new Date(start)
  const to = new Date(end)
  const sameMonth = from.getMonth() === to.getMonth()

  return `${from.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })} – ${to.toLocaleDateString(undefined, {
    month: sameMonth ? undefined : "short",
    day: "numeric",
  })}`
}

// A caption that belongs to the number above it, not a paragraph.
function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: "spend" | "left"
}) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-2 sm:block">
      <p className="text-[10px] leading-tight tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p
        className={cn(
          "truncate text-sm font-semibold tabular-nums sm:mt-0.5",
          tone === "spend" && "text-amber-700 dark:text-amber-400",
          tone === "left" && "text-emerald-700 dark:text-emerald-400"
        )}
      >
        {value}
      </p>
    </div>
  )
}

// The arithmetic of one liquidation, in the order it happened: what was in hand,
// what this took out, what was left. This is the answer to "why is my balance
// this number" for the single row the employee is looking at.
function FundTrail({ claim }: { claim: Claim }) {
  const { before, after, shortfall } = claim.fund
  const rejected = claim.status === "REJECTED"

  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2.5 ring-1 ring-foreground/5">
      {/* Label-left / figure-right stacked rows on a phone, three labelled
          columns once there's width for them — ₱ figures side by side at 360px
          would truncate to the point of being unreadable. */}
      <div className="flex flex-col gap-1 sm:grid sm:grid-cols-3 sm:gap-3">
        <Stat label="Fund before" value={peso(before)} />
        <Stat
          label={rejected ? "Not deducted" : "This liquidation"}
          value={`−${peso(claim.totalAmount)}`}
          tone={rejected ? undefined : "spend"}
        />
        <Stat
          label="Fund after"
          value={peso(after)}
          tone={after < 0 ? undefined : "left"}
        />
      </div>

      {rejected && (
        <p className="mt-2 border-t border-foreground/5 pt-2 text-[11px] leading-snug text-muted-foreground">
          Rejected, so nothing was taken off your fund — that money is still
          yours to account for.
        </p>
      )}
      {!rejected && shortfall > 0 && (
        <p className="mt-2 border-t border-foreground/5 pt-2 text-[11px] leading-snug text-rose-700 dark:text-rose-400">
          {peso(shortfall)} of this went beyond the fund you were holding — that
          part came out of your own pocket.
        </p>
      )}
    </div>
  )
}

// Money in. Deliberately the lighter card of the two: it carries an amount, a
// balance and the proof, and nothing to open.
function ReleaseCard({ release }: { release: FundRelease }) {
  const detail = [release.method, release.reference].filter(Boolean).join(" · ")

  return (
    <div className="rounded-xl bg-emerald-600/[0.04] p-3 ring-1 ring-emerald-600/20">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-600/10 text-emerald-700 dark:text-emerald-400">
          <ArrowDownLeft className="size-4" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium">Fund released</p>
            <p className="shrink-0 text-sm font-semibold text-emerald-700 tabular-nums dark:text-emerald-400">
              +{peso(release.amount)}
            </p>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {shortDate(release.releasedAt)} · by {release.releasedByName}
          </p>
          {detail && (
            <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
              {detail}
            </p>
          )}
          {release.note && (
            <p className="mt-1 text-xs text-muted-foreground">{release.note}</p>
          )}
          {release.proofKey && release.proofName && (
            <FileLink
              className="mt-1"
              fileKey={release.proofKey}
              name={release.proofName}
            />
          )}

          <p className="mt-2 border-t border-emerald-600/15 pt-1.5 text-[11px] text-muted-foreground">
            Fund on hand after this:{" "}
            <span className="font-medium text-foreground tabular-nums">
              {peso(release.balanceAfter)}
            </span>
          </p>
        </div>
      </div>
    </div>
  )
}

// One expense line and the jobs it was charged to. The shares are indented under
// the description with a rule down the side, so a payment split three ways reads
// as one thing divided rather than three unrelated lines of grey text.
function ItemRow({ item }: { item: ClaimItem }) {
  const split = item.clients.length > 1

  return (
    <div className="py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 flex-1 text-sm leading-tight font-medium break-words">
          {item.description}
        </p>
        <p className="shrink-0 text-sm font-semibold tabular-nums">
          {peso(item.amount)}
        </p>
      </div>

      {item.clients.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">Not job-specific</p>
      ) : (
        <>
          {split && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Split across {item.clients.length} jobs
            </p>
          )}
          <ul className="mt-1.5 flex flex-col gap-1.5 border-l-2 border-foreground/10 pl-2.5">
            {item.clients.map((client, index) => (
              <li
                key={`${client.name}-${index}`}
                className="flex items-baseline justify-between gap-3"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-xs leading-tight break-words">
                    {client.name}
                  </span>
                  {client.soNumber && (
                    <span className="mt-0.5 block font-mono text-[11px] break-all text-muted-foreground">
                      S.O. {client.soNumber}
                    </span>
                  )}
                </span>
                {split && (
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {peso(client.amount)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function ClaimCard({ claim }: { claim: Claim }) {
  const [open, setOpen] = useState(false)
  const counted = claim.status !== "REJECTED"

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="group/claim rounded-xl ring-1 ring-foreground/10"
    >
      <CollapsibleTrigger className="flex w-full items-start gap-3 p-3 text-left outline-none">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground/5 text-muted-foreground">
          <Receipt className="size-4" />
        </span>

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

        {/* The amount alone never explained the balance. The line under it is
            the whole point of the history: this is what the fund stood at once
            this liquidation went through. */}
        <span className="shrink-0 text-right">
          <span className="block text-sm font-semibold tabular-nums">
            −{peso(claim.totalAmount)}
          </span>
          <span className="mt-0.5 block text-[11px] whitespace-nowrap text-muted-foreground tabular-nums">
            {counted ? `Left ${peso(claim.fund.after)}` : "No change"}
          </span>
        </span>

        <ChevronDown className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]/claim:rotate-180" />
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

          <FundTrail claim={claim} />

          {/* One receipt for the whole day, so it sits with the claim rather
              than repeating against every line. */}
          {claim.receiptKey && claim.receiptName ? (
            <FileLink fileKey={claim.receiptKey} name={claim.receiptName} />
          ) : (
            <p className="text-xs text-muted-foreground">
              No receipts attached to this liquidation.
            </p>
          )}

          <div>
            <p className="mb-1.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              Breakdown
            </p>
            <div className="flex flex-col divide-y rounded-lg border px-3 py-1">
              {claim.items.map((item) => (
                <ItemRow key={item.id} item={item} />
              ))}
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-3 px-3">
              <span className="text-xs text-muted-foreground">Total</span>
              <span className="text-sm font-semibold tabular-nums">
                {peso(claim.totalAmount)}
              </span>
            </div>
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
  releases,
  clients,
  released,
  liquidated,
  lastReleasedAt,
  weekStart,
  weekEnd,
  hasEarlier,
}: {
  claims: Claim[]
  releases: FundRelease[]
  clients: ClientChoice[]
  released: number
  liquidated: number
  lastReleasedAt: string | null
  /** Monday of the week on screen, ISO. */
  weekStart: string
  /** The Sunday that closes it, ISO. */
  weekEnd: string
  /** Anything at all filed or released before this week. */
  hasEarlier: boolean
}) {
  const [formOpen, setFormOpen] = useState(false)

  // Both sides already arrive newest-first from the server, so this is a merge,
  // not a sort of the whole history on every render.
  const entries = useMemo<LedgerEntry[]>(
    () =>
      [
        ...claims.map((claim) => ({
          kind: "claim" as const,
          at: claim.submittedAt,
          claim,
        })),
        ...releases.map((release) => ({
          kind: "release" as const,
          at: release.releasedAt,
          release,
        })),
      ].sort((a, b) => b.at.localeCompare(a.at)),
    [claims, releases]
  )

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
          panel nobody reads. But unmissable has to be cheap: as chips they wrap
          to two lines on a phone instead of filling a screen, and there is no
          heading, because a panel of four short phrases doesn't need announcing
          past the icon. */}
      <ul className="flex flex-wrap items-center gap-1.5 rounded-xl bg-sky-600/5 px-2.5 py-2 ring-1 ring-sky-600/15">
        {/* The icon is the whole heading on screen, so the words it stands in
            for are still said to a screen reader. */}
        <li className="flex items-center">
          <Info
            aria-hidden
            className="size-3.5 shrink-0 text-sky-700 dark:text-sky-400"
          />
          <span className="sr-only">Liquidation guidelines</span>
        </li>
        {REIMBURSEMENT_GUIDELINES.map((rule) => (
          <li
            key={rule}
            className="rounded-full bg-sky-600/10 px-2 py-0.5 text-[11px] leading-tight text-sky-800 dark:text-sky-300"
          >
            {rule}
          </li>
        ))}
      </ul>

      {/* One week, Monday to Sunday. The balance above is lifetime; this list is
          just what moved it recently. The office keeps the permanent record, so
          nothing here has to grow without end. */}
      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <Wallet className="size-4 shrink-0 text-muted-foreground" />
            This week
          </h3>
          <span className="text-xs text-muted-foreground tabular-nums">
            {weekRange(weekStart, weekEnd)}
          </span>
        </div>

        {entries.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <Receipt className="size-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">
                {hasEarlier ? "Nothing this week yet" : "No liquidations yet"}
              </p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                {hasEarlier
                  ? "Nothing has been filed or released since Monday. Earlier weeks are on file with the office."
                  : "When you spend your own money on a job, file it here with the receipt and you'll be reimbursed."}
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
          <>
            {entries.map((entry) =>
              entry.kind === "release" ? (
                <ReleaseCard key={entry.release.id} release={entry.release} />
              ) : (
                <ClaimCard key={entry.claim.id} claim={entry.claim} />
              )
            )}

            {hasEarlier && (
              <p className="px-1 pt-1 text-center text-xs text-muted-foreground">
                Only this week is shown. Older liquidations stay on your record
                with the office.
              </p>
            )}
          </>
        )}
      </section>

      {formOpen && (
        <LiquidationForm clients={clients} open onOpenChange={setFormOpen} />
      )}
    </div>
  )
}
