"use client"

import { useMemo, useState } from "react"
import {
  Building2,
  ChevronRight,
  LayoutGrid,
  List,
  MapPin,
  Search,
  Wrench,
  X,
} from "lucide-react"
import type {
  ScheduleStatus,
  TaxStatus,
  WorkType,
} from "@/app/generated/prisma/client"
import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CreateClientDialog } from "@/components/admin/create-client-dialog"
import { ClientDetailView } from "@/components/admin/client-detail-view"

export type ClientBranch = {
  id: string
  name: string
  address: string
}

export type ClientServiceJob = {
  id: string
  date: string
  startTime: string
  endTime: string
  status: ScheduleStatus
  workTypes: WorkType[]
  branchName: string | null
  contactPerson: string | null
  employees: string[]
  createdByName: string | null
}

export type ClientContact = {
  id: string
  name: string
  position: string | null
  phoneNo: string | null
  email: string | null
  isPrimary: boolean
}

export type ClientRecord = {
  id: string
  name: string
  tin: string | null
  taxStatus: TaxStatus | null
  address: string
  phoneNo: string | null
  email: string | null
  createdAt: string
  totalJobs: number
  branches: ClientBranch[]
  contacts: ClientContact[]
  jobs: ClientServiceJob[]
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  })
}

// Not every client is a multi-site company — plenty are serviced at one
// address. Saying "Single location" is clearer than showing "0 branches".
export function locationLabel(client: ClientRecord) {
  const count = client.branches.length
  if (count === 0) return "Single location"
  return `${count} ${count === 1 ? "branch" : "branches"}`
}

// Two distinct hues rather than colour-vs-grey: multi-site clients are the
// ones that need a branch picked when scheduling, so the badge has to be
// telling at a glance across a grid. Violet matches the "Total branches"
// summary tile; teal keeps single-site clients legible instead of reading
// as disabled. Neither collides with the sky company icon beside them.
export function locationBadgeClass(client: ClientRecord) {
  return client.branches.length > 0
    ? "bg-violet-600/10 text-violet-700 dark:text-violet-400"
    : "bg-teal-600/10 text-teal-700 dark:text-teal-400"
}

export function lastServiceDate(client: ClientRecord) {
  if (client.jobs.length === 0) return null
  // Jobs arrive newest-first from the server.
  return client.jobs[0].date
}

type BranchFilter = "all" | "multi" | "single"

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-9 shrink-0 items-center rounded-lg border px-3.5 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active
          ? "border-sky-600 bg-sky-600/10 text-sky-700 dark:text-sky-400"
          : "border-border bg-background text-foreground hover:bg-muted"
      )}
    >
      {label}
    </button>
  )
}

function CardStat({
  label,
  value,
  className,
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div className="px-3 py-3">
      <p className="truncate text-xs whitespace-nowrap text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-1 text-sm font-medium", className)}>{value}</p>
    </div>
  )
}

