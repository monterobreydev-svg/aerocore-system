"use client"

import { useActionState, useEffect, useState } from "react"
import dynamic from "next/dynamic"
import {
  ChevronDown,
  ChevronLeft,
  Clock,
  History,
  Pencil,
  Receipt,
  ShieldAlert,
  UserRound,
  Wallet,
} from "lucide-react"
import {
  updateStaffAccount,
  type UpdateStaffState,
} from "@/app/actions/staff"
import { roleAccessLabel } from "@/lib/roles"
import {
  CIVIL_STATUS_OPTIONS,
  EMPLOYMENT_TYPE_OPTIONS,
  civilStatusLabel,
  employmentTypeLabel,
  monthlyFromHourly,
  MONTHLY_RATE_BASIS,
} from "@/lib/employee"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RoleBadge } from "@/components/admin/role-badge"
import { SkillsPicker } from "@/components/admin/skills-picker"
import type { StaffMember } from "@/components/admin/staff-cards"

// A table, a pager and the liquidation dialog — none of it needed to read
// someone's profile, so it stays out of the chunk that renders one.
const StaffReimbursements = dynamic(() =>
  import("@/components/admin/staff-reimbursements").then(
    (m) => m.StaffReimbursements
  )
)
const StaffAttendance = dynamic(() =>
  import("@/components/admin/staff-attendance").then((m) => m.StaffAttendance)
)

function initials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase()
}

function peso(amount: number) {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "PHP",
  })
}

// "2019-03-04 · 7.4 years" — the elapsed figure is what someone actually
// scans for; the raw date alone makes you do the arithmetic yourself.
function tenureFrom(dateHired: string) {
  const months =
    (Date.now() - new Date(dateHired).getTime()) / (30.44 * 864e5)
  if (months < 1) return "this month"
  if (months < 24) return `${Math.round(months)} months`
  return `${(months / 12).toFixed(1)} years`
}

const FIELD_LABELS: Record<string, string> = {
  firstName: "First name",
  lastName: "Last name",
  middleName: "Middle name",
  phoneNo: "Mobile number",
  email: "Email",
  birthDate: "Date of birth",
  civilStatus: "Civil status",
  address: "Home address",
  employeeNo: "Employee ID",
  position: "Position",
  employmentType: "Employment type",
  dateHired: "Date hired",
  hourlyRate: "Hourly rate",
  skills: "Skills",
  emergencyContactPerson: "Emergency contact name",
  emergencyContactNo: "Emergency contact number",
  emergencyContactRelationship: "Emergency contact relationship",
  tinNo: "TIN",
  sssNo: "SSS",
  philhealthNo: "PhilHealth",
  pagibigNo: "Pag-IBIG",
  isActive: "Status",
}

function formatFieldValue(field: string, value: string | null) {
  if (!value) return "—"
  if (field === "hourlyRate")
    return peso(Number(value))
  if (field === "birthDate" || field === "dateHired") {
    return new Date(value).toLocaleDateString()
  }
  if (field === "isActive") return value === "true" ? "Active" : "Inactive"
  if (field === "civilStatus") {
    return civilStatusLabel(value as Parameters<typeof civilStatusLabel>[0])
  }
  if (field === "employmentType") {
    return employmentTypeLabel(
      value as Parameters<typeof employmentTypeLabel>[0]
    )
  }
  return value
}

const TABS = [
  { value: "details", label: "Details", icon: UserRound },
  { value: "attendance", label: "Attendance", icon: Clock },
  { value: "payroll", label: "Payroll", icon: Wallet },
  { value: "reimbursements", label: "Reimbursements", icon: Receipt },
] as const

