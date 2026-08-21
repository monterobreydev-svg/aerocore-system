"use client"

import { useActionState, useState } from "react"
import {
  BadgeCheck,
  Bell,
  Briefcase,
  CheckCircle2,
  IdCard,
  KeyRound,
  Lock,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  UserRound,
} from "lucide-react"
import {
  changePassword,
  updateProfile,
  type PasswordState,
  type ProfileState,
} from "@/app/actions/profile"
import type { AccountSettings as AccountSettingsData } from "@/lib/db/dal"
import { canEditOwnIdentity, roleAccessLabel } from "@/lib/auth/roles"
import {
  CIVIL_STATUS_OPTIONS,
  civilStatusLabel,
  employmentTypeLabel,
  monthlyFromHourly,
  pesoRate,
  MONTHLY_RATE_BASIS,
} from "@/lib/employee"
import { cn } from "@/lib/utils"
import { formatDate, formatDateTime } from "@/lib/format-date"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PhoneInput } from "@/components/ui/phone-input"
import { ConstrainedInput } from "@/components/ui/constrained-input"
import { sanitizeGovId } from "@/lib/employee"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Card,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RoleBadge } from "@/components/admin/role-badge"
import { PushToggle } from "@/components/dashboard/push-toggle"
import { UsernameForm } from "@/components/dashboard/username-form"

function initials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase()
}

function peso(amount: number) {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "PHP",
  })
}

const TABS = [
  { value: "profile", label: "Profile", icon: UserRound },
  { value: "employment", label: "Employment", icon: Briefcase },
  { value: "security", label: "Security", icon: ShieldCheck },
] as const

