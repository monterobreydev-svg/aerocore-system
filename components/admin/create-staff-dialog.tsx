"use client"

import { Fragment, useActionState, useEffect, useRef, useState } from "react"
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Plus,
  UserRoundPlus,
} from "lucide-react"
import { createStaffAccount, type StaffState } from "@/app/actions/staff"
import type { Role } from "@/app/generated/prisma/client"
import { assignableRoles, roleAccessLabel, roleLabel } from "@/lib/roles"
import {
  CIVIL_STATUS_OPTIONS,
  EMPLOYMENT_TYPE_OPTIONS,
  MONTHLY_RATE_BASIS,
  civilStatusLabel,
  employmentTypeLabel,
  monthlyFromHourly,
  suggestUsername,
} from "@/lib/employee"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
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
import { SkillsPicker } from "@/components/admin/skills-picker"

const STEPS = [
  { id: 1, label: "Personal" },
  { id: 2, label: "Employment" },
  { id: 3, label: "Compensation" },
  { id: 4, label: "Account" },
  { id: 5, label: "Review" },
] as const

// Maps each server-validated field to the step where it's collected, so a
// failed submission can jump the user back to the right step instead of
// leaving them stranded on the Review step with no visible error.
const FIELD_STEP: Record<string, number> = {
  firstName: 1,
  lastName: 1,
  middleName: 1,
  birthDate: 1,
  civilStatus: 1,
  phoneNo: 1,
  email: 1,
  address: 1,
  emergencyContactPerson: 1,
  emergencyContactNo: 1,
  emergencyContactRelationship: 1,
  employeeNo: 2,
  position: 2,
  employmentType: 2,
  dateHired: 2,
  skills: 2,
  hourlyRate: 3,
  tinNo: 3,
  sssNo: 3,
  philhealthNo: 3,
  pagibigNo: 3,
  username: 4,
  password: 4,
  role: 4,
}

// Required fields checked (via native reportValidity) before advancing past
// the step that collects them — inputs on hidden steps are excluded from
// constraint validation by the browser, so this is the only gate that runs.
const REQUIRED_FIELDS_BY_STEP: Record<number, string[]> = {
  1: ["firstName", "lastName"],
  2: ["position"],
  3: ["hourlyRate"],
  4: ["username", "password"],
}

function Req() {
  return (
    <span className="text-destructive" title="Required">
      *
    </span>
  )
}

// Plain text section label — no icon chips, so a step reads as one simple
// form rather than a stack of competing coloured headers.
function StepSection({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <p className="text-sm font-medium">{title}</p>
        {hint && (
          <span className="text-xs text-muted-foreground">{hint}</span>
        )}
      </div>
      {children}
    </div>
  )
}

function formatReviewValue(field: string, value: string) {
  if (!value) return "—"
  if (field === "password") return "•".repeat(Math.min(value.length, 10))
  if (field === "hourlyRate") {
    const amount = Number(value)
    return Number.isNaN(amount)
      ? "—"
      : amount.toLocaleString("en-US", { style: "currency", currency: "PHP" })
  }
  if (field === "birthDate" || field === "dateHired") {
    return new Date(value).toLocaleDateString()
  }
  if (field === "civilStatus") {
    return civilStatusLabel(value as Parameters<typeof civilStatusLabel>[0])
  }
  if (field === "employmentType") {
    return employmentTypeLabel(
      value as Parameters<typeof employmentTypeLabel>[0]
    )
  }
  if (field === "role") return roleLabel(value as Role)
  return value
}

