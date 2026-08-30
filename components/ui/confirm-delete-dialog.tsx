"use client"

import type { ReactNode } from "react"
import { AlertTriangle, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

// ---------------------------------------------------------------------------
// "Are you sure?", as its own popup
// ---------------------------------------------------------------------------
//
// Deleting used to be a red panel that appeared *inside* the record's own
// dialog, and that placement cost more than it looked like it did:
//
//   The panel changed the dialog's height under the pointer. Base UI decides a
//   dialog was dismissed by asking whether the pressed element is still inside
//   the popup, and it asks after the press is handled — so a press that lands
//   where the panel just pushed the content is read as a click on the backdrop.
//   The project dialog carries three separate comments about working around
//   exactly this: a footer shared across both modes so its nodes never unmount,
//   a confirmation rendered outside the mode switch so the click that opens it
//   doesn't destroy it, and a delete button disabled rather than hidden.
//
//   And the question was asked in the same frame as the form it interrupts,
//   which is the wrong weight for the one action on the screen that cannot be
//   undone. Two buttons a centimetre apart, one of which saves and one of which
//   destroys, is a layout that gets misclicked.
//
// A popup of its own has neither problem. It owns its lifecycle, so nothing
// unmounts under a press; it covers what it is asking about, so the only two
// buttons in reach are the answer to the question; and it is small, which is
// what makes a modal read as a question rather than as more form.
//
// Deliberately unopinionated about *how* the delete happens. The client's runs
// through a server action that can answer "no, and here is what still refers to
// it"; the project's is a plain call. Both are a callback and a pending flag to
// this component, which only owns the asking.

export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  children,
  blockers,
  confirmLabel = "Yes, delete",
  pending = false,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** "Delete ACME CORP?" — names the thing, ends in a question mark. */
  title: string
  /** What goes with it, and what does not. Shown above the buttons. */
  children: ReactNode
  /**
   * Why it can't be deleted, when it can't.
   *
   * Present means the answer was no: the destructive button is replaced by a
   * way out, because there is nothing left to confirm. Each entry is one
   * reason in the office's words — "3 schedules", not a table name.
   */
  blockers?: string[]
  confirmLabel?: string
  pending?: boolean
  onConfirm: () => void
}) {
  const refused = Boolean(blockers && blockers.length > 0)

  return (
    // Pointer dismissal left on: unlike the record dialogs this interrupts,
    // there is nothing typed in here to lose, and a click outside is the
    // clearest way to say "no". Escape and Cancel do the same.
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
              <AlertTriangle className="size-4.5 text-destructive" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base">{title}</DialogTitle>
              <DialogDescription className="sr-only">
                Confirm whether to delete this record.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-2 text-sm text-muted-foreground">
          {refused ? (
            <>
              <ul className="flex flex-col gap-1 pl-4">
                {blockers!.map((blocker) => (
                  <li key={blocker} className="list-disc text-destructive">
                    {blocker}
                  </li>
                ))}
              </ul>
              {children}
            </>
          ) : (
            children
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {/* Once the answer is no there is nothing to cancel, only to
                acknowledge — and "Cancel" beside no other button reads as
                though it might undo something. */}
            {refused ? "Close" : "Cancel"}
          </Button>
          {!refused && (
            <Button
              type="button"
              variant="destructive"
              onClick={onConfirm}
              disabled={pending}
            >
              <Trash2 />
              {pending ? "Deleting…" : confirmLabel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
