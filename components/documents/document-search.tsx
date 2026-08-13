"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Search, X } from "lucide-react"
import { Input } from "@/components/ui/input"

/**
 * One box for both halves of "find it": type a serial, a filename, a client or
 * a branch and the matching reports come back from every folder at once.
 *
 * The query lives in the URL rather than in state, so a result set can be sent
 * to somebody, reloaded, or reached with the back button — and the search runs
 * on the server against the whole table instead of filtering the twenty rows
 * that happen to be on screen.
 */
export function DocumentSearch({ query }: { query: string }) {
  const router = useRouter()
  const [value, setValue] = useState(query)
  const [pending, setPending] = useState(false)

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /**
   * The last term this box put in the URL, as opposed to one that arrived.
   * State rather than a ref because it is read below during render, and a ref
   * read during render is a value React is free to have already changed.
   */
  const [sent, setSent] = useState(query)

  // Adopting a query that arrived from outside — the back button, a shared
  // link — without an effect to do it. Adjusting state during render is the
  // supported way to follow a prop, and unlike an effect it doesn't cost a
  // second render or trip the lint rule that bans synchronous setState there.
  const [seen, setSeen] = useState(query)
  if (query !== seen) {
    setSeen(query)
    setPending(false)
    // Never overwrite what's being typed with the response to an earlier
    // keystroke: only a query this box didn't send is worth adopting.
    if (query !== sent) setValue(query)
  }

  function search(next: string) {
    setValue(next)
    if (timer.current) clearTimeout(timer.current)

    // Long enough that a typed word is one request rather than six, short
    // enough that it still feels like the page is keeping up.
    timer.current = setTimeout(() => {
      const term = next.trim()
      setSent(term)
      setPending(term !== query.trim())
      router.push(
        term
          ? `/admin/documents?q=${encodeURIComponent(term)}`
          : "/admin/documents"
      )
    }, 350)
  }

  return (
    <div className="relative">
      {pending ? (
        <Loader2 className="absolute top-1/2 left-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      ) : (
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      )}

      <Input
        value={value}
        onChange={(event) => search(event.target.value)}
        placeholder="Search serial, file, client or branch…"
        aria-label="Search documents"
        className="h-10 pr-9 pl-9"
      />

      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            if (timer.current) clearTimeout(timer.current)
            setSent("")
            setValue("")
            setPending(false)
            router.push("/admin/documents")
          }}
          className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}
