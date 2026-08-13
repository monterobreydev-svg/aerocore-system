import { cn } from "@/lib/utils"

/**
 * A ring spinner.
 *
 * Written here rather than pulled from a registry: it is a circle with one
 * quarter drawn in a stronger colour, spinning. Two elements and no JavaScript,
 * against a third-party dependency to audit and update forever.
 *
 * `currentColor` on the arc means it inherits whatever text colour it sits in,
 * so one component serves the muted hint in a button and the bright one on a
 * dark card without a variant prop.
 *
 * Respecting `prefers-reduced-motion` is not decoration either — a spinner is
 * exactly the kind of perpetual animation that triggers vestibular symptoms, so
 * for those users it holds still and the arc alone says "working".
 */
export function Spinner({
  className,
  label = "Loading",
}: {
  className?: string
  /** Announced to screen readers; give it something specific where you can. */
  label?: string
}) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        "inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-current/25 border-t-current motion-reduce:animate-none",
        className
      )}
    />
  )
}