// Matches the compact card used on the staff and client detail views —
// size="sm" tightens --card-spacing so a screen of fields reads as one
// block rather than a column of roomy boxes.
function SectionCard({
  title,
  description,
  icon: Icon,
  className,
  children,
}: {
  title: string
  description?: string
  icon: React.ElementType
  className?: string
  children: React.ReactNode
}) {
  return (
    <Card size="sm" className={cn("shadow-sm", className)}>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" />
          {title}
        </CardTitle>
        {description && (
          <CardDescription className="text-xs">{description}</CardDescription>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
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

function ProfileTab({
  account,
  section,
}: {
  account: AccountSettingsData
  section: "admin" | "employee"
}) {
  const editableIdentity = canEditOwnIdentity(account.role)
  const [state, action, pending] = useActionState<ProfileState, FormData>(
    updateProfile,
    undefined
  )
  // Uncontrolled inputs read defaults from this frozen snapshot, not the live
  // prop — a successful save revalidates and pushes fresh data into the still
  // -mounted form, and changing defaultValue on an already-initialised
  // uncontrolled field is what Base UI warns about.
  const [initial] = useState(account.employee)

  return (
    <form action={action}>
      <input type="hidden" name="section" value={section} />

      <div className="grid gap-3 lg:grid-cols-2">
        <SectionCard
          title="Personal"
          description={
            editableIdentity
              ? "Your legal name as it should appear on payroll"
              : "Set by the office — payslips and contributions are filed against it"
          }
          icon={UserRound}
        >
          {/* Read-only for everyone but a Director. Shown rather than hidden:
              somebody checking whether the office has their name right should
              be able to see it without asking, and see who to ask if it's
              wrong. The server ignores these fields regardless of what is
              posted — see canEditOwnIdentity. */}
          {!editableIdentity ? (
            <dl className="flex flex-col">
              <Row label="First name" value={initial.firstName} />
              <Row label="Last name" value={initial.lastName} />
              <Row label="Middle name" value={initial.middleName} />
              <Row
                label="Date of birth"
                value={initial.birthDate ? formatDate(initial.birthDate) : null}
              />
              <Row
                label="Civil status"
                value={
                  initial.civilStatus
                    ? civilStatusLabel(initial.civilStatus)
                    : null
                }
              />
              <p className="pt-2 text-xs text-muted-foreground">
                Ask the office to correct any of these. Your contact details
                below are yours to change.
              </p>
            </dl>
          ) : (
          <FieldGroup className="gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field data-invalid={!!state?.errors?.firstName}>
                <FieldLabel htmlFor="firstName">First name</FieldLabel>
                <Input
                  id="firstName"
                  name="firstName"
                  defaultValue={initial.firstName}
                  disabled={pending}
                  required
                />
                <FieldError
                  errors={state?.errors?.firstName?.map((message) => ({
                    message,
                  }))}
                />
              </Field>
              <Field data-invalid={!!state?.errors?.lastName}>
                <FieldLabel htmlFor="lastName">Last name</FieldLabel>
                <Input
                  id="lastName"
                  name="lastName"
                  defaultValue={initial.lastName}
                  disabled={pending}
                  required
                />
                <FieldError
                  errors={state?.errors?.lastName?.map((message) => ({
                    message,
                  }))}
                />
              </Field>
            </div>

            <Field data-invalid={!!state?.errors?.middleName}>
              <FieldLabel htmlFor="middleName">Middle name</FieldLabel>
              <Input
                id="middleName"
                name="middleName"
                defaultValue={initial.middleName ?? ""}
                disabled={pending}
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field data-invalid={!!state?.errors?.birthDate}>
                <FieldLabel htmlFor="birthDate">Date of birth</FieldLabel>
                <Input
                  id="birthDate"
                  name="birthDate"
                  type="date"
                  defaultValue={initial.birthDate ?? ""}
                  disabled={pending}
                />
              </Field>
              <Field data-invalid={!!state?.errors?.civilStatus}>
                <FieldLabel htmlFor="civilStatus">Civil status</FieldLabel>
                <Select
                  name="civilStatus"
                  defaultValue={initial.civilStatus ?? ""}
                  disabled={pending}
                  items={Object.fromEntries(
                    CIVIL_STATUS_OPTIONS.map((status) => [
                      status,
                      civilStatusLabel(status),
                    ])
                  )}
                >
                  <SelectTrigger id="civilStatus" className="w-full">
                    <SelectValue placeholder="Select civil status" />
                  </SelectTrigger>
                  <SelectContent>
                    {CIVIL_STATUS_OPTIONS.map((status) => (
                      <SelectItem key={status} value={status}>
                        {civilStatusLabel(status)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </FieldGroup>
          )}
        </SectionCard>

        <SectionCard
          title="Contact"
          description="How the office reaches you"
          icon={Phone}
        >
          <FieldGroup className="gap-4">
            <Field data-invalid={!!state?.errors?.phoneNo}>
              <FieldLabel htmlFor="phoneNo">Mobile number</FieldLabel>
              <PhoneInput
                id="phoneNo"
                name="phoneNo"
                placeholder="917 123 4567"
                defaultValue={initial.phoneNo ?? ""}
                disabled={pending}
              />
            </Field>

            <Field data-invalid={!!state?.errors?.email}>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="name@gmail.com"
                defaultValue={initial.email ?? ""}
                disabled={pending}
              />
              <FieldError
                errors={state?.errors?.email?.map((message) => ({ message }))}
              />
            </Field>

            <Field data-invalid={!!state?.errors?.address}>
              <FieldLabel htmlFor="address">Home address</FieldLabel>
              <Input
                id="address"
                name="address"
                placeholder="Barangay Parian, Calamba, Laguna"
                defaultValue={initial.address ?? ""}
                disabled={pending}
              />
            </Field>
          </FieldGroup>
        </SectionCard>

        <SectionCard
          title="Emergency contact"
          description="Who to call if something happens on site"
          icon={MapPin}
        >
          <FieldGroup className="gap-4">
            <Field data-invalid={!!state?.errors?.emergencyContactPerson}>
              <FieldLabel htmlFor="emergencyContactPerson">
                Contact name
              </FieldLabel>
              <Input
                id="emergencyContactPerson"
                name="emergencyContactPerson"
                placeholder="Maria Dela Cruz"
                defaultValue={initial.emergencyContactPerson ?? ""}
                disabled={pending}
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field data-invalid={!!state?.errors?.emergencyContactNo}>
                <FieldLabel htmlFor="emergencyContactNo">
                  Contact number
                </FieldLabel>
                <Input
                  id="emergencyContactNo"
                  name="emergencyContactNo"
                  placeholder="0918 220 3341"
                  inputMode="tel"
                  defaultValue={initial.emergencyContactNo ?? ""}
                  disabled={pending}
                />
              </Field>
              <Field
                data-invalid={!!state?.errors?.emergencyContactRelationship}
              >
                <FieldLabel htmlFor="emergencyContactRelationship">
                  Relationship
                </FieldLabel>
                <Input
                  id="emergencyContactRelationship"
                  name="emergencyContactRelationship"
                  placeholder="Spouse"
                  defaultValue={initial.emergencyContactRelationship ?? ""}
                  disabled={pending}
                />
              </Field>
            </div>
          </FieldGroup>
        </SectionCard>

        <SectionCard
          title="Government numbers"
          description="Needed before your first payroll run"
          icon={IdCard}
        >
          <FieldGroup className="gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field data-invalid={!!state?.errors?.tinNo}>
                <FieldLabel htmlFor="tinNo">TIN</FieldLabel>
                <ConstrainedInput
                  sanitize={sanitizeGovId}
                  inputMode="numeric"
                  id="tinNo"
                  name="tinNo"
                  placeholder="123-456-789-000"
                  defaultValue={initial.tinNo ?? ""}
                  disabled={pending}
                  className="font-mono"
                />
              </Field>
              <Field data-invalid={!!state?.errors?.sssNo}>
                <FieldLabel htmlFor="sssNo">SSS</FieldLabel>
                <ConstrainedInput
                  sanitize={sanitizeGovId}
                  inputMode="numeric"
                  id="sssNo"
                  name="sssNo"
                  placeholder="34-1234567-8"
                  defaultValue={initial.sssNo ?? ""}
                  disabled={pending}
                  className="font-mono"
                />
              </Field>
              <Field data-invalid={!!state?.errors?.philhealthNo}>
                <FieldLabel htmlFor="philhealthNo">PhilHealth</FieldLabel>
                <ConstrainedInput
                  sanitize={sanitizeGovId}
                  inputMode="numeric"
                  id="philhealthNo"
                  name="philhealthNo"
                  placeholder="12-345678901-2"
                  defaultValue={initial.philhealthNo ?? ""}
                  disabled={pending}
                  className="font-mono"
                />
              </Field>
              <Field data-invalid={!!state?.errors?.pagibigNo}>
                <FieldLabel htmlFor="pagibigNo">Pag-IBIG</FieldLabel>
                <ConstrainedInput
                  sanitize={sanitizeGovId}
                  inputMode="numeric"
                  id="pagibigNo"
                  name="pagibigNo"
                  placeholder="1234-5678-9012"
                  defaultValue={initial.pagibigNo ?? ""}
                  disabled={pending}
                  className="font-mono"
                />
              </Field>
            </div>
          </FieldGroup>
        </SectionCard>
      </div>

      {/* Sticky so the save button stays reachable however far down the
          four cards someone has scrolled. */}
      <div className="sticky bottom-0 z-10 mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/85 px-4 py-3 backdrop-blur">
        <p className="text-xs text-muted-foreground">
          {state?.success && state.message ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="size-3.5" />
              {state.message}
            </span>
          ) : state?.message ? (
            <span className="text-destructive">{state.message}</span>
          ) : (
            "Changes are recorded in your edit history."
          )}
        </p>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </form>
  )
}

function EmploymentTab({ account }: { account: AccountSettingsData }) {
  const e = account.employee

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-400">
        <Lock className="mt-0.5 size-3.5 shrink-0" />
        <span>
          These are set by HR and can&apos;t be edited here. Ask a Director if
          something looks wrong.
        </span>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <SectionCard title="Position" icon={Briefcase}>
          <dl className="flex flex-col">
            <Row label="Employee ID" value={e.employeeNo} mono />
            <Row label="Position" value={e.position} />
            <Row
              label="Employment type"
              value={e.employmentType ? employmentTypeLabel(e.employmentType) : null}
            />
            <Row
              label="Date hired"
              value={e.dateHired ? formatDate(e.dateHired) : null}
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
          </dl>
        </SectionCard>

        <SectionCard
          title="Compensation"
          description={`Monthly is an estimate at ${MONTHLY_RATE_BASIS} — it isn't stored`}
          icon={BadgeCheck}
        >
          <dl className="flex flex-col">
            <Row label="Hourly rate" value={pesoRate(e.hourlyRate)} />
            <Row
              label="Projected monthly"
              value={peso(monthlyFromHourly(e.hourlyRate))}
            />
            <Row
              label="Record created"
              value={formatDate(e.createdAt)}
            />
          </dl>
        </SectionCard>
      </div>
    </div>
  )
}

function SecurityTab({
  account,
  section,
  vapidPublicKey,
}: {
  account: AccountSettingsData
  section: "admin" | "employee"
  /** Null when push isn't configured on this deployment. */
  vapidPublicKey: string | null
}) {
  const [state, action, pending] = useActionState<PasswordState, FormData>(
    changePassword,
    undefined
  )
  // Uncontrolled password inputs can't be cleared after a save, so the form
  // is swapped for a confirmation panel and remounted under a fresh key when
  // someone chooses to change it again. Comparing against the acknowledged
  // state object (each action call returns a new one) keeps this working for
  // a second and third change, not just the first.
  const [acknowledged, setAcknowledged] = useState<PasswordState>(undefined)
  const [formKey, setFormKey] = useState(0)
  const justChanged = !!state?.success && state !== acknowledged

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {/* Beside the password rather than in its own tab: both are things you
          set once per device or per account and then forget about. */}
      <SectionCard
        title="Notifications"
        description="Alerts on this device, even when the app is closed"
        icon={Bell}
      >
        {vapidPublicKey ? (
          <PushToggle publicKey={vapidPublicKey} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Browser notifications aren&apos;t set up on this server yet.
          </p>
        )}
      </SectionCard>

      <SectionCard
        title="Password"
        description="Used together with your username to sign in"
        icon={KeyRound}
      >
        {justChanged ? (
          <div className="flex flex-col items-start gap-3 py-2">
            <span className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="size-4" />
              Password updated
            </span>
            <p className="text-xs text-muted-foreground">
              Your next sign-in will use the new password. You&apos;re still
              signed in here.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setAcknowledged(state)
                setFormKey((key) => key + 1)
              }}
            >
              Change it again
            </Button>
          </div>
        ) : (
          <form action={action} key={formKey}>
            <input type="hidden" name="section" value={section} />
            <FieldGroup className="gap-4">
              <Field data-invalid={!!state?.errors?.currentPassword}>
                <FieldLabel htmlFor="currentPassword">
                  Current password
                </FieldLabel>
                <Input
                  id="currentPassword"
                  name="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  disabled={pending}
                  required
                />
                <FieldError
                  errors={state?.errors?.currentPassword?.map((message) => ({
                    message,
                  }))}
                />
              </Field>

              <Field data-invalid={!!state?.errors?.newPassword}>
                <FieldLabel htmlFor="newPassword">New password</FieldLabel>
                <Input
                  id="newPassword"
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  disabled={pending}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  At least 8 characters.
                </p>
                <FieldError
                  errors={state?.errors?.newPassword?.map((message) => ({
                    message,
                  }))}
                />
              </Field>

              <Field data-invalid={!!state?.errors?.confirmPassword}>
                <FieldLabel htmlFor="confirmPassword">
                  Confirm new password
                </FieldLabel>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  disabled={pending}
                  required
                />
                <FieldError
                  errors={state?.errors?.confirmPassword?.map((message) => ({
                    message,
                  }))}
                />
              </Field>

              {state?.message && !state.success && (
                <p className="text-sm text-destructive">{state.message}</p>
              )}

              <Button type="submit" disabled={pending} className="w-fit">
                {pending ? "Updating..." : "Update password"}
              </Button>
            </FieldGroup>
          </form>
        )}
      </SectionCard>

      <SectionCard
        title="Sign-in account"
        description="Your username is yours; the rest is set by a Director"
        icon={ShieldCheck}
      >
        <dl className="flex flex-col">
          <div className="border-b py-1 last:border-b-0">
            <dt className="text-xs text-muted-foreground">Username</dt>
            <dd>
              <UsernameForm username={account.username} section={section} />
            </dd>
          </div>
          <Row
            label="Access level"
            value={
              <span className="flex flex-col items-end gap-1">
                <RoleBadge role={account.role} />
                <span className="text-xs font-normal text-muted-foreground">
                  {roleAccessLabel(account.role)}
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
                  account.isActive
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-muted-foreground"
                )}
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    account.isActive
                      ? "bg-emerald-500"
                      : "bg-muted-foreground/50"
                  )}
                />
                {account.isActive ? "Active" : "Inactive"}
              </span>
            }
          />
          <Row
            label="Last sign-in"
            value={
              account.lastLoginAt
                ? formatDateTime(account.lastLoginAt)
                : null
            }
          />
        </dl>
      </SectionCard>
    </div>
  )
}

