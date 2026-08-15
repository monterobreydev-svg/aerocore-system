"use client"

import { useActionState, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import {
  CircleAlert,
  Clock,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  ShieldCheck,
  User,
} from "lucide-react"
import { login, type LoginState } from "@/app/actions/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"

function Wordmark({ className }: { className?: string }) {
  return (
    <span className={className}>
      Aero<span className="text-brand">Coole</span>
    </span>
  )
}

export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    login,
    undefined
  )
  const [showPassword, setShowPassword] = useState(false)

  return (
    // row-reverse mirrors the whole composition in one place: the rail moves to
    // the far right, the photograph with it, and the form takes the left.
    <div className="relative flex min-h-svh flex-col lg:flex-row-reverse">
      {/* -----------------------------------------------------------------
          A narrow signage rail rather than a half-page brand panel. It gives
          the company a permanent edge to the screen while handing almost the
          whole viewport to the photograph — the way an engineering firm signs a
          building rather than papering it.
      ----------------------------------------------------------------- */}
      <aside className="relative hidden w-16 shrink-0 flex-col items-center justify-between bg-sidebar py-7 lg:flex">
        <div className="relative flex size-10 items-center justify-center rounded-xl bg-white/90 ring-1 ring-white/25">
          <Image
            src="/logo.png"
            alt=""
            fill
            sizes="40px"
            className="object-contain p-1"
          />
        </div>

        {/* Reads top-to-bottom now that the spine is on the right, the way a
            book spine does. */}
        <Wordmark className="font-heading text-lg font-semibold tracking-[0.2em] text-sidebar-foreground [writing-mode:vertical-rl]" />

        <span className="h-10 w-px bg-gradient-to-b from-transparent to-brand" />
      </aside>

      <div className="relative flex min-h-svh flex-1 flex-col">
        {/* ---------------------------------------------------------------
            The photograph. A band on a phone, the entire canvas on a desktop —
            in both cases it is the page, not a texture behind a scrim. Only the
            corners it has to carry type in are graded down.
        --------------------------------------------------------------- */}
        <div className="relative h-[42svh] w-full shrink-0 overflow-hidden lg:absolute lg:inset-0 lg:h-full">
          <Image
            src="/office.jpg"
            // Decorative: the page means the same thing without it, and I'd be
            // guessing at what the photograph actually shows.
            alt=""
            fill
            priority
            // A phone gets a phone-sized crop; only a desktop pays for the
            // full-width file it actually fills the screen with.
            sizes="(min-width: 1024px) 100vw, 100vw"
            className="object-cover"
          />

          {/* Just enough navy to tie the photo to the system's palette. */}
          <div
            aria-hidden
            className="absolute inset-0 bg-sidebar/25 mix-blend-multiply"
          />
          {/* Graded only where words sit: the foot of the phone hero, and — now
              that the headline has moved across — the right edge on a desktop. */}
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-sidebar/85 via-sidebar/20 to-sidebar/45 lg:bg-gradient-to-l lg:from-sidebar/85 lg:via-sidebar/25 lg:to-transparent"
          />

          {/* Phones get the mark centred over the photograph — there's no rail
              to carry it, and it's the first thing that should say where you
              are. */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 lg:hidden">
            <div className="relative size-14 rounded-2xl bg-white/90 p-2 ring-1 ring-white/30">
              <Image
                src="/logo.png"
                alt=""
                fill
                sizes="56px"
                className="object-contain p-2"
              />
            </div>
            <Wordmark className="font-heading text-xl font-semibold tracking-tight text-white" />
            <span className="text-[0.6875rem] font-medium tracking-[0.2em] text-white/60 uppercase">
              Operations system
            </span>
          </div>
        </div>

        {/* Editorial line, low and against the rail, where a photograph is
            usually captioned. Set flush right so it reads off the same edge the
            wordmark runs down. */}
        <div className="pointer-events-none absolute right-14 bottom-14 z-10 hidden max-w-sm text-right lg:block">
          <span className="ml-auto block h-px w-10 bg-brand" />
          <h1 className="mt-5 text-4xl leading-[1.15] font-semibold tracking-tight text-balance text-white">
            Every job, every hour, every peso — on one record.
          </h1>
          <p className="mt-3 text-sm text-white/70">
            Scheduling, attendance, reimbursements and payroll for the AeroCoole
            service team.
          </p>
        </div>

        {/* ---------------------------------------------------------------
            The form. On a phone it rises over the photograph as a sheet, the
            way a native app does. On a desktop it floats free of every edge
            instead of filling a half — so the room stays visible around it.
        --------------------------------------------------------------- */}
        <div className="relative z-10 -mt-7 flex flex-1 flex-col rounded-t-3xl bg-background px-6 pt-8 pb-10 shadow-[0_-12px_40px_-12px_oklch(0_0_0/0.25)] sm:px-10 lg:absolute lg:top-1/2 lg:left-[7vw] lg:mt-0 lg:w-[25.5rem] lg:flex-none lg:-translate-y-1/2 lg:rounded-2xl lg:p-10 lg:shadow-2xl lg:ring-1 lg:ring-foreground/10">
          <div className="mx-auto w-full max-w-sm">
            <span className="block h-px w-10 bg-brand" />
            <h2 className="font-heading mt-5 text-2xl font-semibold tracking-tight">
              Sign in
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Use the account the office issued you.
            </p>

            <form action={action} className="mt-7">
              <FieldGroup>
                <Field data-invalid={!!state?.errors?.username}>
                  <FieldLabel htmlFor="username">Username</FieldLabel>
                  <div className="group relative">
                    <User className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-brand" />
                    <Input
                      id="username"
                      name="username"
                      autoComplete="username"
                      placeholder="e.g. juan.delacruz"
                      aria-invalid={!!state?.errors?.username}
                      disabled={pending}
                      autoFocus
                      required
                      className="h-10 pl-8"
                    />
                  </div>
                  <FieldError
                    errors={state?.errors?.username?.map((message) => ({
                      message,
                    }))}
                  />
                </Field>

                <Field data-invalid={!!state?.errors?.password}>
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <div className="group relative">
                    <Lock className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-brand" />
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      aria-invalid={!!state?.errors?.password}
                      disabled={pending}
                      required
                      className="h-10 pr-9 pl-8"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      disabled={pending}
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      aria-pressed={showPassword}
                      className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground disabled:pointer-events-none"
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
                  <Checkbox id="remember" name="remember" disabled={pending} />
                  <FieldLabel
                    htmlFor="remember"
                    className="text-sm font-normal text-muted-foreground"
                  >
                    Keep me signed in on this device
                  </FieldLabel>
                </div>

                {state?.message && (
                  <div
                    key={state.message}
                    role="alert"
                    className="animate-in fade-in slide-in-from-top-1 flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive duration-200"
                  >
                    <CircleAlert className="mt-0.5 size-4 shrink-0" />
                    <span>{state.message}</span>
                  </div>
                )}

                <Button
                  type="submit"
                  size="lg"
                  disabled={pending}
                  className="h-11 w-full bg-brand text-brand-foreground hover:bg-brand-strong lg:h-10"
                >
                  {pending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Signing in…
                    </>
                  ) : (
                    "Sign in"
                  )}
                </Button>
              </FieldGroup>
            </form>

            {/* Most of the crew never signs in — they punch on the shared
                phone. Anyone who lands here from an old link or bookmark
                needs a way back to the clock that doesn't involve knowing
                the address. */}
            <Link
              href="/"
              className="mt-6 flex items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              <Clock className="size-4" />
              Time in or out without signing in
            </Link>

            <div className="mt-5 flex items-start gap-2 border-t pt-5 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
              <p>
                Company system — activity is recorded against your account.
                Locked out? Contact IT support.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