const REVIEW_SECTIONS = [
  {
    title: "Personal",
    fields: [
      ["firstName", "First name"],
      ["middleName", "Middle name"],
      ["lastName", "Last name"],
      ["birthDate", "Date of birth"],
      ["civilStatus", "Civil status"],
      ["phoneNo", "Mobile number"],
      ["email", "Personal email"],
      ["address", "Home address"],
    ],
  },
  {
    title: "Emergency contact",
    fields: [
      ["emergencyContactPerson", "Contact name"],
      ["emergencyContactNo", "Contact number"],
      ["emergencyContactRelationship", "Relationship"],
    ],
  },
  {
    title: "Employment",
    fields: [
      ["employeeNo", "Employee ID"],
      ["position", "Position"],
      ["employmentType", "Employment type"],
      ["dateHired", "Date hired"],
      ["skills", "Skills"],
    ],
  },
  {
    title: "Compensation",
    fields: [
      ["hourlyRate", "Hourly rate"],
      ["monthlyRate", "Projected monthly"],
    ],
  },
  {
    title: "Account access",
    fields: [
      ["username", "Username"],
      ["password", "Password"],
      ["role", "Role"],
    ],
  },
] as const

const GOV_FIELDS = ["tinNo", "sssNo", "philhealthNo", "pagibigNo"] as const

