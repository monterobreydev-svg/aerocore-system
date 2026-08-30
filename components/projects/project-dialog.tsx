"use client"

import { useActionState, useEffect, useMemo, useState } from "react"
import {
  Building2,
  CalendarRange,
  Calculator,
  Hash,
  Pencil,
  Trash2,
  Wallet,
} from "lucide-react"
import {
  createProject,
  deleteProject,
  updateProject,
  type ProjectState,
} from "@/app/actions/projects"
import {
  deriveProjectFigures,
  PAYMENT_TERMS,
  PAYMENT_TERMS_LABELS,
  pesoAmount,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUSES,
  type ProjectRow,
} from "@/lib/projects"
import { todayKey } from "@/lib/schedule"
import { cn } from "@/lib/utils"
import { ScheduleBranchPicker, useClientSiteData } from "@/components/admin/schedule-site-pickers"
import type { ClientOption } from "@/components/projects/projects-view"
import { ProjectDetails } from "@/components/projects/project-details"
import { Button } from "@/components/ui/button"
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog"
import { Input } from "@/components/ui/input"
import { SearchSelect } from "@/components/ui/search-select"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"

function Required() {
  return <span className="text-destructive">*</span>
}

/**
 * One part of the form, under a heading.
 *
 * The form covers four unrelated things — which job this is, when it runs, how
 * it's billed, and what it's worth. As one stack of eleven inputs it read as a
 * wall; grouped under headings it reads as four short questions. Same shape the
 * client form uses, so a form in this app looks like a form in this app.
 */
function Section({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: React.ElementType
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-sky-600/10">
          <Icon className="size-3.5 text-sky-600 dark:text-sky-400" />
        </div>
        <div className="min-w-0">
          <p className="text-sm leading-tight font-medium">{title}</p>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
      </div>
      <div className="border-l pl-4 sm:ml-3.5">{children}</div>
    </section>
  )
}

/** What a money box holds, as a number. Blank is zero, same as the action. */
function toNumber(value: string) {
  const parsed = Number(value.replace(/[₱,\s]/g, ""))
  return Number.isFinite(parsed) ? parsed : 0
}

/** One typed figure. */
function MoneyField({
  name,
  label,
  value,
  onChange,
  disabled,
  errors,
  hint,
}: {
  name: string
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  errors?: string[]
  hint?: string
}) {
  return (
    <Field data-invalid={!!errors}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Input
        id={name}
        name={name}
        type="number"
        step="0.01"
        min="0"
        inputMode="decimal"
        placeholder="0.00"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="tabular-nums"
      />
      {hint && <FieldDescription>{hint}</FieldDescription>}
      <FieldError errors={errors?.map((message) => ({ message }))} />
    </Field>
  )
}

/** One figure the system works out. Never an input — there is nothing to type. */
function DerivedRow({
  label,
  value,
  formula,
  tone = "plain",
}: {
  label: string
  value: number
  formula: string
  tone?: "plain" | "profit"
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="min-w-0">
        <span className="text-sm">{label}</span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {formula}
        </span>
      </span>
      <span
        className={cn(
          "shrink-0 text-sm font-medium tabular-nums",
          tone === "profit" &&
            (value < 0
              ? "text-rose-700 dark:text-rose-400"
              : "text-emerald-700 dark:text-emerald-400")
        )}
      >
        {pesoAmount(value)}
      </span>
    </div>
  )
}

/**
 * Add or edit one project.
 *
 * The four figures anybody types are on the left; what they imply is worked
 * out beside them as they type, by the same function the server will use when
 * the form is submitted. Nothing derived is an input — there is no box to put
 * a wrong Net of VAT in.
 */
