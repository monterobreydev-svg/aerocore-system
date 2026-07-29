"use client"

import { useActionState, useEffect, useState } from "react"
import {
  Building2,
  ChevronLeft,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  UserRound,
  Wrench,
} from "lucide-react"
import {
  createBranch,
  createClientContact,
  deleteClientContact,
  updateBranch,
  updateClient,
  updateClientContact,
  type BranchState,
  type ClientState,
  type ContactState,
} from "@/app/actions/clients"
import { TAX_STATUS_OPTIONS, taxStatusLabel } from "@/lib/client"
import {
  SCHEDULE_STATUS_CHIP,
  SCHEDULE_STATUS_LABELS,
  WORK_TYPE_CHIP,
  WORK_TYPE_LABELS,
  formatScheduleDate,
  formatTimeRange,
} from "@/lib/schedule"
import { cn } from "@/lib/utils"
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
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  lastServiceDate,
  locationBadgeClass,
  locationLabel,
  type ClientBranch,
  type ClientContact,
  type ClientRecord,
} from "@/components/admin/client-list"

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
          <Button type="button" variant="outline">
            <Pencil />
            Edit client
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit client</DialogTitle>
          <DialogDescription>
            Company details used across schedules and reports.
          </DialogDescription>
        </DialogHeader>
        <form action={action} id={`client-edit-form-${client.id}`}>
          <input type="hidden" name="clientId" value={client.id} />
          <FieldGroup>
            <Field data-invalid={!!state?.errors?.name}>
              <FieldLabel htmlFor={`client-name-${client.id}`}>
                Registered name
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
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={!!state?.errors?.tin}>
                <FieldLabel htmlFor={`client-tin-${client.id}`}>TIN</FieldLabel>
                <Input
                  id={`client-tin-${client.id}`}
                  name="tin"
                  placeholder="123-456-789-000"
                  defaultValue={initial.tin ?? ""}
                  disabled={pending}
                  className="font-mono"
                />
                <FieldError
                  errors={state?.errors?.tin?.map((message) => ({ message }))}
                />
              </Field>
              <Field data-invalid={!!state?.errors?.taxStatus}>
                <FieldLabel htmlFor={`client-tax-${client.id}`}>
                  Tax status
                </FieldLabel>
                <Select
                  name="taxStatus"
                  defaultValue={initial.taxStatus ?? ""}
                  disabled={pending}
                  items={Object.fromEntries(
                    TAX_STATUS_OPTIONS.map((status) => [
                      status,
                      taxStatusLabel(status),
                    ])
                  )}
                >
                  <SelectTrigger
                    id={`client-tax-${client.id}`}
                    className="w-full"
                  >
                    <SelectValue placeholder="Select tax status" />
                  </SelectTrigger>
                  <SelectContent>
                    {TAX_STATUS_OPTIONS.map((status) => (
                      <SelectItem key={status} value={status}>
                        {taxStatusLabel(status)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field data-invalid={!!state?.errors?.address}>
              <FieldLabel htmlFor={`client-address-${client.id}`}>
                Head office address
              </FieldLabel>
              <Input
                id={`client-address-${client.id}`}
                name="address"
                defaultValue={initial.address}
                disabled={pending}
                required
              />
              <FieldError
                errors={state?.errors?.address?.map((message) => ({ message }))}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={!!state?.errors?.phoneNo}>
                <FieldLabel htmlFor={`client-phone-${client.id}`}>
                  Head office phone
                </FieldLabel>
                <Input
                  id={`client-phone-${client.id}`}
                  name="phoneNo"
                  placeholder="(02) 8888 1234"
                  defaultValue={initial.phoneNo ?? ""}
                  disabled={pending}
                />
                <FieldError
                  errors={state?.errors?.phoneNo?.map((message) => ({
                    message,
                  }))}
                />
              </Field>
              <Field data-invalid={!!state?.errors?.email}>
                <FieldLabel htmlFor={`client-email-${client.id}`}>
                  Head office email
                </FieldLabel>
                <Input
                  id={`client-email-${client.id}`}
                  name="email"
                  type="email"
                  placeholder="admin@company.ph"
                  defaultValue={initial.email ?? ""}
                  disabled={pending}
                />
                <FieldError
                  errors={state?.errors?.email?.map((message) => ({
                    message,
                  }))}
                />
              </Field>
            </div>
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

function AddBranchDialog({
  clientId,
  variant = "default",
}: {
  clientId: string
  variant?: "default" | "outline"
}) {
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
          <Button type="button" variant={variant}>
            <Plus />
            Add branch
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add branch</DialogTitle>
          <DialogDescription>
            A separate site this client wants serviced.
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
                placeholder="Makati Branch"
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
                placeholder="Ayala Ave, Makati City"
                disabled={pending}
                required
              />
              <FieldError
                errors={state?.errors?.address?.map((message) => ({ message }))}
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
  branch: ClientBranch
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
            errors={state?.errors?.name?.map((message) => ({ message }))}
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
            errors={state?.errors?.address?.map((message) => ({ message }))}
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
  branch: ClientBranch | null
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

// Shared field block for both the add and edit contact dialogs. `initial`
// is undefined when adding; when editing it's the frozen snapshot so a
// revalidate can't swap defaultValue underneath an uncontrolled field.
function ContactFormFields({
  idPrefix,
  initial,
  state,
  pending,
}: {
  idPrefix: string
  initial?: ClientContact
  state: ContactState
  pending: boolean
}) {
  return (
    <FieldGroup>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field data-invalid={!!state?.errors?.name}>
          <FieldLabel htmlFor={`${idPrefix}-name`}>
            Name <span className="text-destructive">*</span>
          </FieldLabel>
          <Input
            id={`${idPrefix}-name`}
            name="name"
            placeholder="Marites Santos"
            defaultValue={initial?.name ?? ""}
            disabled={pending}
            required
          />
          <FieldError
            errors={state?.errors?.name?.map((message) => ({ message }))}
          />
        </Field>
        <Field data-invalid={!!state?.errors?.position}>
          <FieldLabel htmlFor={`${idPrefix}-position`}>Position</FieldLabel>
          <Input
            id={`${idPrefix}-position`}
            name="position"
            placeholder="Building Administrator"
            defaultValue={initial?.position ?? ""}
            disabled={pending}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field data-invalid={!!state?.errors?.phoneNo}>
          <FieldLabel htmlFor={`${idPrefix}-phone`}>Phone</FieldLabel>
          <Input
            id={`${idPrefix}-phone`}
            name="phoneNo"
            placeholder="0917 123 4567"
            defaultValue={initial?.phoneNo ?? ""}
            disabled={pending}
          />
        </Field>
        <Field data-invalid={!!state?.errors?.email}>
          <FieldLabel htmlFor={`${idPrefix}-email`}>Email</FieldLabel>
          <Input
            id={`${idPrefix}-email`}
            name="email"
            type="email"
            placeholder="name@company.ph"
            defaultValue={initial?.email ?? ""}
            disabled={pending}
          />
          <FieldError
            errors={state?.errors?.email?.map((message) => ({ message }))}
          />
        </Field>
      </div>

      <Field orientation="horizontal">
        <Checkbox
          id={`${idPrefix}-primary`}
          name="isPrimary"
          value="true"
          defaultChecked={initial?.isPrimary ?? false}
          disabled={pending}
        />
        <FieldLabel htmlFor={`${idPrefix}-primary`} className="font-normal">
          Main point of contact
        </FieldLabel>
      </Field>

      {state?.message && (
        <p className="text-sm text-destructive">{state.message}</p>
      )}
    </FieldGroup>
  )
}

function AddContactDialog({
  clientId,
  variant = "default",
  size,
}: {
  clientId: string
  variant?: "default" | "outline"
  size?: "sm"
}) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState<ContactState, FormData>(
    createClientContact,
    undefined
  )

  useEffect(() => {
    if (state?.success) setOpen(false)
  }, [state])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button type="button" variant={variant} size={size}>
            <Plus />
            Add contact
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add contact person</DialogTitle>
          <DialogDescription>
            Someone to reach at this client. Add as many as you need.
          </DialogDescription>
        </DialogHeader>
        <form action={action} id="add-contact-form">
          <input type="hidden" name="clientId" value={clientId} />
          <ContactFormFields
            idPrefix="new-contact"
            state={state}
            pending={pending}
          />
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
          <Button type="submit" form="add-contact-form" disabled={pending}>
            {pending ? "Adding..." : "Add contact"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditContactDialog({
  contact,
  open,
  onOpenChange,
}: {
  contact: ClientContact | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [state, action, pending] = useActionState<ContactState, FormData>(
    updateClientContact,
    undefined
  )
  const [removeState, removeAction, removing] = useActionState<
    ContactState,
    FormData
  >(deleteClientContact, undefined)
  const [confirmRemove, setConfirmRemove] = useState(false)

  useEffect(() => {
    if (state?.success || removeState?.success) {
      onOpenChange(false)
      setConfirmRemove(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, removeState])

  useEffect(() => {
    if (!open) setConfirmRemove(false)
  }, [open])

  const busy = pending || removing

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit contact person</DialogTitle>
        </DialogHeader>

        {contact && (
          <form
            action={action}
            id={`edit-contact-form-${contact.id}`}
            key={contact.id}
          >
            <input type="hidden" name="contactId" value={contact.id} />
            <ContactFormFields
              idPrefix={`edit-contact-${contact.id}`}
              initial={contact}
              state={state}
              pending={busy}
            />
          </form>
        )}

        {confirmRemove && contact && (
          <div className="flex flex-col gap-3 rounded-lg bg-destructive/10 p-3 text-sm">
            <p className="text-destructive">
              Remove {contact.name} from this client&apos;s contacts?
            </p>
            <div className="flex gap-2">
              <form action={removeAction}>
                <input type="hidden" name="contactId" value={contact.id} />
                <Button
                  type="submit"
                  variant="destructive"
                  size="sm"
                  disabled={busy}
                >
                  {removing ? "Removing..." : "Yes, remove"}
                </Button>
              </form>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmRemove(false)}
                disabled={busy}
              >
                Keep
              </Button>
            </div>
          </div>
        )}

        <DialogFooter className="sm:justify-between">
          {!confirmRemove ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmRemove(true)}
              disabled={busy || !contact}
              className="text-destructive hover:bg-destructive/10"
            >
              <Trash2 />
              Remove
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form={contact ? `edit-contact-form-${contact.id}` : undefined}
              disabled={busy || !contact}
            >
              {pending ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Row({
  label,
  value,
  mono = false,
}: {
  label: string
  value?: React.ReactNode
  mono?: boolean
}) {
  const empty = value === null || value === undefined || value === ""
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-2 text-sm last:border-b-0">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "min-w-0 text-right",
          mono && "font-mono",
          empty ? "text-muted-foreground" : "font-medium"
        )}
      >
        {empty ? "—" : value}
      </dd>
    </div>
  )
}

// size="sm" drops --card-spacing from 4 to 3; combined with the tighter Row
// padding it fits a card's worth of facts in roughly two-thirds the height,
// so a reader takes in the whole record without scrolling past whitespace.
function SectionCard({
  title,
  description,
  action,
  className,
  children,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <Card size="sm" className={cn("shadow-sm", className)}>
      <CardHeader className="border-b">
        <CardTitle>{title}</CardTitle>
        {description && (
          <CardDescription className="text-xs">{description}</CardDescription>
        )}
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function InfoCard({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <SectionCard title={title} description={description}>
      <dl className="flex flex-col">{children}</dl>
    </SectionCard>
  )
}

const TABS = [
  { value: "overview", label: "Overview", icon: Building2 },
  { value: "branches", label: "Branches", icon: MapPin },
  { value: "history", label: "Service history", icon: Wrench },
] as const

export function ClientDetailView({
  client,
  onBack,
}: {
  client: ClientRecord
  onBack: () => void
}) {
  const [activeTab, setActiveTab] = useState<string>("overview")
  const [query, setQuery] = useState("")
  const [editingBranch, setEditingBranch] = useState<ClientBranch | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingContact, setEditingContact] = useState<ClientContact | null>(
    null
  )
  const [contactDialogOpen, setContactDialogOpen] = useState(false)

  const needle = query.trim().toLowerCase()
  const filteredBranches =
    needle === ""
      ? client.branches
      : client.branches.filter(
          (branch) =>
            branch.name.toLowerCase().includes(needle) ||
            branch.address.toLowerCase().includes(needle)
        )

  const last = lastServiceDate(client)
  const completedJobs = client.jobs.filter(
    (job) => job.status === "COMPLETED"
  ).length
  const pendingJobs = client.jobs.filter(
    (job) => job.status === "PENDING"
  ).length
  const hasMoreHistory = client.totalJobs > client.jobs.length

  return (
    <div className="flex flex-col gap-6">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onBack}
        className="-ml-2 w-fit text-muted-foreground"
      >
        <ChevronLeft className="size-4" />
        All clients
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-sky-600/10">
            <Building2 className="size-6 text-sky-600 dark:text-sky-400" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl leading-tight font-semibold">
                {client.name}
              </h2>
              <Badge className={locationBadgeClass(client)}>
                {locationLabel(client)}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {client.address}
            </p>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">
              {client.tin ? `TIN ${client.tin}` : "No TIN on file"}
            </p>
          </div>
        </div>

        <EditClientDialog client={client} />
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as string)}
      >
        <TabsList
          variant="line"
          className="w-full min-w-0 justify-start overflow-x-auto border-b"
        >
          {TABS.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="flex-none gap-1.5 px-3"
            >
              <tab.icon className="size-4" />
              {tab.label}
              {tab.value === "branches" && client.branches.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {client.branches.length}
                </Badge>
              )}
              {tab.value === "history" && client.totalJobs > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {client.totalJobs}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="pt-4">
          {/* Four cards in a 2-up grid, so nothing is left stranded on a row
              of its own. Contacts live here rather than behind their own tab
              — knowing who to ring is part of reading the client, not a
              separate errand. */}
          <div className="grid gap-3 lg:grid-cols-2">
            <InfoCard title="Company">
              <Row label="Registered name" value={client.name} />
              <Row label="TIN" value={client.tin} mono />
              <Row
                label="Tax status"
                value={
                  client.taxStatus ? taxStatusLabel(client.taxStatus) : null
                }
              />
              <Row
                label="Client since"
                value={new Date(client.createdAt).toLocaleDateString()}
              />
            </InfoCard>

            <InfoCard title="Head office">
              <Row label="Address" value={client.address} />
              <Row label="Phone" value={client.phoneNo} />
              <Row label="Email" value={client.email} />
              <Row
                label="Main contact"
                value={
                  client.contacts.find((contact) => contact.isPrimary)?.name ??
                  null
                }
              />
            </InfoCard>

            <InfoCard
              title="Service summary"
              description="Rolled up from scheduled jobs"
            >
              <Row
                label="Locations"
                value={
                  client.branches.length === 0
                    ? "Main address only"
                    : `${client.branches.length} ${
                        client.branches.length === 1 ? "branch" : "branches"
                      }`
                }
              />
              <Row label="Total jobs" value={String(client.totalJobs)} />
              <Row label="Completed" value={String(completedJobs)} />
              <Row
                label="Last service"
                value={last ? formatScheduleDate(last) : null}
              />
            </InfoCard>

            <SectionCard
              title="Contact persons"
              description={
                client.contacts.length === 0
                  ? "Nobody recorded yet"
                  : `${client.contacts.length} on file`
              }
              action={
                <AddContactDialog
                  clientId={client.id}
                  variant="outline"
                  size="sm"
                />
              }
            >
              {client.contacts.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">
                  Add the people you deal with at {client.name} — building
                  admin, accounts payable, whoever meets the employees on site.
                </p>
              ) : (
                <div className="flex flex-col divide-y">
                  {client.contacts.map((contact) => (
                    <button
                      key={contact.id}
                      type="button"
                      onClick={() => {
                        setEditingContact(contact)
                        setContactDialogOpen(true)
                      }}
                      className="group -mx-2 flex items-start gap-2.5 rounded-md px-2 py-2 text-left transition-colors outline-none hover:bg-muted/60 focus-visible:bg-muted/60"
                    >
                      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-sky-600/10">
                        <UserRound className="size-3.5 text-sky-600 dark:text-sky-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="truncate text-sm leading-tight font-medium">
                            {contact.name}
                          </p>
                          {contact.isPrimary && (
                            <Badge className="bg-sky-600/10 text-sky-700 dark:text-sky-400">
                              Main
                            </Badge>
                          )}
                          {contact.position && (
                            <span className="truncate text-xs text-muted-foreground">
                              {contact.position}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          {contact.phoneNo && (
                            <span className="inline-flex items-center gap-1.5">
                              <Phone className="size-3 shrink-0" />
                              {contact.phoneNo}
                            </span>
                          )}
                          {contact.email && (
                            <span className="inline-flex min-w-0 items-center gap-1.5">
                              <Mail className="size-3 shrink-0" />
                              <span className="truncate">{contact.email}</span>
                            </span>
                          )}
                          {!contact.phoneNo && !contact.email && (
                            <span>No phone or email on file</span>
                          )}
                        </div>
                      </div>
                      <Pencil className="mt-0.5 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
        </TabsContent>

        <TabsContent value="branches" className="pt-4">
          {client.branches.length === 0 ? (
            // Plenty of clients are a single site — say so plainly rather
            // than showing an empty table that looks like missing data.
            <Card className="border-dashed shadow-none">
              <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                  <MapPin className="size-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">
                    Serviced at one location
                  </p>
                  <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                    {client.name} has no separate branches — jobs are booked
                    against {client.address}. Add a branch if they open another
                    site.
                  </p>
                </div>
                <div className="mt-1">
                  <AddBranchDialog clientId={client.id} variant="outline" />
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-56 flex-1 sm:max-w-xs">
                  <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search branches"
                    aria-label="Search branches"
                    className="h-9 pl-9"
                  />
                </div>
                <div className="ml-auto">
                  <AddBranchDialog clientId={client.id} />
                </div>
              </div>

              {filteredBranches.length === 0 ? (
                <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                  No branches match “{query}”.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {filteredBranches.map((branch) => (
                    <button
                      key={branch.id}
                      type="button"
                      onClick={() => {
                        setEditingBranch(branch)
                        setEditDialogOpen(true)
                      }}
                      className="group flex items-start gap-3 rounded-xl p-4 text-left ring-1 ring-foreground/10 transition-colors outline-none hover:bg-muted/50 focus-visible:bg-muted/50"
                    >
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-600/10">
                        <MapPin className="size-4 text-sky-600 dark:text-sky-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {branch.name}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {branch.address}
                        </p>
                      </div>
                      <Pencil className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="pt-4">
          {client.jobs.length === 0 ? (
            <Card className="border-dashed shadow-none">
              <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                  <Wrench className="size-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">No service history yet</p>
                  <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                    Jobs booked for {client.name} in Schedules will appear here
                    automatically, newest first.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Total jobs", value: client.totalJobs },
                  { label: "Completed", value: completedJobs },
                  { label: "Pending", value: pendingJobs },
                ].map((stat) => (
                  <Card key={stat.label} className="shadow-sm" size="sm">
                    <CardContent>
                      <p className="text-xl leading-none font-semibold tabular-nums">
                        {stat.value}
                      </p>
                      <p className="mt-1.5 truncate text-xs text-muted-foreground">
                        {stat.label}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
                <div className="divide-y">
                  {client.jobs.map((job) => (
                    <div key={job.id} className="flex flex-col gap-2 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <p className="text-sm font-medium">
                            {formatScheduleDate(job.date)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatTimeRange(job.startTime, job.endTime)}
                          </p>
                        </div>
                        <Badge className={SCHEDULE_STATUS_CHIP[job.status]}>
                          {SCHEDULE_STATUS_LABELS[job.status]}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {job.workTypes.map((workType) => (
                          <Badge
                            key={workType}
                            className={WORK_TYPE_CHIP[workType]}
                          >
                            {WORK_TYPE_LABELS[workType]}
                          </Badge>
                        ))}
                      </div>

                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="size-3.5 shrink-0" />
                          {job.branchName ?? "Main address"}
                        </span>
                        {job.employees.length > 0 && (
                          <span>Employees: {job.employees.join(", ")}</span>
                        )}
                        {job.contactPerson && (
                          <span>Contact: {job.contactPerson}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {hasMoreHistory && (
                <p className="text-center text-xs text-muted-foreground">
                  Showing the {client.jobs.length} most recent of{" "}
                  {client.totalJobs} jobs.
                </p>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <EditBranchDialog
        branch={editingBranch}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
      />

      <EditContactDialog
        contact={editingContact}
        open={contactDialogOpen}
        onOpenChange={setContactDialogOpen}
      />
    </div>
  )
}
