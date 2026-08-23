"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { MapPin } from "lucide-react"
import { listBranches } from "@/app/actions/schedules"
import {
  listClientProjects,
  type ClientProjectOption,
} from "@/app/actions/projects"
import { SearchSelect } from "@/components/ui/search-select"
import type { BranchOption } from "@/components/admin/schedule-types"

// ---------------------------------------------------------------------------
// The two things a job needs picking beyond the client
//
//   branch        which of their sites the crew drives to. Null is head office,
//                 and this is the only field that decides the address.
//   sales order   which job it delivers, and so whose books the labour lands on.
//
// Both are lists belonging to one client, and neither ships with the page:
// sending every client's branches and every client's projects up front is
// O(clients × rows), which is the payload rule in AGENTS.md.
//
// The fetching lives in one hook held by the *form*, not in the pickers, because
// the create form now books several jobs at once and two of them are often for
// the same client. A picker that fetched for itself would ask for the same
// client's branches once per row; this asks once per client, for as many rows as
// there are. The pickers below are presentational — they render what they're
// handed.
// ---------------------------------------------------------------------------

type SiteData = {
  branches: Record<string, BranchOption[]>
  projects: Record<string, ClientProjectOption[]>
}

// Stable identity, so a client whose list hasn't arrived doesn't hand a fresh
// array to the memos below on every render.
const NO_BRANCHES: BranchOption[] = []
const NO_PROJECTS: ClientProjectOption[] = []

/**
 * The branches and sales orders for every client currently in use, fetched on
 * demand and cached for the life of the form.
 *
 * Pass every client the form has selected — one when editing a job, up to one
 * per row when creating a batch. Duplicates cost nothing: the cache is keyed by
 * client, so the same client named by five rows is one request.
 *
 * The cache is only ever added to, never invalidated: a branch list doesn't
 * change while a dialog is open, and re-fetching on every keystroke is exactly
 * the round trip this is here to avoid.
 */