export function CreateStaffDialog({
  currentRole,
  suggestedEmployeeNo,
}: {
  currentRole: Role
  suggestedEmployeeNo: string
}) {
  const [open, setOpen] = useState(false)
  const roleOptions = assignableRoles(currentRole)
  const canChooseRole = roleOptions.length > 1
  const [showPassword, setShowPassword] = useState(false)
  const [step, setStep] = useState(1)
  const [review, setReview] = useState<Record<string, string>>({})
  const formRef = useRef<HTMLFormElement>(null)
  // Hourly rate is controlled so the monthly projection can track it live.
  const [hourlyRate, setHourlyRate] = useState("")
  // Controlled rather than defaultValue: creating an employee revalidates the
  // page, which hands down a new suggestion while this dialog is still
  // mounted — and swapping defaultValue underneath an uncontrolled field is
  // exactly what Base UI warns about. Re-seeded each time the dialog opens.
  const [employeeNo, setEmployeeNo] = useState(suggestedEmployeeNo)
  // Username is derived from the name until someone types their own, at
  // which point we stop overwriting whatever they entered.
  const [username, setUsername] = useState("")
  const [usernameEdited, setUsernameEdited] = useState(false)
  const [role, setRole] = useState<string>("EMPLOYEE")
  const [state, action, pending] = useActionState<StaffState, FormData>(
    createStaffAccount,
    undefined
  )

  useEffect(() => {
    if (state?.success) {
      setOpen(false)
      return
    }
    if (state?.errors) {
      const erroredFields = Object.keys(state.errors)
      if (erroredFields.length > 0) {
        setStep(
          Math.min(...erroredFields.map((field) => FIELD_STEP[field] ?? 1))
        )
      }
    }
  }, [state])

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      setStep(1)
      setReview({})
      setHourlyRate("")
      setEmployeeNo(suggestedEmployeeNo)
      setUsername("")
      setUsernameEdited(false)
      setRole("EMPLOYEE")
    }
  }

  function goToStep(target: number) {
    const form = formRef.current ? new FormData(formRef.current) : null
    const data = form
      ? (Object.fromEntries(form.entries()) as Record<string, string>)
      : {}
    // fromEntries keeps only the last value per key, which would reduce the
    // skills checkboxes to whichever one happened to be ticked last.
    if (form) data.skills = form.getAll("skills").join(", ")

    // Fill the username in as they arrive at the account step, not earlier —
    // by then the name is entered, and it's still theirs to overwrite.
    if (target === 4 && !usernameEdited) {
      setUsername(suggestUsername(data.firstName ?? "", data.lastName ?? ""))
    }
    if (target === 5) {
      const monthly = Number(data.hourlyRate)
      setReview({
        ...data,
        monthlyRate: Number.isFinite(monthly)
          ? String(monthlyFromHourly(monthly))
          : "",
      })
    }
    setStep(target)
  }

  function handleContinue() {
    for (const id of REQUIRED_FIELDS_BY_STEP[step] ?? []) {
      const el = document.getElementById(id) as HTMLInputElement | null
      if (el && !el.reportValidity()) return
    }
    goToStep(Math.min(step + 1, STEPS.length))
  }

  const govProvided = GOV_FIELDS.filter((field) => review[field]).length
  const parsedHourly = Number(hourlyRate)
  const monthlyPreview =
    hourlyRate.trim() !== "" && Number.isFinite(parsedHourly) && parsedHourly >= 0
      ? monthlyFromHourly(parsedHourly)
      : null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button>
            <Plus />
            Add employee
          </Button>
        }
      />
      {/* Header, stepper and footer stay put while only the fields scroll —
          on a phone the whole dialog scrolling means Continue sits below
          every field, so the primary action is never in reach. */}
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-4 overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-sky-600/10">
              <UserRoundPlus className="size-5 text-sky-600 dark:text-sky-400" />
            </div>
            <div>
              <DialogTitle>Add employee</DialogTitle>
              <DialogDescription>
                Creates the personnel record and their login account.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Stepper sits in its own bordered, tinted bar so it reads as
            navigation chrome rather than part of the form below it. */}
        <div className="flex items-center gap-1 overflow-x-auto rounded-xl border bg-muted/40 px-3 py-2.5">
          {STEPS.map((s, idx) => (
            <Fragment key={s.id}>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
                    step === s.id &&
                      "border-sky-600 bg-sky-600 text-white",
                    step > s.id &&
                      "border-sky-600 bg-sky-600/10 text-sky-700 dark:text-sky-400",
                    step < s.id &&
                      "border-border bg-background text-muted-foreground"
                  )}
                >
                  {step > s.id ? <Check className="size-3.5" /> : s.id}
                </span>
                {/* Only the current step keeps its label on a phone —
                    five labels can't fit, and the counter in the footer
                    covers where you are overall. */}
                <span
                  className={cn(
                    "text-sm whitespace-nowrap transition-colors",
                    step === s.id
                      ? "font-medium text-foreground"
                      : "hidden text-muted-foreground sm:inline"
                  )}
                >
                  {s.label}
                </span>
              </div>
              {idx < STEPS.length - 1 && (
                <div
                  className={cn(
                    "mx-1 h-px w-3 shrink-0 sm:mx-1.5 sm:w-6",
                    step > s.id ? "bg-sky-600" : "bg-border"
                  )}
                />
              )}
            </Fragment>
          ))}
        </div>

        <div className="-mx-4 min-h-0 flex-1 overflow-y-auto px-4">
        <form action={action} id="create-staff-form" ref={formRef}>
          {/* Step 1 — Personal */}
          <div className={cn("flex flex-col gap-4", step !== 1 && "hidden")}>
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field data-invalid={!!state?.errors?.firstName}>
                  <FieldLabel htmlFor="firstName">
                    First name <Req />
                  </FieldLabel>
                  <Input
                    id="firstName"
                    name="firstName"
                    placeholder="Jose"
                    disabled={pending}
                    required
                  />
                  <FieldError
                    errors={state?.errors?.firstName?.map((message) => ({
                      message,
                    }))}
                  />
                </Field>
                <Field data-invalid={!!state?.errors?.middleName}>
                  <FieldLabel htmlFor="middleName">Middle name</FieldLabel>
                  <Input
                    id="middleName"
                    name="middleName"
                    placeholder="Ramos"
                    disabled={pending}
                  />
                  <FieldError
                    errors={state?.errors?.middleName?.map((message) => ({
                      message,
                    }))}
                  />
                </Field>
                <Field data-invalid={!!state?.errors?.lastName}>
                  <FieldLabel htmlFor="lastName">
                    Last name <Req />
                  </FieldLabel>
                  <Input
                    id="lastName"
                    name="lastName"
                    placeholder="Dela Cruz"
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

              <div className="grid gap-4 sm:grid-cols-3">
                <Field data-invalid={!!state?.errors?.birthDate}>
                  <FieldLabel htmlFor="birthDate">Date of birth</FieldLabel>
                  <Input
                    id="birthDate"
                    name="birthDate"
                    type="date"
                    disabled={pending}
                  />
                  <FieldError
                    errors={state?.errors?.birthDate?.map((message) => ({
                      message,
                    }))}
                  />
                </Field>
                <Field data-invalid={!!state?.errors?.civilStatus}>
                  <FieldLabel htmlFor="civilStatus">Civil status</FieldLabel>
                  <Select
                    name="civilStatus"
                    disabled={pending}
                    items={Object.fromEntries(
                      CIVIL_STATUS_OPTIONS.map((status) => [
                        status,
                        civilStatusLabel(status),
                      ])
                    )}
                  >
                    <SelectTrigger id="civilStatus" className="w-full">
                      <SelectValue placeholder="Single" />
                    </SelectTrigger>
                    <SelectContent>
                      {CIVIL_STATUS_OPTIONS.map((status) => (
                        <SelectItem key={status} value={status}>
                          {civilStatusLabel(status)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError
                    errors={state?.errors?.civilStatus?.map((message) => ({
                      message,
                    }))}
                  />
                </Field>
                <Field data-invalid={!!state?.errors?.phoneNo}>
                  <FieldLabel htmlFor="phoneNo">Mobile number</FieldLabel>
                  <Input
                    id="phoneNo"
                    name="phoneNo"
                    placeholder="0917 123 4567"
                    disabled={pending}
                  />
                  <FieldError
                    errors={state?.errors?.phoneNo?.map((message) => ({
                      message,
                    }))}
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field data-invalid={!!state?.errors?.email}>
                  <FieldLabel htmlFor="email">Personal email</FieldLabel>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="name@gmail.com"
                    disabled={pending}
                  />
                  <FieldError
                    errors={state?.errors?.email?.map((message) => ({
                      message,
                    }))}
                  />
                </Field>
                <Field data-invalid={!!state?.errors?.address}>
                  <FieldLabel htmlFor="address">Home address</FieldLabel>
                  <Input
                    id="address"
                    name="address"
                    placeholder="Barangay Parian, Calamba, Laguna"
                    disabled={pending}
                  />
                  <FieldError
                    errors={state?.errors?.address?.map((message) => ({
                      message,
                    }))}
                  />
                </Field>
              </div>
            </FieldGroup>

            <Separator />

            <StepSection
              title="Emergency contact"
              hint="— who we call if something happens on site"
            >
              <FieldGroup>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field data-invalid={!!state?.errors?.emergencyContactPerson}>
                    <FieldLabel htmlFor="emergencyContactPerson">
                      Contact name
                    </FieldLabel>
                    <Input
                      id="emergencyContactPerson"
                      name="emergencyContactPerson"
                      placeholder="Marites Dela Cruz"
                      disabled={pending}
                    />
                    <FieldError
                      errors={state?.errors?.emergencyContactPerson?.map(
                        (message) => ({ message })
                      )}
                    />
                  </Field>
                  <Field data-invalid={!!state?.errors?.emergencyContactNo}>
                    <FieldLabel htmlFor="emergencyContactNo">
                      Contact number
                    </FieldLabel>
                    <Input
                      id="emergencyContactNo"
                      name="emergencyContactNo"
                      placeholder="0918 220 3341"
                      disabled={pending}
                    />
                    <FieldError
                      errors={state?.errors?.emergencyContactNo?.map(
                        (message) => ({ message })
                      )}
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
                      disabled={pending}
                    />
                    <FieldError
                      errors={state?.errors?.emergencyContactRelationship?.map(
                        (message) => ({ message })
                      )}
                    />
                  </Field>
                </div>
              </FieldGroup>
            </StepSection>
          </div>

          {/* Step 2 — Employment */}
          <div className={cn("flex flex-col gap-4", step !== 2 && "hidden")}>
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field data-invalid={!!state?.errors?.employeeNo}>
                  <FieldLabel htmlFor="employeeNo">Employee ID</FieldLabel>
                  <Input
                    id="employeeNo"
                    name="employeeNo"
                    value={employeeNo}
                    onChange={(event) => setEmployeeNo(event.target.value)}
                    placeholder="E-0001"
                    disabled={pending}
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    Next free ID — change it if you number differently.
                  </p>
                  <FieldError
                    errors={state?.errors?.employeeNo?.map((message) => ({
                      message,
                    }))}
                  />
                </Field>
                <Field data-invalid={!!state?.errors?.position}>
                  <FieldLabel htmlFor="position">
                    Position <Req />
                  </FieldLabel>
                  <Input
                    id="position"
                    name="position"
                    placeholder="AC technician"
                    disabled={pending}
                    required
                  />
                  <FieldError
                    errors={state?.errors?.position?.map((message) => ({
                      message,
                    }))}
                  />
                </Field>
                <Field data-invalid={!!state?.errors?.employmentType}>
                  <FieldLabel htmlFor="employmentType">
                    Employment type
                  </FieldLabel>
                  <Select
                    name="employmentType"
                    disabled={pending}
                    items={Object.fromEntries(
                      EMPLOYMENT_TYPE_OPTIONS.map((type) => [
                        type,
                        employmentTypeLabel(type),
                      ])
                    )}
                  >
                    <SelectTrigger id="employmentType" className="w-full">
                      <SelectValue placeholder="Probationary" />
                    </SelectTrigger>
                    <SelectContent>
                      {EMPLOYMENT_TYPE_OPTIONS.map((type) => (
                        <SelectItem key={type} value={type}>
                          {employmentTypeLabel(type)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError
                    errors={state?.errors?.employmentType?.map((message) => ({
                      message,
                    }))}
                  />
                </Field>
                <Field data-invalid={!!state?.errors?.dateHired}>
                  <FieldLabel htmlFor="dateHired">Date hired</FieldLabel>
                  <Input
                    id="dateHired"
                    name="dateHired"
                    type="date"
                    disabled={pending}
                  />
                  <FieldError
                    errors={state?.errors?.dateHired?.map((message) => ({
                      message,
                    }))}
                  />
                </Field>
              </div>
            </FieldGroup>

            <Separator />

            <StepSection title="Skills" hint="— tick everything they can do">
              <Field data-invalid={!!state?.errors?.skills}>
                <SkillsPicker idPrefix="new-staff-skill" disabled={pending} />
                <FieldError
                  errors={state?.errors?.skills?.map((message) => ({
                    message,
                  }))}
                />
              </Field>
            </StepSection>
          </div>

          {/* Step 3 — Compensation */}
          <div className={cn("flex flex-col gap-4", step !== 3 && "hidden")}>
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field data-invalid={!!state?.errors?.hourlyRate}>
                  <FieldLabel htmlFor="hourlyRate">
                    Hourly rate <Req />
                  </FieldLabel>
                  <div className="relative">
                    <span className="absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">
                      ₱
                    </span>
                    <Input
                      id="hourlyRate"
                      name="hourlyRate"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="150.00"
                      value={hourlyRate}
                      onChange={(event) => setHourlyRate(event.target.value)}
                      disabled={pending}
                      required
                      className="pl-6"
                    />
                  </div>
                  <FieldError
                    errors={state?.errors?.hourlyRate?.map((message) => ({
                      message,
                    }))}
                  />
                </Field>

                {/* Projection only — deliberately not stored, so payroll
                    stays the one place a monthly figure is decided. */}
                <Field>
                  <FieldLabel htmlFor="monthlyRate">
                    Projected monthly
                  </FieldLabel>
                  <Input
                    id="monthlyRate"
                    value={
                      monthlyPreview === null
                        ? ""
                        : monthlyPreview.toLocaleString("en-US", {
                            style: "currency",
                            currency: "PHP",
                          })
                    }
                    placeholder="—"
                    readOnly
                    tabIndex={-1}
                    aria-readonly
                    className="bg-muted/50 text-muted-foreground"
                  />
                  <p className="text-xs text-muted-foreground">
                    Estimate at {MONTHLY_RATE_BASIS}. Not saved.
                  </p>
                </Field>

              </div>
            </FieldGroup>

            <Separator />

            <StepSection
              title="Government numbers"
              hint="— can be filled in later, before the first payroll run"
            >
              <div className="rounded-xl border bg-muted/30 p-4">
                <FieldGroup>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field data-invalid={!!state?.errors?.tinNo}>
                      <FieldLabel htmlFor="tinNo">TIN</FieldLabel>
                      <Input
                        id="tinNo"
                        name="tinNo"
                        placeholder="123-456-789-000"
                        disabled={pending}
                        className="bg-background"
                      />
                      <FieldError
                        errors={state?.errors?.tinNo?.map((message) => ({
                          message,
                        }))}
                      />
                    </Field>
                    <Field data-invalid={!!state?.errors?.sssNo}>
                      <FieldLabel htmlFor="sssNo">SSS</FieldLabel>
                      <Input
                        id="sssNo"
                        name="sssNo"
                        placeholder="34-1234567-8"
                        disabled={pending}
                        className="bg-background"
                      />
                      <FieldError
                        errors={state?.errors?.sssNo?.map((message) => ({
                          message,
                        }))}
                      />
                    </Field>
                    <Field data-invalid={!!state?.errors?.philhealthNo}>
                      <FieldLabel htmlFor="philhealthNo">PhilHealth</FieldLabel>
                      <Input
                        id="philhealthNo"
                        name="philhealthNo"
                        placeholder="12-345678901-2"
                        disabled={pending}
                        className="bg-background"
                      />
                      <FieldError
                        errors={state?.errors?.philhealthNo?.map((message) => ({
                          message,
                        }))}
                      />
                    </Field>
                    <Field data-invalid={!!state?.errors?.pagibigNo}>
                      <FieldLabel htmlFor="pagibigNo">Pag-IBIG</FieldLabel>
                      <Input
                        id="pagibigNo"
                        name="pagibigNo"
                        placeholder="1234-5678-9012"
                        disabled={pending}
                        className="bg-background"
                      />
                      <FieldError
                        errors={state?.errors?.pagibigNo?.map((message) => ({
                          message,
                        }))}
                      />
                    </Field>
                  </div>
                </FieldGroup>
              </div>
            </StepSection>
          </div>

          {/* Step 4 — Account access */}
          <div className={cn("flex flex-col gap-4", step !== 4 && "hidden")}>
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field data-invalid={!!state?.errors?.username}>
                  <FieldLabel htmlFor="username">
                    Username <Req />
                  </FieldLabel>
                  <Input
                    id="username"
                    name="username"
                    placeholder="jose.delacruz@aerocoole.ph"
                    autoComplete="off"
                    value={username}
                    onChange={(event) => {
                      setUsername(event.target.value)
                      setUsernameEdited(true)
                    }}
                    disabled={pending}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    {usernameEdited
                      ? "This is what they type to sign in."
                      : "Filled in from their name — edit it if you need to."}
                  </p>
                  <FieldError
                    errors={state?.errors?.username?.map((message) => ({
                      message,
                    }))}
                  />
                </Field>
                <Field data-invalid={!!state?.errors?.password}>
                  <FieldLabel htmlFor="password">
                    Initial password <Req />
                  </FieldLabel>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="At least 8 characters"
                      autoComplete="new-password"
                      disabled={pending}
                      required
                      className="pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      disabled={pending}
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground outline-none hover:text-foreground disabled:pointer-events-none"
                    >
                      {showPassword ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Share it with them in person — they can change it later.
                  </p>
                  <FieldError
                    errors={state?.errors?.password?.map((message) => ({
                      message,
                    }))}
                  />
                </Field>
              </div>

              <Field
                className="sm:max-w-sm"
                data-invalid={!!state?.errors?.role}
              >
                <FieldLabel htmlFor="role">Access level</FieldLabel>
                {canChooseRole ? (
                  <Select
                    name="role"
                    value={role}
                    onValueChange={(value) => setRole(value as string)}
                    disabled={pending}
                    items={Object.fromEntries(
                      roleOptions.map((option) => [option, roleLabel(option)])
                    )}
                  >
                    <SelectTrigger id="role" className="w-full">
                      <SelectValue placeholder="Select an access level" />
                    </SelectTrigger>
                    <SelectContent>
                      {roleOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          <span className="flex flex-col items-start gap-0.5 py-0.5">
                            <span>{roleLabel(option)}</span>
                            <span className="text-xs text-muted-foreground">
                              {roleAccessLabel(option)}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <>
                    <Input
                      id="role"
                      value={roleLabel(roleOptions[0])}
                      disabled
                      readOnly
                      className="text-muted-foreground"
                    />
                    <input type="hidden" name="role" value={roleOptions[0]} />
                  </>
                )}
                <p className="text-xs text-muted-foreground">
                  {roleAccessLabel(
                    (canChooseRole ? role : roleOptions[0]) as Role
                  )}
                </p>
                <FieldError
                  errors={state?.errors?.role?.map((message) => ({
                    message,
                  }))}
                />
              </Field>
            </FieldGroup>
          </div>

          {/* Step 5 — Review */}
          <div className={cn("flex flex-col gap-3", step !== 5 && "hidden")}>
            <div className="grid gap-3 sm:grid-cols-2">
              {REVIEW_SECTIONS.map((section) => (
                <div
                  key={section.title}
                  className="rounded-xl border bg-card p-4"
                >
                  <p className="text-sm font-medium">{section.title}</p>
                  <dl className="mt-3 flex flex-col">
                    {section.fields.map(([field, label]) => (
                      <div
                        key={field}
                        className="flex items-baseline justify-between gap-3 border-b py-1.5 text-sm last:border-b-0"
                      >
                        <dt className="shrink-0 text-muted-foreground">
                          {label}
                        </dt>
                        <dd className="truncate text-right font-medium">
                          {formatReviewValue(field, review[field] ?? "")}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>

            {govProvided < GOV_FIELDS.length && (
              <p className="rounded-lg bg-amber-500/10 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-400">
                {govProvided === 0
                  ? "No government numbers were entered."
                  : `${GOV_FIELDS.length - govProvided} government number${
                      GOV_FIELDS.length - govProvided === 1 ? " is" : "s are"
                    } still blank.`}{" "}
                You can still create the record — they can be added before the
                first payroll run.
              </p>
            )}
          </div>

          {state?.message && (
            <p className="mt-3 text-sm text-destructive">{state.message}</p>
          )}
        </form>
        </div>

        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <span className="font-mono text-xs text-muted-foreground">
            Step {step} of {STEPS.length}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => (step === 1 ? setOpen(false) : goToStep(step - 1))}
              disabled={pending}
            >
              {step === 1 ? (
                "Cancel"
              ) : (
                <>
                  <ChevronLeft />
                  Back
                </>
              )}
            </Button>
            {/* Distinct keys matter: without them React reuses one DOM node
                across the swap, so the click that advances to Review turns
                the very same node into a submit button and the browser's
                default action fires the form before you've reviewed it. */}
            {step < STEPS.length ? (
              <Button
                key="continue"
                type="button"
                onClick={handleContinue}
                disabled={pending}
              >
                Continue
                <ChevronRight />
              </Button>
            ) : (
              <Button
                key="submit"
                type="submit"
                form="create-staff-form"
                disabled={pending}
              >
                <Check />
                {pending ? "Creating..." : "Create employee and account"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