// One label→value line. Values sit right-aligned against the label so the
// eye can run straight down the column looking for a specific figure.
function Row({
  label,
  value,
  mono = false,
}: {
  label: string
  value?: React.ReactNode
  mono?: boolean
}) {
  const empty =
    value === null || value === undefined || value === "" || value === "—"
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

// size="sm" drops --card-spacing from 4 to 3; with the tighter Row padding a
// card of facts reads in about two-thirds the height, so the whole record
// fits on screen instead of trailing off below the fold.
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
    <Card size="sm" className="shadow-sm">
      <CardHeader className="border-b">
        <CardTitle>{title}</CardTitle>
        {description && (
          <CardDescription className="text-xs">{description}</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <dl className="flex flex-col">{children}</dl>
      </CardContent>
    </Card>
  )
}

function ComingSoon({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType
  title: string
  description: string
}) {
  return (
    <Card className="border-dashed shadow-none">
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <Icon className="size-6 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
            {description}
          </p>
        </div>
        <Badge variant="secondary" className="mt-1">
          Coming soon
        </Badge>
      </CardContent>
    </Card>
  )
}

export function StaffDetailView({
  staff,
  onBack,
  readOnly = false,
}: {
  staff: StaffMember
  onBack: () => void
  readOnly?: boolean
}) {
  const [state, action, pending] = useActionState<UpdateStaffState, FormData>(
    updateStaffAccount,
    undefined
  )
  const [historyOpen, setHistoryOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<string>("details")
  const [editing, setEditing] = useState(false)
  // Uncontrolled inputs read their defaultValue from this frozen snapshot,
  // not the live `staff` prop — a successful save triggers revalidatePath,
  // which can push fresh data into this still-mounted form before onBack()
  // unmounts it, and changing defaultValue on an already-initialised
  // uncontrolled field is what Base UI warns about.
  const [initial] = useState(staff)

  useEffect(() => {
    if (state?.success) {
      onBack()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const editCount = staff.employee.editLogs.length
  const e = staff.employee

  const fullName = [e.firstName, e.middleName, e.lastName]
    .filter(Boolean)
    .join(" ")

  const emergency = e.emergencyContactPerson
    ? [e.emergencyContactPerson, e.emergencyContactNo].filter(Boolean).join(" · ")
    : null

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
        All employees
      </Button>

      {/* Identity header — plain, not a card, so the page starts with the
          person's name rather than another box to parse. */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Avatar className="size-12 rounded-xl">
            <AvatarFallback className="rounded-xl bg-sky-600/10 text-sky-700 dark:text-sky-400">
              {initials(e.firstName, e.lastName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl leading-tight font-semibold">
                {fullName}
              </h2>
              <Badge
                className={cn(
                  staff.isActive
                    ? "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {staff.isActive ? "Active" : "Inactive"}
              </Badge>
              <RoleBadge role={staff.role} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {e.position}
              {e.employmentType && ` · ${employmentTypeLabel(e.employmentType)}`}
            </p>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">
              {e.employeeNo ?? `@${staff.username}`}
              {e.dateHired && ` · hired ${e.dateHired}`}
            </p>
          </div>
        </div>

        {!readOnly && !editing && (
          <Button type="button" variant="outline" onClick={() => setEditing(true)}>
            <Pencil />
            Edit profile
          </Button>
        )}
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as string)}
      >
        {/* min-w-0 + scroll: without it the four triggers are flex-none and
            force the whole page wider than a phone, which makes the browser
            zoom the entire layout out to fit. */}
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
              {tab.value === "reimbursements" && staff.claimCount > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {staff.claimCount}
                </Badge>
              )}
              {tab.value === "attendance" && staff.attendanceCount > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {staff.attendanceCount}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="details" className="pt-4">
          {readOnly && (
            <div className="mb-5 flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-400">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                You can&apos;t edit your own account. Ask a Director to make
                changes here.
              </span>
            </div>
          )}

          {editing ? (
            <form action={action} id={`staff-edit-form-${staff.id}`}>
              <input type="hidden" name="employeeId" value={e.id} />

              <Card className="shadow-sm">
                <CardContent className="flex flex-col gap-6">
                  <div className="flex flex-col gap-3">
                    <p className="text-sm font-medium">Personal</p>
                    <FieldGroup>
                      <div className="grid gap-4 sm:grid-cols-3">
                        <Field data-invalid={!!state?.errors?.firstName}>
                          <FieldLabel htmlFor={`firstName-${staff.id}`}>
                            First name
                          </FieldLabel>
                          <Input
                            id={`firstName-${staff.id}`}
                            name="firstName"
                            defaultValue={initial.employee.firstName}
                            disabled={pending}
                            required
                          />
                          <FieldError
                            errors={state?.errors?.firstName?.map((m) => ({
                              message: m,
                            }))}
                          />
                        </Field>
                        <Field data-invalid={!!state?.errors?.middleName}>
                          <FieldLabel htmlFor={`middleName-${staff.id}`}>
                            Middle name
                          </FieldLabel>
                          <Input
                            id={`middleName-${staff.id}`}
                            name="middleName"
                            defaultValue={initial.employee.middleName ?? ""}
                            disabled={pending}
                          />
                        </Field>
                        <Field data-invalid={!!state?.errors?.lastName}>
                          <FieldLabel htmlFor={`lastName-${staff.id}`}>
                            Last name
                          </FieldLabel>
                          <Input
                            id={`lastName-${staff.id}`}
                            name="lastName"
                            defaultValue={initial.employee.lastName}
                            disabled={pending}
                            required
                          />
                          <FieldError
                            errors={state?.errors?.lastName?.map((m) => ({
                              message: m,
                            }))}
                          />
                        </Field>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-3">
                        <Field data-invalid={!!state?.errors?.birthDate}>
                          <FieldLabel htmlFor={`birthDate-${staff.id}`}>
                            Date of birth
                          </FieldLabel>
                          <Input
                            id={`birthDate-${staff.id}`}
                            name="birthDate"
                            type="date"
                            defaultValue={initial.employee.birthDate ?? ""}
                            disabled={pending}
                          />
                        </Field>
                        <Field data-invalid={!!state?.errors?.civilStatus}>
                          <FieldLabel htmlFor={`civilStatus-${staff.id}`}>
                            Civil status
                          </FieldLabel>
                          <Select
                            name="civilStatus"
                            defaultValue={initial.employee.civilStatus ?? ""}
                            disabled={pending}
                            items={Object.fromEntries(
                              CIVIL_STATUS_OPTIONS.map((s) => [
                                s,
                                civilStatusLabel(s),
                              ])
                            )}
                          >
                            <SelectTrigger
                              id={`civilStatus-${staff.id}`}
                              className="w-full"
                            >
                              <SelectValue placeholder="Select civil status" />
                            </SelectTrigger>
                            <SelectContent>
                              {CIVIL_STATUS_OPTIONS.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {civilStatusLabel(s)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field data-invalid={!!state?.errors?.phoneNo}>
                          <FieldLabel htmlFor={`phoneNo-${staff.id}`}>
                            Mobile number
                          </FieldLabel>
                          <Input
                            id={`phoneNo-${staff.id}`}
                            name="phoneNo"
                            placeholder="0917 123 4567"
                            defaultValue={initial.employee.phoneNo ?? ""}
                            disabled={pending}
                          />
                        </Field>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field data-invalid={!!state?.errors?.email}>
                          <FieldLabel htmlFor={`email-${staff.id}`}>
                            Email
                          </FieldLabel>
                          <Input
                            id={`email-${staff.id}`}
                            name="email"
                            type="email"
                            placeholder="name@gmail.com"
                            defaultValue={initial.employee.email ?? ""}
                            disabled={pending}
                          />
                          <FieldError
                            errors={state?.errors?.email?.map((m) => ({
                              message: m,
                            }))}
                          />
                        </Field>
                        <Field data-invalid={!!state?.errors?.address}>
                          <FieldLabel htmlFor={`address-${staff.id}`}>
                            Home address
                          </FieldLabel>
                          <Input
                            id={`address-${staff.id}`}
                            name="address"
                            placeholder="Barangay Parian, Calamba, Laguna"
                            defaultValue={initial.employee.address ?? ""}
                            disabled={pending}
                          />
                        </Field>
                      </div>
                    </FieldGroup>
                  </div>

                  <Separator />

                  <div className="flex flex-col gap-3">
                    <p className="text-sm font-medium">Employment</p>
                    <FieldGroup>
                      <div className="grid gap-4 sm:grid-cols-3">
                        <Field data-invalid={!!state?.errors?.employeeNo}>
                          <FieldLabel htmlFor={`employeeNo-${staff.id}`}>
                            Employee ID
                          </FieldLabel>
                          <Input
                            id={`employeeNo-${staff.id}`}
                            name="employeeNo"
                            placeholder="E-0001"
                            defaultValue={initial.employee.employeeNo ?? ""}
                            disabled={pending}
                            className="font-mono"
                          />
                          <FieldError
                            errors={state?.errors?.employeeNo?.map((m) => ({
                              message: m,
                            }))}
                          />
                        </Field>
                        <Field data-invalid={!!state?.errors?.position}>
                          <FieldLabel htmlFor={`position-${staff.id}`}>
                            Position
                          </FieldLabel>
                          <Input
                            id={`position-${staff.id}`}
                            name="position"
                            defaultValue={initial.employee.position}
                            disabled={pending}
                            required
                          />
                          <FieldError
                            errors={state?.errors?.position?.map((m) => ({
                              message: m,
                            }))}
                          />
                        </Field>
                        <Field data-invalid={!!state?.errors?.employmentType}>
                          <FieldLabel htmlFor={`employmentType-${staff.id}`}>
                            Employment type
                          </FieldLabel>
                          <Select
                            name="employmentType"
                            defaultValue={initial.employee.employmentType ?? ""}
                            disabled={pending}
                            items={Object.fromEntries(
                              EMPLOYMENT_TYPE_OPTIONS.map((t) => [
                                t,
                                employmentTypeLabel(t),
                              ])
                            )}
                          >
                            <SelectTrigger
                              id={`employmentType-${staff.id}`}
                              className="w-full"
                            >
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                              {EMPLOYMENT_TYPE_OPTIONS.map((t) => (
                                <SelectItem key={t} value={t}>
                                  {employmentTypeLabel(t)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field data-invalid={!!state?.errors?.dateHired}>
                          <FieldLabel htmlFor={`dateHired-${staff.id}`}>
                            Date hired
                          </FieldLabel>
                          <Input
                            id={`dateHired-${staff.id}`}
                            name="dateHired"
                            type="date"
                            defaultValue={initial.employee.dateHired ?? ""}
                            disabled={pending}
                          />
                        </Field>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-3">
                        <Field data-invalid={!!state?.errors?.hourlyRate}>
                          <FieldLabel htmlFor={`hourlyRate-${staff.id}`}>
                            Hourly rate
                          </FieldLabel>
                          <Input
                            id={`hourlyRate-${staff.id}`}
                            name="hourlyRate"
                            type="number"
                            min="0"
                            step="0.01"
                            defaultValue={initial.employee.hourlyRate}
                            disabled={pending}
                            required
                          />
                          <FieldError
                            errors={state?.errors?.hourlyRate?.map((m) => ({
                              message: m,
                            }))}
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor={`isActive-${staff.id}`}>
                            Status
                          </FieldLabel>
                          <Select
                            name="isActive"
                            defaultValue={String(initial.isActive)}
                            disabled={pending}
                            items={{ true: "Active", false: "Inactive" }}
                          >
                            <SelectTrigger
                              id={`isActive-${staff.id}`}
                              className="w-full"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="true">Active</SelectItem>
                              <SelectItem value="false">Inactive</SelectItem>
                            </SelectContent>
                          </Select>
                        </Field>
                      </div>

                      <Field data-invalid={!!state?.errors?.skills}>
                        <FieldLabel>Skills</FieldLabel>
                        <SkillsPicker
                          idPrefix={`skill-${staff.id}`}
                          selected={initial.employee.skills}
                          disabled={pending}
                        />
                        <FieldError
                          errors={state?.errors?.skills?.map((m) => ({
                            message: m,
                          }))}
                        />
                      </Field>
                    </FieldGroup>
                  </div>

                  <Separator />

                  <div className="flex flex-col gap-3">
                    <p className="text-sm font-medium">Emergency contact</p>
                    <FieldGroup>
                      <div className="grid gap-4 sm:grid-cols-3">
                        <Field>
                          <FieldLabel
                            htmlFor={`emergencyContactPerson-${staff.id}`}
                          >
                            Contact name
                          </FieldLabel>
                          <Input
                            id={`emergencyContactPerson-${staff.id}`}
                            name="emergencyContactPerson"
                            placeholder="Marites Dela Cruz"
                            defaultValue={
                              initial.employee.emergencyContactPerson ?? ""
                            }
                            disabled={pending}
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor={`emergencyContactNo-${staff.id}`}>
                            Contact number
                          </FieldLabel>
                          <Input
                            id={`emergencyContactNo-${staff.id}`}
                            name="emergencyContactNo"
                            placeholder="0918 220 3341"
                            defaultValue={
                              initial.employee.emergencyContactNo ?? ""
                            }
                            disabled={pending}
                          />
                        </Field>
                        <Field>
                          <FieldLabel
                            htmlFor={`emergencyContactRelationship-${staff.id}`}
                          >
                            Relationship
                          </FieldLabel>
                          <Input
                            id={`emergencyContactRelationship-${staff.id}`}
                            name="emergencyContactRelationship"
                            placeholder="Spouse"
                            defaultValue={
                              initial.employee.emergencyContactRelationship ?? ""
                            }
                            disabled={pending}
                          />
                        </Field>
                      </div>
                    </FieldGroup>
                  </div>

                  <Separator />

                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <p className="text-sm font-medium">Government numbers</p>
                      <span className="text-xs text-muted-foreground">
                        — can be filled in later, before the first payroll run
                      </span>
                    </div>
                    <div className="rounded-xl border bg-muted/30 p-4">
                      <FieldGroup>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                          <Field>
                            <FieldLabel htmlFor={`tinNo-${staff.id}`}>
                              TIN
                            </FieldLabel>
                            <Input
                              id={`tinNo-${staff.id}`}
                              name="tinNo"
                              placeholder="123-456-789-000"
                              defaultValue={initial.employee.tinNo ?? ""}
                              disabled={pending}
                              className="bg-background"
                            />
                          </Field>
                          <Field>
                            <FieldLabel htmlFor={`sssNo-${staff.id}`}>
                              SSS
                            </FieldLabel>
                            <Input
                              id={`sssNo-${staff.id}`}
                              name="sssNo"
                              placeholder="34-1234567-8"
                              defaultValue={initial.employee.sssNo ?? ""}
                              disabled={pending}
                              className="bg-background"
                            />
                          </Field>
                          <Field>
                            <FieldLabel htmlFor={`philhealthNo-${staff.id}`}>
                              PhilHealth
                            </FieldLabel>
                            <Input
                              id={`philhealthNo-${staff.id}`}
                              name="philhealthNo"
                              placeholder="12-345678901-2"
                              defaultValue={initial.employee.philhealthNo ?? ""}
                              disabled={pending}
                              className="bg-background"
                            />
                          </Field>
                          <Field>
                            <FieldLabel htmlFor={`pagibigNo-${staff.id}`}>
                              Pag-IBIG
                            </FieldLabel>
                            <Input
                              id={`pagibigNo-${staff.id}`}
                              name="pagibigNo"
                              placeholder="1234-5678-9012"
                              defaultValue={initial.employee.pagibigNo ?? ""}
                              disabled={pending}
                              className="bg-background"
                            />
                          </Field>
                        </div>
                      </FieldGroup>
                    </div>
                  </div>

                  {state?.message && (
                    <p className="text-sm text-destructive">{state.message}</p>
                  )}
                </CardContent>
              </Card>

              <div className="sticky bottom-0 z-10 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/85 px-4 py-3 backdrop-blur">
                <p className="text-xs text-muted-foreground">
                  Every change is logged against your account.
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditing(false)}
                    disabled={pending}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={pending}>
                    {pending ? "Saving..." : "Save changes"}
                  </Button>
                </div>
              </div>
            </form>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              <InfoCard title="Contact">
                <Row label="Mobile" value={e.phoneNo} />
                <Row label="Email" value={e.email} />
                <Row label="Address" value={e.address} />
                <Row label="Emergency contact" value={emergency} />
                <Row
                  label="Relationship"
                  value={e.emergencyContactRelationship}
                />
              </InfoCard>

              <InfoCard title="Employment">
                <Row label="Employee ID" value={e.employeeNo} mono />
                <Row label="Position" value={e.position} />
                <Row
                  label="Status"
                  value={
                    e.employmentType
                      ? `${employmentTypeLabel(e.employmentType)} · ${
                          staff.isActive ? "Active" : "Inactive"
                        }`
                      : staff.isActive
                        ? "Active"
                        : "Inactive"
                  }
                />
                <Row
                  label="Date hired"
                  value={
                    e.dateHired ? `${e.dateHired} · ${tenureFrom(e.dateHired)}` : null
                  }
                />
                <Row
                  label="Skills"
                  value={
                    e.skills.length > 0 ? (
                      <span className="flex flex-wrap justify-end gap-1">
                        {e.skills.map((skill) => (
                          <Badge key={skill} variant="outline">
                            {skill}
                          </Badge>
                        ))}
                      </span>
                    ) : null
                  }
                />
              </InfoCard>

              <InfoCard
                title="Compensation"
                description={`Monthly is an estimate at ${MONTHLY_RATE_BASIS} — it isn't stored`}
              >
                <Row label="Hourly rate" value={peso(e.hourlyRate)} />
                <Row
                  label="Projected monthly"
                  value={peso(monthlyFromHourly(e.hourlyRate))}
                />
              </InfoCard>

              <InfoCard title="Personal">
                <Row label="Full name" value={fullName} />
                <Row
                  label="Date of birth"
                  value={
                    e.birthDate
                      ? new Date(e.birthDate).toLocaleDateString()
                      : null
                  }
                />
                <Row
                  label="Civil status"
                  value={e.civilStatus ? civilStatusLabel(e.civilStatus) : null}
                />
                <Row
                  label="Added"
                  value={`${new Date(e.createdAt).toLocaleDateString()}${
                    e.createdByName ? ` by ${e.createdByName}` : ""
                  }`}
                />
              </InfoCard>

              <InfoCard
                title="System account"
                description="Controls what they can open when they sign in"
              >
                <Row label="Username" value={staff.username} mono />
                <Row
                  label="Access level"
                  value={
                    <span className="flex flex-col items-end gap-1">
                      <RoleBadge role={staff.role} />
                      <span className="text-xs font-normal text-muted-foreground">
                        {roleAccessLabel(staff.role)}
                      </span>
                    </span>
                  }
                />
                <Row
                  label="Account status"
                  value={
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5",
                        staff.isActive
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-muted-foreground"
                      )}
                    >
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          staff.isActive
                            ? "bg-emerald-500"
                            : "bg-muted-foreground/50"
                        )}
                      />
                      {staff.isActive ? "Active" : "Inactive"}
                    </span>
                  }
                />
              </InfoCard>

              <InfoCard
                title="Government numbers"
                description="Needed before the first payroll run"
              >
                <Row label="TIN" value={e.tinNo} mono />
                <Row label="SSS" value={e.sssNo} mono />
                <Row label="PhilHealth" value={e.philhealthNo} mono />
                <Row label="Pag-IBIG" value={e.pagibigNo} mono />
              </InfoCard>

              {/* Full width: a collapsed panel stretched to match a tall
                  neighbour in the grid reads as a broken empty card. */}
              <Card className="shadow-sm lg:col-span-2">
                <CardContent>
                  <Collapsible
                    open={historyOpen}
                    onOpenChange={setHistoryOpen}
                    className="group/history"
                  >
                    <CollapsibleTrigger className="flex w-full items-center justify-between text-sm font-medium outline-none">
                      <span className="flex items-center gap-2.5">
                        <History className="size-4 text-muted-foreground" />
                        Edit history
                        {editCount > 0 && (
                          <Badge variant="secondary">{editCount}</Badge>
                        )}
                      </span>
                      <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[panel-open]/history:rotate-180" />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-4">
                      {editCount === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No edits have been made yet.
                        </p>
                      ) : (
                        <div className="flex max-h-80 flex-col gap-3 overflow-y-auto pr-1">
                          {staff.employee.editLogs.map((log) => (
                            <div key={log.id} className="flex gap-2.5 text-sm">
                              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-sky-500" />
                              <div>
                                <p>
                                  <span className="font-medium">
                                    {log.editedByName}
                                  </span>{" "}
                                  changed{" "}
                                  <span className="font-medium">
                                    {FIELD_LABELS[log.field] ?? log.field}
                                  </span>{" "}
                                  from{" "}
                                  <Badge variant="outline">
                                    {formatFieldValue(log.field, log.oldValue)}
                                  </Badge>{" "}
                                  to{" "}
                                  <Badge variant="outline">
                                    {formatFieldValue(log.field, log.newValue)}
                                  </Badge>
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {new Date(log.createdAt).toLocaleString()}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CollapsibleContent>
                  </Collapsible>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="attendance" className="pt-4">
          {/* Only fetched — and only downloaded — once someone opens the tab. */}
          {activeTab === "attendance" && (
            <StaffAttendance employeeId={e.id} firstName={e.firstName} />
          )}
        </TabsContent>

        <TabsContent value="payroll" className="pt-4">
          <ComingSoon
            icon={Wallet}
            title="Payroll records aren't tracked yet"
            description={`Once the Payroll feature is built, ${e.firstName}'s pay history will show up here.`}
          />
        </TabsContent>

        <TabsContent value="reimbursements" className="pt-4">
          {/* Only fetched — and only downloaded — once someone opens the tab. */}
          {activeTab === "reimbursements" && (
            <StaffReimbursements employeeId={e.id} firstName={e.firstName} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