export function AccountSettings({
  account,
  section,
  defaultTab = "profile",
  vapidPublicKey = null,
}: {
  account: AccountSettingsData
  section: "admin" | "employee"
  defaultTab?: string
  /** The server's push key, or null when push isn't configured. */
  vapidPublicKey?: string | null
}) {
  const [activeTab, setActiveTab] = useState<string>(defaultTab)
  const e = account.employee
  const fullName = [e.firstName, e.middleName, e.lastName]
    .filter(Boolean)
    .join(" ")

  return (
    <div className="flex flex-col gap-5">
      {/* Plain header rather than a card — the page should open with who you
          are, not with another box to parse. */}
      <div className="flex min-w-0 items-start gap-3">
        <Avatar className="size-12 rounded-xl">
          <AvatarFallback className="rounded-xl bg-sky-600/10 text-sky-700 dark:text-sky-400">
            {initials(e.firstName, e.lastName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl leading-tight font-semibold">{fullName}</h2>
            <RoleBadge role={account.role} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {e.position}
            {e.employmentType && ` · ${employmentTypeLabel(e.employmentType)}`}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 font-mono text-xs text-muted-foreground">
            <span>@{account.username}</span>
            {e.employeeNo && <span>{e.employeeNo}</span>}
            {e.email && (
              <span className="inline-flex items-center gap-1">
                <Mail className="size-3" />
                {e.email}
              </span>
            )}
          </p>
        </div>
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
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="profile" className="pt-4">
          <ProfileTab account={account} section={section} />
        </TabsContent>

        <TabsContent value="employment" className="pt-4">
          <EmploymentTab account={account} />
        </TabsContent>

        <TabsContent value="security" className="pt-4">
          <SecurityTab
            account={account}
            section={section}
            vapidPublicKey={vapidPublicKey}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