export function useClientSiteData(
  clientIds: string[],
  /**
   * Skip the sales orders when the caller only needs branches.
   *
   * The project form is the case: it asks which site the job is at, and asking
   * the same breath for the client's existing sales orders would be a wasted
   * round trip — and an odd one, since the thing being created *is* a sales
   * order.
   */
  { withProjects = true }: { withProjects?: boolean } = {}
): SiteData {
  const [branches, setBranches] = useState<Record<string, BranchOption[]>>({})
  const [projects, setProjects] = useState<Record<string, ClientProjectOption[]>>(
    {}
  )

  // Every list already asked for, so a re-render between firing a request and
  // its reply doesn't ask again. This ref is the *only* thing that dedupes —
  // deliberately, because the caches must not be effect dependencies:
  //
  // They were, once, and it cost the sales orders. Both requests go out
  // together; branches came back first (an empty list returns instantly), which
  // set state, which re-ran the effect, whose cleanup flipped a `cancelled`
  // flag the still-pending projects request was closed over. Its reply was then
  // thrown away — and this set said it had already been asked for, so it was
  // never retried. The SO picker sat empty forever, and it lost that race every
  // time precisely *because* the branch list was fast.
  //
  // So: the fetch depends on which clients are in play and nothing else, and
  // nothing cancels a reply except the component going away.
  const requested = useRef<Set<string>>(new Set())
  const alive = useRef(true)

  useEffect(() => {
    // Set on the way in, not just cleared on the way out: React remounts
    // effects in development, and a flag only ever set false would leave every
    // later reply discarded.
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  // A string, so the effect keys off *which* clients rather than the identity of
  // the array holding them — a fresh array every render would otherwise re-run
  // this on every keystroke in the form.
  const key = [...new Set(clientIds.filter(Boolean))].sort().join(",")

  useEffect(() => {
    for (const id of key ? key.split(",") : []) {
      if (!requested.current.has(`b:${id}`)) {
        requested.current.add(`b:${id}`)
        listBranches(id)
          .then((rows) => {
            if (alive.current) {
              setBranches((current) => ({ ...current, [id]: rows }))
            }
          })
          // Forget it failed, so picking the client again can try once more.
          .catch(() => requested.current.delete(`b:${id}`))
      }
      if (withProjects && !requested.current.has(`p:${id}`)) {
        requested.current.add(`p:${id}`)
        listClientProjects(id)
          .then((rows) => {
            if (alive.current) {
              setProjects((current) => ({ ...current, [id]: rows }))
            }
          })
          .catch(() => requested.current.delete(`p:${id}`))
      }
    }
  }, [key, withProjects])

  return { branches, projects }
}

/** What a picker needs to know about one client's list. */
function sliceFor<T>(
  cache: Record<string, T[]>,
  clientId: string,
  empty: T[]
): { rows: T[]; loading: boolean } {
  if (!clientId) return { rows: empty, loading: false }
  return { rows: cache[clientId] ?? empty, loading: !cache[clientId] }
}

/**
 * Which of the client's sites the crew turns up at.
 *
 * A client with a hundred branches is the case this has to survive, hence a
 * filtering combobox rather than a scrolling list. "Head office" is a real
 * option, not a blank — scheduling against the main address is common, and it is
 * what an empty branch means everywhere else in the system.
 *
 * Renders the resolved address itself. That address is the whole reason this
 * field exists — the crew needs somewhere to drive to — and it is right here to
 * be looked up.
 */
export function ScheduleBranchPicker({
  id,
  name,
  data,
  clientId,
  clientAddress,
  value,
  onValueChange,
  disabled,
  showAddress = true,
}: {
  id: string
  /** Omitted by the batch form, which carries its rows in one JSON field. */
  name?: string
  data: SiteData
  clientId: string
  /** Shown as the head-office hint, and used when no branch is selected. */
  clientAddress?: string
  value: string
  /**
   * The label comes with the id because the caller usually needs both and only
   * this component holds the list to resolve one from the other. Passed at the
   * moment of choosing rather than reported from an effect, which would be a
   * render cascade to say something already known here.
   */
  onValueChange: (value: string, label: string) => void
  disabled?: boolean
  showAddress?: boolean
}) {
  const { rows: branches, loading } = sliceFor(
    data.branches,
    clientId,
    NO_BRANCHES
  )

  const options = useMemo(
    () => [
      { value: "", label: "Head office", hint: clientAddress ?? "Main address" },
      ...branches.map((branch) => ({
        value: branch.id,
        label: branch.name,
        hint: branch.address,
      })),
    ],
    [branches, clientAddress]
  )

  const address = value
    ? branches.find((branch) => branch.id === value)?.address
    : clientAddress

  return (
    <>
      <SearchSelect
        id={id}
        name={name}
        options={options}
        value={value}
        onValueChange={(next) =>
          onValueChange(
            next,
            options.find((option) => option.value === next)?.label ??
              "Head office"
          )
        }
        placeholder={
          !clientId
            ? "Pick a client first"
            : loading
              ? "Loading branches…"
              : "Head office"
        }
        searchPlaceholder="Search branches…"
        emptyMessage="No branch matches that."
        disabled={disabled || !clientId}
      />
      {showAddress && address && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <MapPin className="mt-0.5 size-3 shrink-0" />
          <span className="min-w-0">{address}</span>
        </p>
      )}
    </>
  )
}

/**
 * Which sales order a job is being booked against.
 *
 * Required, unlike the branch: a schedule that names no job has no project to
 * put its labour against, and the COGS roll-up groups by exactly this number.
 */
export function ScheduleSalesOrderPicker({
  id,
  name,
  data,
  clientId,
  value,
  onValueChange,
  disabled,
}: {
  id: string
  /** Omitted by the batch form, which carries its rows in one JSON field. */
  name?: string
  data: SiteData
  clientId: string
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
}) {
  const { rows: projects, loading } = sliceFor(
    data.projects,
    clientId,
    NO_PROJECTS
  )

  const options = useMemo(
    () =>
      projects.map((project) => ({
        value: project.salesOrderNo,
        label: project.salesOrderNo,
        // The number identifies the job; the name is what lets somebody
        // recognise it in a list of six that all start "26".
        hint: project.name,
      })),
    [projects]
  )

  // A client with no projects can't be scheduled against — said here, next to
  // the empty picker, rather than left as a box that opens onto nothing.
  const empty = Boolean(clientId) && !loading && projects.length === 0

  return (
    <>
      <SearchSelect
        id={id}
        name={name}
        options={options}
        value={value}
        onValueChange={onValueChange}
        placeholder={
          !clientId
            ? "Pick a client first"
            : loading
              ? "Loading sales orders…"
              : empty
                ? "No sales orders yet"
                : "Select an SO number"
        }
        searchPlaceholder="Search SO numbers…"
        emptyMessage="No sales order matches that."
        disabled={disabled || !clientId || empty}
      />
      {empty && (
        <p className="text-xs text-muted-foreground">
          No projects for this client yet. Book one under Projects first — a
          schedule has to say which job it&rsquo;s for.
        </p>
      )}
    </>
  )
}