export function ClientList({ clients }: { clients: ClientRecord[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [branchFilter, setBranchFilter] = useState<BranchFilter>("all")
  const [view, setView] = useState<"grid" | "list">("grid")

  const selected = clients.find((client) => client.id === selectedId) ?? null

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return clients.filter((client) => {
      if (branchFilter === "multi" && client.branches.length === 0) return false
      if (branchFilter === "single" && client.branches.length > 0) return false
      if (!needle) return true

      return [
        client.name,
        client.tin,
        client.address,
        ...client.branches.map((branch) => branch.name),
        ...client.branches.map((branch) => branch.address),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle)
    })
  }, [clients, query, branchFilter])

  if (selected) {
    return (
      <ClientDetailView client={selected} onBack={() => setSelectedId(null)} />
    )
  }

  const filtersActive = query.trim() !== "" || branchFilter !== "all"

  function clearFilters() {
    setQuery("")
    setBranchFilter("all")
  }

  const withBranches = clients.filter(
    (client) => client.branches.length > 0
  ).length
  const totalBranches = clients.reduce(
    (sum, client) => sum + client.branches.length,
    0
  )
  const totalJobs = clients.reduce((sum, client) => sum + client.totalJobs, 0)

  const summary = [
    {
      label: "Total clients",
      value: clients.length,
      icon: Building2,
      color: "text-slate-600 dark:text-slate-400",
      bg: "bg-slate-600/10",
    },
    {
      label: "With branches",
      value: withBranches,
      icon: MapPin,
      color: "text-sky-600 dark:text-sky-400",
      bg: "bg-sky-600/10",
    },
    {
      label: "Total branches",
      value: totalBranches,
      icon: MapPin,
      color: "text-violet-600 dark:text-violet-400",
      bg: "bg-violet-600/10",
    },
    {
      label: "Jobs logged",
      value: totalJobs,
      icon: Wrench,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-600/10",
    },
  ]

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summary.map((stat) => (
          <Card key={stat.label} className="shadow-sm" size="sm">
            <CardContent className="flex items-center gap-3">
              <div
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-lg",
                  stat.bg
                )}
              >
                <stat.icon className={cn("size-5", stat.color)} />
              </div>
              <div className="min-w-0">
                <p className="text-2xl leading-none font-semibold tabular-nums">
                  {stat.value}
                </p>
                <p className="mt-1.5 truncate text-xs text-muted-foreground">
                  {stat.label}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1 sm:max-w-xs">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search client, TIN or address"
            aria-label="Search clients"
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

        {/* Desktop-only, same as the employees page — three pills don't earn
            their space on a phone where search already narrows the list. */}
        <div className="hidden items-center gap-2 sm:flex">
          <FilterChip
            active={branchFilter === "all"}
            label="All"
            onClick={() => setBranchFilter("all")}
          />
          <FilterChip
            active={branchFilter === "multi"}
            label="With branches"
            onClick={() => setBranchFilter("multi")}
          />
          <FilterChip
            active={branchFilter === "single"}
            label="Single location"
            onClick={() => setBranchFilter("single")}
          />
        </div>

        <div className="flex items-center gap-0.5 rounded-lg border p-0.5">
          <Button
            type="button"
            variant={view === "grid" ? "secondary" : "ghost"}
            size="icon"
            className="size-7 rounded-md"
            aria-label="Card view"
            aria-pressed={view === "grid"}
            onClick={() => setView("grid")}
          >
            <LayoutGrid className="size-4" />
          </Button>
          <Button
            type="button"
            variant={view === "list" ? "secondary" : "ghost"}
            size="icon"
            className="size-7 rounded-md"
            aria-label="List view"
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            <List className="size-4" />
          </Button>
        </div>

        <div className="ml-auto">
          <CreateClientDialog />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{visible.length}</span>{" "}
          {visible.length === 1 ? "client" : "clients"}
          {filtersActive && ` of ${clients.length}`}
        </p>
        {filtersActive && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="text-muted-foreground"
          >
            <X className="size-3.5" />
            Clear filters
          </Button>
        )}
      </div>

      {clients.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">
          No clients yet. Use “Add client” to create the first one.
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-12 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <Search className="size-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">No clients match your filters</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Try a different search term or clear the filters.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {visible.map((client) => {
            const last = lastServiceDate(client)
            return (
              <Card
                key={client.id}
                onClick={() => setSelectedId(client.id)}
                className="group cursor-pointer gap-0 pb-0 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md hover:ring-sky-600/30"
              >
                {/* flex-1 so this absorbs the extra height when a row's cards
                    stretch to match the tallest — otherwise a shorter card's
                    leftover space lands below the stat strip as a white band. */}
                <CardContent className="flex-1">
                  {/* Company names run long and all-caps in practice, so the
                      name owns the full row and may wrap to two lines — the
                      badge sits underneath rather than eating the width. */}
                  <div className="flex min-w-0 gap-3">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-sky-600/10">
                      <Building2 className="size-5 text-sky-600 dark:text-sky-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-base leading-tight font-medium">
                        {client.name}
                      </p>
                      <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                        {client.tin ?? "No TIN"}
                      </p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {client.address}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3">
                    <Badge className={locationBadgeClass(client)}>
                      {locationLabel(client)}
                    </Badge>
                  </div>
                </CardContent>

                <div className="mt-4 grid grid-cols-3 divide-x border-t bg-muted/30">
                  <CardStat
                    label="Branches"
                    value={String(client.branches.length)}
                  />
                  <CardStat
                    label="Contacts"
                    value={String(client.contacts.length)}
                  />
                  <CardStat
                    label="Last service"
                    value={last ? shortDate(last) : "—"}
                  />
                </div>
              </Card>
            )
          })}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
          <div className="hidden items-center gap-4 border-b bg-muted/40 px-4 py-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
            <span>Client</span>
            <span>Address</span>
            <span>Locations</span>
            <span className="text-right">Contacts</span>
            <span className="w-24 text-right">Last service</span>
          </div>

          <div className="divide-y">
            {visible.map((client) => {
              const last = lastServiceDate(client)
              return (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => setSelectedId(client.id)}
                  className="group flex w-full items-center gap-4 px-4 py-3 text-left transition-colors outline-none hover:bg-muted/50 focus-visible:bg-muted/50 md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-600/10">
                      <Building2 className="size-4 text-sky-600 dark:text-sky-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm leading-tight font-medium">
                        {client.name}
                      </p>
                      <p className="truncate font-mono text-xs text-muted-foreground">
                        {client.tin ?? "No TIN"}
                      </p>
                    </div>
                  </div>

                  <span className="hidden truncate text-sm text-muted-foreground md:block">
                    {client.address}
                  </span>

                  <span className="hidden md:block">
                    <Badge className={locationBadgeClass(client)}>
                      {locationLabel(client)}
                    </Badge>
                  </span>

                  <span className="hidden text-right text-sm font-medium tabular-nums md:block">
                    {client.contacts.length}
                  </span>

                  <span className="flex shrink-0 items-center justify-end gap-2 md:w-24">
                    <span className="text-xs text-muted-foreground">
                      {last ? shortDate(last) : "—"}
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
