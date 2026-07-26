"use client"

import { useActionState, useEffect, useState } from "react"
import { ChevronLeft, Pencil, Plus, Search } from "lucide-react"
import {
  createBranch,
  updateBranch,
  updateClient,
  type BranchState,
  type ClientState,
} from "@/app/actions/clients"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { Branch, ClientRecord } from "@/components/admin/client-table"

function EditClientDialog({ client }: { client: ClientRecord }) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState<ClientState, FormData>(
    updateClient,
    undefined
  )
  // Uncontrolled inputs below read their defaultValue from this frozen
  // snapshot, not the live `client` prop — a successful save triggers
  // revalidatePath, which can push fresh data into this still-mounted
  // dialog before it finishes closing, and changing defaultValue on an
  // already-initialized uncontrolled field is what Base UI warns about.
  const [initial] = useState(client)

  useEffect(() => {
    if (state?.success) setOpen(false)
  }, [state])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button type="button" variant="outline" size="sm">
            <Pencil className="size-3.5" />
            Edit client
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit client</DialogTitle>
        </DialogHeader>
        <form action={action} id={`client-edit-form-${client.id}`}>
          <input type="hidden" name="clientId" value={client.id} />
          <FieldGroup>
            <Field data-invalid={!!state?.errors?.name}>
              <FieldLabel htmlFor={`client-name-${client.id}`}>
                Client name
              </FieldLabel>
              <Input
                id={`client-name-${client.id}`}
                name="name"
                defaultValue={initial.name}
                disabled={pending}
                required
              />
              <FieldError
                errors={state?.errors?.name?.map((message) => ({ message }))}
              />
            </Field>
            <Field data-invalid={!!state?.errors?.tin}>
              <FieldLabel htmlFor={`client-tin-${client.id}`}>TIN</FieldLabel>
              <Input
                id={`client-tin-${client.id}`}
                name="tin"
                defaultValue={initial.tin ?? ""}
                disabled={pending}
              />
              <FieldError
                errors={state?.errors?.tin?.map((message) => ({ message }))}
              />
            </Field>
            <Field data-invalid={!!state?.errors?.address}>
              <FieldLabel htmlFor={`client-address-${client.id}`}>
                Address
              </FieldLabel>
              <Input
                id={`client-address-${client.id}`}
                name="address"
                defaultValue={initial.address}
                disabled={pending}
                required
              />
              <FieldError
                errors={state?.errors?.address?.map((message) => ({
                  message,
                }))}
              />
            </Field>
            {state?.message && (
              <p className="text-sm text-destructive">{state.message}</p>
            )}
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form={`client-edit-form-${client.id}`}
            disabled={pending}
          >
            {pending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AddBranchDialog({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState<BranchState, FormData>(
    createBranch,
    undefined
  )

  useEffect(() => {
    if (state?.success) setOpen(false)
  }, [state])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button type="button" size="sm">
            <Plus className="size-3.5" />
            Add branch
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add branch</DialogTitle>
          <DialogDescription>
            Add a new branch location for this client.
          </DialogDescription>
        </DialogHeader>
        <form action={action} id="add-branch-form">
          <input type="hidden" name="clientId" value={clientId} />
          <FieldGroup>
            <Field data-invalid={!!state?.errors?.name}>
              <FieldLabel htmlFor="new-branch-name">Branch name</FieldLabel>
              <Input
                id="new-branch-name"
                name="name"
                placeholder="e.g. Makati Branch"
                disabled={pending}
                required
              />
              <FieldError
                errors={state?.errors?.name?.map((message) => ({ message }))}
              />
            </Field>
            <Field data-invalid={!!state?.errors?.address}>
              <FieldLabel htmlFor="new-branch-address">Address</FieldLabel>
              <Input
                id="new-branch-address"
                name="address"
                disabled={pending}
                required
              />
              <FieldError
                errors={state?.errors?.address?.map((message) => ({
                  message,
                }))}
              />
            </Field>
            {state?.message && (
              <p className="text-sm text-destructive">{state.message}</p>
            )}
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button type="submit" form="add-branch-form" disabled={pending}>
            {pending ? "Adding..." : "Add branch"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditBranchFormFields({
  branch,
  action,
  state,
  pending,
}: {
  branch: Branch
  action: (formData: FormData) => void
  state: BranchState
  pending: boolean
}) {
  // Frozen at mount, keyed by branch.id in the parent — so switching to a
  // different branch remounts this with fresh defaults, while a successful
  // save's revalidatePath (which can push updated data into this still
  // -mounted form) doesn't change defaultValue on an already-initialized
  // uncontrolled field, which is what Base UI warns about.
  const [initial] = useState(branch)

  return (
    <form action={action} id={`edit-branch-form-${branch.id}`}>
      <input type="hidden" name="branchId" value={branch.id} />
      <FieldGroup>
        <Field data-invalid={!!state?.errors?.name}>
          <FieldLabel htmlFor={`edit-branch-name-${branch.id}`}>
            Branch name
          </FieldLabel>
          <Input
            id={`edit-branch-name-${branch.id}`}
            name="name"
            defaultValue={initial.name}
            disabled={pending}
            required
          />
          <FieldError
            errors={state?.errors?.name?.map((message) => ({
              message,
            }))}
          />
        </Field>
        <Field data-invalid={!!state?.errors?.address}>
          <FieldLabel htmlFor={`edit-branch-address-${branch.id}`}>
            Address
          </FieldLabel>
          <Input
            id={`edit-branch-address-${branch.id}`}
            name="address"
            defaultValue={initial.address}
            disabled={pending}
            required
          />
          <FieldError
            errors={state?.errors?.address?.map((message) => ({
              message,
            }))}
          />
        </Field>
        {state?.message && (
          <p className="text-sm text-destructive">{state.message}</p>
        )}
      </FieldGroup>
    </form>
  )
}

function EditBranchDialog({
  branch,
  open,
  onOpenChange,
}: {
  branch: Branch | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [state, action, pending] = useActionState<BranchState, FormData>(
    updateBranch,
    undefined
  )

  useEffect(() => {
    if (state?.success) onOpenChange(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit branch</DialogTitle>
        </DialogHeader>
        {branch && (
          <EditBranchFormFields
            key={branch.id}
            branch={branch}
            action={action}
            state={state}
            pending={pending}
          />
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form={branch ? `edit-branch-form-${branch.id}` : undefined}
            disabled={pending || !branch}
          >
            {pending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ClientBranchesView({
  client,
  onBack,
}: {
  client: ClientRecord
  onBack: () => void
}) {
  const [query, setQuery] = useState("")
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)

  const normalizedQuery = query.trim().toLowerCase()
  const filteredBranches =
    normalizedQuery === ""
      ? client.branches
      : client.branches.filter(
          (branch) =>
            branch.name.toLowerCase().includes(normalizedQuery) ||
            branch.address.toLowerCase().includes(normalizedQuery)
        )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="-ml-2 mb-2 text-muted-foreground"
        >
          <ChevronLeft className="size-4" />
          Back to clients
        </Button>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{client.name}</h2>
            <p className="text-sm text-muted-foreground">
              {client.tin ? `TIN ${client.tin} · ` : ""}
              {client.address}
            </p>
          </div>
          <EditClientDialog client={client} />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">
            Branches ({client.branches.length})
          </p>
          <AddBranchDialog clientId={client.id} />
        </div>

        {client.branches.length === 0 ? (
          <p className="text-sm text-muted-foreground">No branches yet.</p>
        ) : (
          <>
            <div className="relative sm:max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search branches..."
                className="pl-8"
              />
            </div>

            {filteredBranches.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No branches match &quot;{query}&quot;.
              </p>
            ) : (
              <>
                {/* Table for medium screens and up */}
                <div className="hidden overflow-hidden rounded-xl border shadow-sm md:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>Name</TableHead>
                        <TableHead>Address</TableHead>
                        <TableHead className="w-8" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredBranches.map((branch) => (
                        <TableRow
                          key={branch.id}
                          className="cursor-pointer"
                          onClick={() => {
                            setEditingBranch(branch)
                            setEditDialogOpen(true)
                          }}
                        >
                          <TableCell className="font-medium">
                            {branch.name}
                          </TableCell>
                          <TableCell
                            className="max-w-xs truncate text-muted-foreground"
                            title={branch.address}
                          >
                            {branch.address}
                          </TableCell>
                          <TableCell>
                            <Pencil className="size-3.5 text-muted-foreground" />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Stacked cards below md, instead of a horizontally-scrolling table */}
                <div className="flex flex-col gap-2 md:hidden">
                  {filteredBranches.map((branch) => (
                    <button
                      key={branch.id}
                      type="button"
                      onClick={() => {
                        setEditingBranch(branch)
                        setEditDialogOpen(true)
                      }}
                      className="rounded-lg border p-3 text-left shadow-sm"
                    >
                      <p className="text-sm font-medium">{branch.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {branch.address}
                      </p>
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      <EditBranchDialog
        branch={editingBranch}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
      />
    </div>
  )
}