export function ProjectDialog({
  project,
  clients,
  nextNumber,
  open,
  onOpenChange,
}: {
  project: ProjectRow | null
  clients: ClientOption[]
  /** The number a new project would be given, as things stand right now. */
  nextNumber: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const editing = project != null

  // An existing project opens as a record to read; a new one has nothing to
  // read, so it opens as the form. Tapping a row in the ledger should answer
  // "what is this" before offering to change it — and it means a mistap can't
  // put you inside a form over somebody's figures.
  const [mode, setMode] = useState<"view" | "edit">(editing ? "view" : "edit")

  const [state, action, pending] = useActionState<ProjectState, FormData>(
    editing ? updateProject : createProject,
    undefined
  )

  // Controlled because the derived panel reads them on every keystroke. The
  // rest of the form is uncontrolled — nothing else needs watching.
  const [projectAmount, setProjectAmount] = useState(
    project ? String(project.projectAmount) : ""
  )
  const [cashCollection, setCashCollection] = useState(
    project ? String(project.cashCollection) : ""
  )
  const [accrualRevenue, setAccrualRevenue] = useState(
    project ? String(project.accrualRevenue) : ""
  )

  // These three drive nothing but their own inputs; they are state only
  // because Select and SearchSelect are controlled components.
  const [status, setStatus] = useState(project?.status ?? "IN_PROGRESS")
  const [terms, setTerms] = useState(project?.terms ?? "UPON_COMPLETION")
  const [clientId, setClientId] = useState(project?.clientId ?? "")
  const [branchId, setBranchId] = useState(project?.branchId ?? "")

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (state?.success) onOpenChange(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  // The cost comes from the receipts, not from this form — an existing
  // project brings its rolled-up COGS with it, and a project being created has
  // nothing charged to it yet because its S.O. number does not exist yet.
  const cogs = project?.cogs ?? 0

  const figures = deriveProjectFigures(
    {
      projectAmount: toNumber(projectAmount),
      cashCollection: toNumber(cashCollection),
      accrualRevenue: toNumber(accrualRevenue),
    },
    cogs
  )

  const clientOptions = clients.map((client) => ({
    value: client.id,
    label: client.name,
  }))

  // Branches only. The sales orders this client already has are no use to a
  // form whose whole job is to issue another one.
  const siteData = useClientSiteData(
    useMemo(() => [clientId], [clientId]),
    { withProjects: false }
  )
  const selectedClient = clients.find((client) => client.id === clientId)

  async function handleDelete() {
    if (!project) return
    setDeleting(true)
    await deleteProject(project.id)
    // Both flags cleared before the dialog goes: this component outlives the
    // project it was showing — the ledger keeps it mounted for the next row —
    // so a `confirmDelete` left standing would greet the next project opened
    // with a confirmation nobody asked for.
    setConfirmDelete(false)
    setDeleting(false)
    onOpenChange(false)
  }

  const busy = pending || deleting
  const salesOrderNo = project?.salesOrderNo ?? nextNumber

  return (
    // This dialog holds typed figures, so a stray click on the backdrop must
    // not be what throws them away — and switching between the record and the
    // form changes the popup's height under the pointer, which is exactly the
    // kind of press that gets misread as one landing outside. Escape, the X
    // and Cancel all still close it.
    <>
      <Dialog
        open={open}
        disablePointerDismissal
        onOpenChange={(next, details) => {
          if (
            !next &&
            (details.reason === "outside-press" || details.reason === "focus-out")
          ) {
            return
          }
          onOpenChange(next)
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              {mode === "view"
                ? "Project"
                : editing
                  ? "Edit project"
                  : "Add project"}
              <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs font-normal">
                {salesOrderNo}
              </span>
            </DialogTitle>
            {/* Read out but not shown when viewing. The panel underneath already
                names the project, its status and the client, so a line of prose
                above it was only pushing the actual record further down the
                screen — but the dialog still needs something to point
                aria-describedby at. Same treatment as the liquidation form. */}
            <DialogDescription className={mode === "view" ? "sr-only" : undefined}>
              {mode === "view"
                ? "Everything on record for this project, and who has changed it."
                : editing
                  ? "Anything here can be corrected. The totals for the month and the year follow whatever you change."
                  : "Four sections: what the job is, when it runs, how it's billed, and what it's worth."}
            </DialogDescription>
          </DialogHeader>

          {mode === "view" && project ? (
            <div className="-mx-1 max-h-[62dvh] overflow-y-auto px-1 py-1">
              <ProjectDetails project={project} />
            </div>
          ) : (
          <form
            action={action}
            id="project-form"
            className="-mx-1 max-h-[62dvh] overflow-y-auto px-1 py-1"
          >
            {editing && (
              <input type="hidden" name="projectId" value={project.id} />
            )}

            <div className="flex flex-col gap-5">
              {/* The number, shown rather than described. It is the first thing
                  anybody quotes about a project, and on a new one it answers
                  "what will this be called" before the form is even filled in. */}
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border bg-muted/40 px-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground ring-1 ring-border">
                    <Hash className="size-4" />
                  </div>
                  <div>
                    <p className="text-[0.625rem] font-medium tracking-wide text-muted-foreground uppercase">
                      Sales order no.
                    </p>
                    <p className="font-mono text-lg leading-tight font-semibold">
                      {salesOrderNo}
                    </p>
                  </div>
                </div>
                <p className="max-w-[19rem] text-xs text-muted-foreground sm:text-right">
                  {editing
                    ? "Issued when this project was added. It never changes, even if the dates do."
                    : "Issued automatically when you save — the next free number for this year. Nobody types it."}
                </p>
              </div>

              <Section
                icon={Building2}
                title="The job"
                hint="What it is and who it's for"
              >
                <FieldGroup>
                  <Field data-invalid={!!state?.errors?.name}>
                    <FieldLabel htmlFor="name">
                      Project name / description <Required />
                    </FieldLabel>
                    <Input
                      id="name"
                      name="name"
                      defaultValue={project?.name}
                      placeholder="Chiller replacement — Tower B"
                      autoComplete="off"
                      disabled={busy}
                      required
                    />
                    <FieldError
                      errors={state?.errors?.name?.map((message) => ({
                        message,
                      }))}
                    />
                  </Field>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field data-invalid={!!state?.errors?.clientId}>
                      <FieldLabel htmlFor="clientId">
                        Client <Required />
                      </FieldLabel>
                      {/* The same client records the rest of the app uses — a
                          client added on the Clients page is selectable here on
                          the next load, with no second list to maintain. */}
                      <SearchSelect
                        id="clientId"
                        name="clientId"
                        options={clientOptions}
                        value={clientId}
                        // The branch belonged to the old client, so it goes with
                        // it — leaving it set would put the job at another
                        // customer's address.
                        onValueChange={(value) => {
                          setClientId(value)
                          setBranchId("")
                        }}
                        placeholder="Choose a client"
                        searchPlaceholder="Search clients…"
                        emptyMessage="No client by that name."
                        disabled={busy}
                      />
                      <FieldError
                        errors={state?.errors?.clientId?.map((message) => ({
                          message,
                        }))}
                      />
                    </Field>

                    <Field data-invalid={!!state?.errors?.branchId}>
                      <FieldLabel htmlFor="branchId">Site</FieldLabel>
                      {/* Where the job is, as a fact about the job rather than
                          about any one visit. The schedules underneath still
                          carry their own branch — a survey can be at head office
                          while the work is on site — so this constrains nothing;
                          it answers "where is this project". */}
                      <ScheduleBranchPicker
                        id="branchId"
                        name="branchId"
                        data={siteData}
                        clientId={clientId}
                        clientAddress={selectedClient?.address}
                        value={branchId}
                        onValueChange={(value: string) => setBranchId(value)}
                        disabled={busy}
                      />
                      <FieldError
                        errors={state?.errors?.branchId?.map((message) => ({
                          message,
                        }))}
                      />
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="status">Status</FieldLabel>
                      <Select
                        name="status"
                        value={status}
                        onValueChange={(value) => setStatus(value as typeof status)}
                        disabled={busy}
                        items={Object.fromEntries(
                          PROJECT_STATUSES.map((option) => [
                            option,
                            PROJECT_STATUS_LABELS[option],
                          ])
                        )}
                      >
                        <SelectTrigger id="status" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PROJECT_STATUSES.map((option) => (
                            <SelectItem key={option} value={option}>
                              {PROJECT_STATUS_LABELS[option]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                </FieldGroup>
              </Section>

              <Section
                icon={CalendarRange}
                title="When it runs"
                hint="The start date decides which month it's listed under"
              >
                <FieldGroup>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field data-invalid={!!state?.errors?.startDate}>
                      <FieldLabel htmlFor="startDate">
                        Start date <Required />
                      </FieldLabel>
                      <Input
                        id="startDate"
                        name="startDate"
                        type="date"
                        defaultValue={project?.startDate ?? todayKey()}
                        disabled={busy}
                        required
                      />
                      <FieldError
                        errors={state?.errors?.startDate?.map((message) => ({
                          message,
                        }))}
                      />
                    </Field>

                    <Field data-invalid={!!state?.errors?.endDate}>
                      <FieldLabel htmlFor="endDate">End date</FieldLabel>
                      <Input
                        id="endDate"
                        name="endDate"
                        type="date"
                        defaultValue={project?.endDate ?? ""}
                        disabled={busy}
                      />
                      <FieldDescription>
                        Leave blank while the job is still running.
                      </FieldDescription>
                      <FieldError
                        errors={state?.errors?.endDate?.map((message) => ({
                          message,
                        }))}
                      />
                    </Field>
                  </div>
                </FieldGroup>
              </Section>

              <Section
                icon={Wallet}
                title="How it's billed"
                hint="Terms agreed, and the invoice once there is one"
              >
                <FieldGroup>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="terms">Terms of payment</FieldLabel>
                      <Select
                        name="terms"
                        value={terms}
                        onValueChange={(value) => setTerms(value as typeof terms)}
                        disabled={busy}
                        items={Object.fromEntries(
                          PAYMENT_TERMS.map((option) => [
                            option,
                            PAYMENT_TERMS_LABELS[option],
                          ])
                        )}
                      >
                        <SelectTrigger id="terms" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PAYMENT_TERMS.map((option) => (
                            <SelectItem key={option} value={option}>
                              {PAYMENT_TERMS_LABELS[option]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>

                    <Field data-invalid={!!state?.errors?.siNo}>
                      <FieldLabel htmlFor="siNo">S.I. No.</FieldLabel>
                      <Input
                        id="siNo"
                        name="siNo"
                        defaultValue={project?.siNo ?? ""}
                        placeholder="Once invoiced"
                        autoComplete="off"
                        disabled={busy}
                      />
                      <FieldDescription>
                        Blank until the sales invoice is issued.
                      </FieldDescription>
                      <FieldError
                        errors={state?.errors?.siNo?.map((message) => ({
                          message,
                        }))}
                      />
                    </Field>
                  </div>
                </FieldGroup>
              </Section>

              <Section
                icon={Calculator}
                title="What it's worth"
                hint="Type the four figures; the rest is worked out as you go"
              >
                {/* Typed on the left, worked out on the right — and the right-hand
                    side moves as the left is typed, so the VAT and the margin are
                    answered before the form is even submitted. */}
                <div className="grid gap-5 sm:grid-cols-2">
                  <FieldGroup>
                    <MoneyField
                      name="projectAmount"
                      label="Project amount"
                      value={projectAmount}
                      onChange={setProjectAmount}
                      disabled={busy}
                      errors={state?.errors?.projectAmount}
                      hint="VAT inclusive, as quoted."
                    />
                    <MoneyField
                      name="cashCollection"
                      label="Cash collection"
                      value={cashCollection}
                      onChange={setCashCollection}
                      disabled={busy}
                      errors={state?.errors?.cashCollection}
                    />
                    <MoneyField
                      name="accrualRevenue"
                      label="Accrual revenue"
                      value={accrualRevenue}
                      onChange={setAccrualRevenue}
                      disabled={busy}
                      errors={state?.errors?.accrualRevenue}
                    />
                  </FieldGroup>

                  <div className="h-fit rounded-xl border bg-muted/30 p-3">
                    <p className="flex items-center gap-1.5 text-[0.6875rem] font-medium tracking-wide text-muted-foreground uppercase">
                      <Calculator className="size-3.5" />
                      Worked out for you
                    </p>
                    <div className="mt-1 flex flex-col divide-y">
                      {/* First, because it is the one that surprises people:
                          COGS used to be a box on this form and is now derived —
                          what the crew liquidated against this job, what the
                          office paid for it directly, and the wages of the hours
                          they were scheduled on it. */}
                      <DerivedRow
                        label="COGS"
                        value={figures.cogs}
                        formula={
                          editing
                            ? "Liquidations, office expenses and crew wages on this S.O."
                            : "Fills in from expenses and scheduled hours on this S.O."
                        }
                      />
                      <DerivedRow
                        label="Net of VAT"
                        value={figures.netOfVat}
                        formula="Project amount ÷ 1.12"
                      />
                      <DerivedRow
                        label="Input VAT"
                        value={figures.inputVat}
                        formula="Project amount − net of VAT"
                      />
                      <DerivedRow
                        label="COGS VAT"
                        value={figures.cogsVat}
                        formula="COGS × 12%"
                      />
                      <DerivedRow
                        label="Output VAT"
                        value={figures.outputVat}
                        formula="Input VAT − COGS VAT"
                      />
                      <DerivedRow
                        label="Gross profit"
                        value={figures.grossProfit}
                        formula="Accrual revenue − COGS"
                        tone="profit"
                      />
                    </div>
                  </div>
                </div>
              </Section>

              {state?.message && (
                <p className="text-sm text-destructive">{state.message}</p>
              )}
            </div>
          </form>
          )}

          {/* ---------------------------------------------------------------
              One footer for both modes, and the same three buttons in the same
              three places — only their labels and handlers change.

              This is not tidiness. Base UI decides a dialog was dismissed by
              asking whether the pressed element is inside the popup, and it
              asks after the press has been handled. A button that unmounts
              itself — "Edit project" swapping the whole view out — is no longer
              inside anything by then, so the press reads as a click on the
              backdrop and the dialog closes under you. Keeping the node mounted
              and only updating its props is what stops that.
              --------------------------------------------------------------- */}
          <DialogFooter className="sm:justify-between">
            {editing ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
                className="text-destructive hover:bg-destructive/10"
              >
                <Trash2 />
                Delete
              </Button>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2">
              {/* Backing out of an edit returns to the record it was opened
                  from, rather than closing the dialog and losing your place in
                  a ledger you may have scrolled a long way down. */}
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  mode === "edit" && editing
                    ? setMode("view")
                    : onOpenChange(false)
                }
                disabled={busy}
              >
                {mode === "view" ? "Close" : "Cancel"}
              </Button>

              {/* Two buttons, keyed apart — NOT one button whose `type` flips.
                  React flushes a click's state update before the browser
                  performs that click's default action, so a single node that
                  turns into `type="submit" form="project-form"` mid-click gets
                  submitted by the very press that asked to start editing: the
                  record saved itself and the dialog closed on the way out.
                  Distinct keys keep the view's button a `type="button"` for its
                  whole life. */}
              {mode === "view" ? (
                <Button
                  key="start-editing"
                  type="button"
                  onClick={() => setMode("edit")}
                  disabled={busy}
                >
                  <Pencil />
                  Edit project
                </Button>
              ) : (
                <Button
                  key="submit-project"
                  type="submit"
                  form="project-form"
                  disabled={busy}
                >
                  {pending
                    ? "Saving…"
                    : editing
                      ? "Save changes"
                      : "Add project"}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Its own popup, not a panel inside the dialog above.

          That placement is what the three comments around this footer were
          working around: a panel that grew inside the record changed the
          dialog's height under the pointer, and Base UI reads a press that
          lands outside the popup's bounds as a dismissal. Asking in a separate
          window means nothing moves, nothing unmounts mid-click, and the two
          buttons in reach are the answer to the question rather than Save and
          Delete side by side. */}
      <ConfirmDeleteDialog
        open={confirmDelete && Boolean(project)}
        onOpenChange={setConfirmDelete}
        title={`Delete ${project?.salesOrderNo}?`}
        pending={deleting}
        onConfirm={handleDelete}
      >
        <p>
          {project?.name} comes out of the monthly and yearly totals, along
          with any office costs recorded against this sales order. This cannot
          be undone.
        </p>
      </ConfirmDeleteDialog>
    </>
  )
}
