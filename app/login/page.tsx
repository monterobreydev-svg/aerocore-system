"use client"

import { useActionState, useState } from "react"
import Image from "next/image"
import {
  CalendarDays,
  CircleAlert,
  Clock,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Snowflake,
  User,
  Wallet,
} from "lucide-react"
import { login, type LoginState } from "@/app/actions/auth"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"

function LogoMark({ className }: { className?: string }) {
  return (
    <div className={cn("relative size-9 shrink-0", className)}>
      <Image
        src="/logo.png"
        alt="AeroCore"
        fill
        sizes="36px"
        className="object-contain"
      />
    </div>
  )
}

// A single wave tile spans 0-400 units and repeats identically at 400-800,
// so translating the whole 800-wide svg by -50% (=-400) loops seamlessly.
const WAVE_PATH =
  "M0,60 C50,20 150,20 200,60 C250,100 350,100 400,60 C450,20 550,20 600,60 C650,100 750,100 800,60"

function AirflowLines() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg
        viewBox="0 0 800 120"
        preserveAspectRatio="none"
        className="animate-airflow absolute top-[22%] h-16 w-[200%] text-cyan-100"
      >
        <path
          d={WAVE_PATH}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.22"
        />
      </svg>
      <svg
        viewBox="0 0 800 120"
        preserveAspectRatio="none"
        className="animate-airflow-slow absolute top-[52%] h-20 w-[200%] scale-x-[-1] text-sky-200"
      >
        <path
          d={WAVE_PATH}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.16"
        />
      </svg>
      <svg
        viewBox="0 0 800 120"
        preserveAspectRatio="none"
        className="animate-airflow absolute top-[76%] h-14 w-[200%] text-white"
        style={{ animationDuration: "21s" }}
      >
        <path
          d={WAVE_PATH}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.12"
        />
      </svg>
    </div>
  )
}

const FEATURES = [
  { label: "Scheduling", icon: CalendarDays },
  { label: "Attendance", icon: Clock },
  { label: "Payroll", icon: Wallet },
]

