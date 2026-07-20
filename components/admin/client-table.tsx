"use client"

import { useState } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { ClientBranchesView } from "@/components/admin/client-branches-view"

export type Branch = {
  id: string
  name: string
  address: string
}

export type ClientRecord = {
  id: string
  name: string
  tin: string | null
  address: string
  branches: Branch[]
}

export function ClientTable({ clients }: { clients: ClientRecord[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = clients.find((client) => client.id === selectedId) ?? null

  if (selected) {
    return (
      <ClientBranchesView
        client={selected}
        onBack={() => setSelectedId(null)}
      />
    )
  }

  return (
    <>
      {/* Table for medium screens and up */}
      <div className="hidden overflow-hidden rounded-xl border shadow-sm md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead>Client</TableHead>
              <TableHead>TIN</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Branches</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="h-32 text-center text-muted-foreground"
                >
                  No clients yet.
                </TableCell>
              </TableRow>
            )}
            {clients.map((client) => (
              <TableRow
                key={client.id}
                className="cursor-pointer"
                onClick={() => setSelectedId(client.id)}
              >
                <TableCell className="font-medium">{client.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {client.tin ?? "—"}
                </TableCell>
                <TableCell className="max-w-xs truncate">
                  {client.address}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{client.branches.length}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Stacked cards below md, instead of a horizontally-scrolling table */}
      <div className="flex flex-col gap-2 md:hidden">
        {clients.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No clients yet.
          </p>
        )}
        {clients.map((client) => (
          <button
            key={client.id}
            type="button"
            onClick={() => setSelectedId(client.id)}
            className="rounded-lg border p-3 text-left shadow-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{client.name}</p>
              <Badge variant="outline">
                {client.branches.length}{" "}
                {client.branches.length === 1 ? "branch" : "branches"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {client.tin ? `${client.tin} · ` : ""}
              {client.address}
            </p>
          </button>
        ))}
      </div>
    </>
  )
}
