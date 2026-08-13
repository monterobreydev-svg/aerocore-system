"use client"

import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { LinkPending } from "@/components/ui/link-pending"

// Two modes on purpose. A server-paged list arrives as links, because the next
// page of rows has to be fetched. A list already in the browser pages with state
// and no round trip — which also means a search runs across the whole list, not
// just the page being looked at.
export function Pager({
  page,
  pages,
  total,
  noun,
  pageSize,
  label,
  unit = "Page",
  hrefFor,
  prevHref,
  nextHref,
  onPage,
}: {
  page: number
  pages: number
  total: number
  noun: string
  pageSize: number
  /**
   * Replaces the "1–15 of 90" range. Pages that aren't a fixed number of rows —
   * a payroll cutoff, say — can't be described by an offset, so they say what
   * they cover instead.
   */
  label?: string
  /** What a page *is*, when it isn't a page. */
  unit?: string
  /**
   * Link builder, for a client component that pages by URL. A *server*
   * component can't pass this — a function doesn't cross the boundary — so it
   * passes the two links it would have produced instead.
   */
  hrefFor?: (page: number) => string
  prevHref?: string
  nextHref?: string
  onPage?: (page: number) => void
}) {
  if (total === 0) return null

  const first = (page - 1) * pageSize + 1
  const last = Math.min(total, page * pageSize)

  function step(direction: "prev" | "next") {
    const target = direction === "prev" ? page - 1 : page + 1
    const disabled = direction === "prev" ? page <= 1 : page >= pages
    const icon =
      direction === "prev" ? (
        <ChevronLeft className="size-4" />
      ) : (
        <ChevronRight className="size-4" />
      )
    const text = direction === "prev" ? "Previous" : "Next"
    const body = (
      <>
        {direction === "prev" && icon}
        <span className="hidden sm:inline">{text}</span>
        {direction === "next" && icon}
      </>
    )

    const href =
      hrefFor?.(target) ?? (direction === "prev" ? prevHref : nextHref)

    if (disabled || !href) {
      return (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => onPage?.(target)}
          aria-label={`${text} page`}
        >
          {body}
        </Button>
      )
    }

    // A link-paged list waits on the server for the next page, and there is no
    // route change to trigger a `loading.tsx` — so the button says so itself.
    return (
      <Button
        variant="outline"
        size="sm"
        render={<Link href={href} scroll={false} />}
        aria-label={`${text} page`}
      >
        {body}
        <LinkPending />
      </Button>
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-muted-foreground tabular-nums">
        {label ?? `${first}–${last} of ${total} ${noun}`}
      </p>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground tabular-nums">
          {unit} {page} of {pages}
        </span>
        {step("prev")}
        {step("next")}
      </div>
    </div>
  )
}