export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    login,
    undefined
  )
  const [showPassword, setShowPassword] = useState(false)

  return (
    <div className="relative flex min-h-svh flex-1 items-center justify-center overflow-hidden lg:justify-end lg:px-24">
      <div className="absolute inset-0 overflow-hidden">
        <Image
          src="/office.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="animate-kenburns object-cover"
        />
      </div>

      {/* Cool-toned color grade instead of a neutral black scrim, so the
          photo stays the hero while everything reads "cold" */}
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950/80 via-blue-950/55 to-cyan-950/15" />
      <div className="absolute inset-0 bg-gradient-to-t from-blue-950/55 via-transparent to-cyan-950/10" />

      {/* Frosted corners, like condensation creeping in on a cold window */}
      <div className="pointer-events-none absolute -top-32 -left-32 size-96 rounded-full bg-cyan-100/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 -bottom-32 size-[28rem] rounded-full bg-sky-200/10 blur-3xl" />

      <AirflowLines />

      {/* Soft floating glow accents for depth */}
      <div className="animate-float pointer-events-none absolute -top-24 right-[8%] size-72 rounded-full bg-cyan-400/20 blur-3xl" />
      <div
        className="animate-float pointer-events-none absolute bottom-0 left-[12%] size-96 rounded-full bg-sky-500/10 blur-3xl"
        style={{ animationDelay: "2.5s" }}
      />

      <div
        className="animate-in fade-in slide-in-from-top-3 absolute top-8 left-8 flex items-center gap-2.5 text-lg font-semibold text-white duration-700 sm:top-10 sm:left-10"
        style={{ animationFillMode: "backwards" }}
      >
        <LogoMark />
        AeroCoole
      </div>

      <div className="relative hidden max-w-lg flex-col gap-4 text-white lg:mr-auto lg:ml-16 lg:flex">
        <span
          className="animate-in fade-in slide-in-from-left-6 inline-flex items-center gap-2 text-sm font-medium tracking-widest text-cyan-200 uppercase duration-700"
          style={{ animationFillMode: "backwards" }}
        >
          <Snowflake className="size-4" />
          Employee portal
        </span>
        <h1
          className="animate-in fade-in slide-in-from-left-6 text-5xl leading-tight font-bold text-balance duration-700"
          style={{ animationDelay: "100ms", animationFillMode: "backwards" }}
        >
          Keep every job{" "}
          <span className="bg-gradient-to-r from-cyan-200 via-sky-300 to-blue-300 bg-clip-text text-transparent">
            cool, calm,
          </span>{" "}
          and on schedule.
        </h1>
        <p
          className="animate-in fade-in slide-in-from-left-6 max-w-md text-white/70 duration-700"
          style={{ animationDelay: "200ms", animationFillMode: "backwards" }}
        >
          Sign in to coordinate team schedule, track attendance, and view
          payroll across AeroCoole network.
        </p>

        <div
          className="animate-in fade-in slide-in-from-left-6 mt-1 flex flex-wrap gap-2 duration-700"
          style={{ animationDelay: "320ms", animationFillMode: "backwards" }}
        >
          {FEATURES.map((feature) => (
            <span
              key={feature.label}
              className="inline-flex items-center gap-1.5 rounded-full border border-cyan-100/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/80 backdrop-blur-sm"
            >
              <feature.icon className="size-3.5 text-cyan-300" />
              {feature.label}
            </span>
          ))}
        </div>
      </div>

      <div
        className="animate-in fade-in zoom-in-95 relative w-full max-w-md p-6 duration-500 sm:p-10 lg:w-[26rem] lg:p-0"
        style={{ animationDelay: "150ms", animationFillMode: "backwards" }}
      >
        <div className="animate-frost-glow relative overflow-hidden rounded-2xl border border-cyan-100/15 bg-white/[0.07] p-9 backdrop-blur-2xl">
          {/* Subtle condensation-droplet texture on the glass */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
              backgroundSize: "16px 16px",
            }}
          />

          <div className="relative mb-6 space-y-1">
            <h2 className="text-xl font-semibold text-white">Sign in</h2>
            <p className="text-sm text-white/60">
              Enter your credentials to access your dashboard.
            </p>
          </div>

          <form action={action} className="relative">
            <FieldGroup>
              <Field data-invalid={!!state?.errors?.username}>
                <FieldLabel htmlFor="username" className="text-white/80">
                  Username
                </FieldLabel>
                <div className="group relative">
                  <User className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-white/40 transition-colors group-focus-within:text-cyan-300" />
                  <Input
                    id="username"
                    name="username"
                    autoComplete="username"
                    placeholder="e.g. juan.delacruz"
                    aria-invalid={!!state?.errors?.username}
                    disabled={pending}
                    required
                    className="border-white/15 bg-white/5 pl-8 text-white transition-all placeholder:text-white/30 focus-visible:border-cyan-300/60 focus-visible:bg-white/[0.09] focus-visible:ring-cyan-300/30"
                  />
                </div>
                <FieldError
                  errors={state?.errors?.username?.map((message) => ({
                    message,
                  }))}
                />
              </Field>

              <Field data-invalid={!!state?.errors?.password}>
                <FieldLabel htmlFor="password" className="text-white/80">
                  Password
                </FieldLabel>
                <div className="group relative">
                  <Lock className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-white/40 transition-colors group-focus-within:text-cyan-300" />
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    aria-invalid={!!state?.errors?.password}
                    disabled={pending}
                    required
                    className="border-white/15 bg-white/5 pr-9 pl-8 text-white transition-all placeholder:text-white/30 focus-visible:border-cyan-300/60 focus-visible:bg-white/[0.09] focus-visible:ring-cyan-300/30"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    disabled={pending}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    className="absolute top-1/2 right-2.5 -translate-y-1/2 text-white/40 outline-none transition-colors hover:text-white/70 focus-visible:text-white/70 disabled:pointer-events-none"
                  >
                    {showPassword ? (
                      <EyeOff
                        key="hide"
                        className="animate-in fade-in zoom-in-50 size-4 duration-150"
                      />
                    ) : (
                      <Eye
                        key="show"
                        className="animate-in fade-in zoom-in-50 size-4 duration-150"
                      />
                    )}
                  </button>
                </div>
                <FieldError
                  errors={state?.errors?.password?.map((message) => ({
                    message,
                  }))}
                />
              </Field>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="remember"
                  name="remember"
                  disabled={pending}
                  className="border-white/30 data-checked:border-cyan-400 data-checked:bg-cyan-500"
                />
                <FieldLabel
                  htmlFor="remember"
                  className="text-sm font-normal text-white/70"
                >
                  Remember me
                </FieldLabel>
              </div>

              {state?.message && (
                <div
                  key={state.message}
                  role="alert"
                  className="animate-in fade-in slide-in-from-top-1 flex items-start gap-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-200 duration-300"
                >
                  <CircleAlert className="mt-0.5 size-4 shrink-0" />
                  <span>{state.message}</span>
                </div>
              )}

              <Button
                type="submit"
                disabled={pending}
                className="w-full border-0 bg-gradient-to-r from-cyan-400 via-sky-500 to-blue-600 text-white shadow-lg shadow-blue-950/40 transition-all duration-200 hover:from-cyan-300 hover:via-sky-400 hover:to-blue-500 hover:shadow-cyan-900/50 active:scale-[0.98]"
              >
                {pending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign in"
                )}
              </Button>
            </FieldGroup>
          </form>

          <p className="relative mt-6 text-center text-xs text-white/40">
            Trouble signing in? Contact your IT Support.
          </p>
        </div>
      </div>
    </div>
  )
}
