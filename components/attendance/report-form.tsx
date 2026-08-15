"use client"

import { useState } from "react"
import { ArrowLeft, Loader2, Plus } from "lucide-react"
import {
  createReportUploadUrl,
  getAttendanceFileUrl,
  type ReportClient,
} from "@/app/actions/attendance"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel } from "@/components/ui/field"
import { SearchSelect } from "@/components/ui/search-select"
import {
  FileUpload,
  type UploadedFile,
} from "@/components/reimbursement/file-upload"
import {
  REPORT_TYPES,
  type DraftReport,
} from "@/components/attendance/report-draft"

export type Branch = { id: string; name: string; address: string }

/**
 * Builds one report. Deliberately a whole screen rather than a row in a list:
 * it has five fields including a file upload, and squeezing that beside the
 * selfie was what made the old time-out dialog a scroll.
 *
 * Nothing here is submitted on its own — it hands a draft back to the time-out
 * flow, which files them all with the punch.
 */
export function ReportForm({
  clients,
  loadBranches,
  onAdd,
  onCancel,
  /**
   * How this form gets an upload URL and reads a file back. Both default to
   * the signed-in actions; the kiosk passes username-keyed versions, because
   * the crew filing the report from the shared phone has no session.
   */
  uploadReport = createReportUploadUrl,
  resolveFileUrl = getAttendanceFileUrl,
}: {
  clients: ReportClient[]
  loadBranches: (clientId: string) => Promise<Branch[]>
  onAdd: (draft: Omit<DraftReport, "id">) => void
  onCancel: () => void
  uploadReport?: typeof createReportUploadUrl
  resolveFileUrl?: (key: string) => Promise<string | null>
}) {
  const [type, setType] = useState<DraftReport["type"] | "">("")
  const [clientId, setClientId] = useState("")
  const [branchId, setBranchId] = useState("")
  const [branches, setBranches] = useState<Branch[]>([])
  const [loadingBranches, setLoadingBranches] = useState(false)
  const [serialNo, setSerialNo] = useState("")
  const [file, setFile] = useState<UploadedFile | null>(null)
  // What the server renamed the upload to. Kept because the office finds a
  // report by its serial, never by whatever the scanner app called it.
  const [savedAs, setSavedAs] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const client = clients.find((option) => option.id === clientId) ?? null

  // The filename is built from the type, the client, the branch and the serial,
  // so the file can't be sent until all four are settled — uploading first and
  // typing the serial afterwards would store it under a name nobody searches.
  const ready = Boolean(
    type && client && serialNo.trim() && (!client.hasBranches || branchId)
  )

  // Fetched when a client is picked, not with the page: every client's branches
  // at once is the payload AGENTS.md rules out, and only one client's are ever
  // shown. Done in the handler rather than an effect — it is a response to a
  // tap, not state to synchronise.
  async function pickClient(nextId: string) {
    setClientId(nextId)
    setBranchId("")
    setBranches([])
    setError(null)

    const next = clients.find((option) => option.id === nextId)
    if (!next?.hasBranches) return

    setLoadingBranches(true)
    try {
      setBranches(await loadBranches(nextId))
    } finally {
      setLoadingBranches(false)
    }
  }

  function submit() {
    if (!type) return setError("Choose whether this is a PMS or a service report.")
    if (!client) return setError("Choose which client this report is for.")
    if (client.hasBranches && !branchId) {
      return setError("Choose which branch you were at.")
    }
    if (!serialNo.trim()) return setError("Enter the report's serial number.")
    if (!file) return setError("Attach the soft copy of the report.")

    onAdd({
      type,
      clientId: client.id,
      clientName: client.name,
      branchId: branchId || null,
      branchName: branches.find((b) => b.id === branchId)?.name ?? null,
      serialNo: serialNo.trim(),
      fileKey: file.key,
      // The composed name, not the phone's. Only a label for the list on the
      // way out — the punch recomposes it from the database when it files.
      fileName: savedAs ?? file.name,
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onCancel}
        className="flex items-center gap-1.5 self-start text-xs text-muted-foreground outline-none hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Back to the list
      </button>

      <Field>
        <FieldLabel className="text-xs">Report type</FieldLabel>
        {/* Two big targets rather than a dropdown: it is a binary choice made
            with a thumb, often in a van. */}
        <div className="grid grid-cols-2 gap-2">
          {REPORT_TYPES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setType(option.value)
                setError(null)
              }}
              aria-pressed={type === option.value}
              className={cn(
                "flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition-colors outline-none",
                type === option.value
                  ? "border-brand bg-brand/10 ring-1 ring-brand"
                  : "hover:bg-muted"
              )}
            >
              <span className="text-sm font-semibold">{option.label}</span>
              <span className="text-[11px] leading-tight text-muted-foreground">
                {option.hint}
              </span>
            </button>
          ))}
        </div>
      </Field>

      <Field>
        <FieldLabel htmlFor="report-client" className="text-xs">
          Client
        </FieldLabel>
        <SearchSelect
          id="report-client"
          options={clients.map((option) => ({
            value: option.id,
            label: option.name,
          }))}
          value={clientId}
          onValueChange={pickClient}
          placeholder="Which client?"
          searchPlaceholder="Search clients…"
          emptyMessage="No client by that name."
          className="h-10"
        />
      </Field>

      {/* Only asked when the client actually has branches — most don't, and an
          empty picker is a question with no answer. */}
      {client?.hasBranches && (
        <Field>
          <FieldLabel htmlFor="report-branch" className="text-xs">
            Branch
          </FieldLabel>
          {loadingBranches ? (
            <p className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Loading branches…
            </p>
          ) : (
            <SearchSelect
              id="report-branch"
              options={branches.map((branch) => ({
                value: branch.id,
                label: branch.name,
                hint: branch.address,
              }))}
              value={branchId}
              onValueChange={(value) => {
                setBranchId(value)
                setError(null)
              }}
              placeholder="Which branch?"
              searchPlaceholder="Search branches…"
              emptyMessage="This client has no branches on file."
              className="h-10"
            />
          )}
        </Field>
      )}

      <Field>
        <FieldLabel htmlFor="report-serial" className="text-xs">
          Report serial no.
        </FieldLabel>
        <Input
          id="report-serial"
          value={serialNo}
          onChange={(event) => {
            setSerialNo(event.target.value)
            setError(null)
          }}
          maxLength={60}
          placeholder="As printed on the form"
          autoComplete="off"
          className="h-10 font-mono"
        />
      </Field>

      <Field>
        <FieldLabel className="text-xs">Soft copy</FieldLabel>
        {!ready && (
          <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            Fill in the details above first — the file is renamed and filed
            using them.
          </p>
        )}
        <FileUpload
          folder="receipts"
          value={file}
          disabled={!ready}
          onChange={(next) => {
            setFile(next)
            if (!next) setSavedAs(null)
            setError(null)
          }}
          label="Attach the report file"
          // The server names the file and picks its folder from the client and
          // branch rows these ids point at, so what comes back is the name the
          // office will search for.
          upload={async (filename, contentType, size) => {
            const ticket = await uploadReport({
              type: type as DraftReport["type"],
              clientId,
              branchId: branchId || null,
              serialNo: serialNo.trim(),
              filename,
              contentType,
              size,
            })
            setSavedAs(ticket.ok ? ticket.fileName : null)
            return ticket
          }}
          resolveUrl={resolveFileUrl}
        />
        {savedAs && (
          <p className="text-xs text-muted-foreground">
            Filed as{" "}
            <span className="font-mono break-all text-foreground">
              {savedAs}
            </span>
          </p>
        )}
      </Field>

      {error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}

      <Button type="button" size="lg" onClick={submit} className="h-11 w-full">
        <Plus />
        Add this report
      </Button>
    </div>
  )
}
