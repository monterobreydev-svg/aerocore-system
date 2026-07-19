"use client"

import { useActionState, useState } from "react"
import Image from "next/image"
import { CircleAlert, Eye, EyeOff, Lock, User } from "lucide-react"
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

export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    login,
    undefined
  )
  const [showPassword, setShowPassword] = useState(false)

  return (
    <div className="relative flex min-h-svh flex-1 items-center justify-center overflow-hidden lg:justify-end lg:px-24">
      <Image
        src="/office.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/60 to-black/30" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />

      <div className="absolute top-8 left-8 flex items-center gap-2.5 text-lg font-semibold text-white sm:top-10 sm:left-10">
        <LogoMark />
        AeroCore
      </div>

      <div className="relative hidden max-w-lg flex-col gap-4 text-white lg:mr-auto lg:ml-16 lg:flex">
        <span className="text-sm font-medium tracking-widest text-sky-300 uppercase">
          Employee portal
        </span>
        <h1 className="text-5xl leading-tight font-bold text-balance">
          Keep every job{" "}
          <span className="bg-gradient-to-r from-sky-300 to-blue-400 bg-clip-text text-transparent">
            cool, calm,
          </span>{" "}
          and on schedule.
        </h1>
        <p className="max-w-md text-white/70">
          Sign in to coordinate team schedule, track attendance, and view payroll across
          AeroCoole network. 
        </p>
      </div>

      <div className="relative w-full max-w-md p-6 sm:p-10 lg:w-[26rem] lg:p-0">
        <div className="rounded-2xl border border-white/15 bg-white/10 p-9 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <div className="mb-6 space-y-1">
            <h2 className="text-xl font-semibold text-white">Sign in</h2>
            <p className="text-sm text-white/60">
              Enter your credentials to access your dashboard.
            </p>
          </div>

          <form action={action}>
            <FieldGroup>
              <Field data-invalid={!!state?.errors?.username}>
                <FieldLabel htmlFor="username" className="text-white/80">
                  Username
                </FieldLabel>
                <div className="relative">
                  <User className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-white/40" />
                  <Input
                    id="username"
                    name="username"
                    autoComplete="username"
                    placeholder="e.g. juan.delacruz"
                    aria-invalid={!!state?.errors?.username}
                    disabled={pending}
                    required
                    className="border-white/15 bg-white/5 pl-8 text-white placeholder:text-white/30 focus-visible:border-sky-400/60 focus-visible:ring-sky-400/30"
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
                <div className="relative">
                  <Lock className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-white/40" />
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    aria-invalid={!!state?.errors?.password}
                    disabled={pending}
                    required
                    className="border-white/15 bg-white/5 pr-9 pl-8 text-white placeholder:text-white/30 focus-visible:border-sky-400/60 focus-visible:ring-sky-400/30"
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
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
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
                  className="border-white/30 data-checked:border-sky-400 data-checked:bg-sky-500"
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
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-200"
                >
                  <CircleAlert className="mt-0.5 size-4 shrink-0" />
                  <span>{state.message}</span>
                </div>
              )}

              <Button
                type="submit"
                disabled={pending}
                className="w-full border-0 bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-blue-950/40 hover:from-sky-400 hover:to-blue-500"
              >
                {pending ? "Signing in..." : "Sign in"}
              </Button>
            </FieldGroup>
          </form>

          <p className="mt-6 text-center text-xs text-white/40">
            Trouble signing in? Contact your IT Support.
          </p>
        </div>
      </div>
    </div>
  )
}
