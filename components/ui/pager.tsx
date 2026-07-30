"use client"

import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"

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
  hrefFor,
  onPage,
}: {
  page: number
  pages: number
  total: number
  noun: string
  pageSize: number
  hrefFor?: (page: number) => string
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

    if (disabled || !hrefFor) {
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

    return (
      <Button
        variant="outline"
        size="sm"
        render={<Link href={hrefFor(target)} scroll={false} />}
        aria-label={`${text} page`}
      >
        {body}
      </Button>
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-muted-foreground tabular-nums">
        {first}–{last} of {total} {noun}
      </p>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground tabular-nums">
          Page {page} of {pages}
        </span>
        {step("prev")}
        {step("next")}
      </div>
    </div>
  )
}
