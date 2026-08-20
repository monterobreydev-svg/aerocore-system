import { getCurrentEmployee } from "@/lib/db/dal"
import { getOverview } from "@/lib/dashboard"
import { cn } from "@/lib/utils"
import { Figure } from "@/components/dashboard/overview/parts"
import { Floor } from "@/components/dashboard/overview/floor"
import { Diary } from "@/components/dashboard/overview/diary"
import { Rail } from "@/components/dashboard/overview/rail"

// ---------------------------------------------------------------------------
// The overview
// ---------------------------------------------------------------------------
//
// The front page of the admin side: the day as it stands, in one screen.
//
// Composed as a document rather than as a board of tiles. There is no card
// anywhere on this page — regions are separated by a hairline or by space, and
// the hierarchy is carried by type size and weight. That is a deliberate
// rejection of the tile grid: a dashboard where every section is a box with its
// own border and shadow gives nine things equal weight, and nothing on a
// working day has equal weight. The floor comes first because it is what
// changes minute to minute; money sits in the margin because it is checked, not
// watched.
//
// Rendered on the server in full. Nothing here is interactive, so nothing here
// needs to be a client component, and the whole page costs one HTML response —
// which on a phone at a client's site is the difference that matters.

// Live figures, read at request time. Without this Next would be free to
// render the day once at build and serve yesterday's floor tomorrow.
export const dynamic = "force-dynamic"

export default async function Page() {
  const { firstName, role } = await getCurrentEmployee()
  const overview = await getOverview(role)
  const { floor, diary } = overview

  const now = new Date()

  const headline = [
    {
      value: floor.onSite,
      label: "On site",
      tone: floor.onSite > 0 ? ("live" as const) : ("quiet" as const),
      note: floor.onSite > 0 ? "still on the clock" : undefined,
    },
    {
      value: floor.done,
      label: "Done for the day",
      tone: "plain" as const,
      note: floor.hoursToday > 0 ? `${floor.hoursToday} h logged` : undefined,
    },
    {
      value: floor.away,
      label: "No punch",
      tone: floor.away > 0 ? ("quiet" as const) : ("plain" as const),
      note: `of ${floor.headcount} on the payroll`,
    },
    {
      value: floor.late,
      label: "Late in",
      tone: floor.late > 0 ? ("warn" as const) : ("quiet" as const),
      note: floor.late > 0 ? "after the first job was due" : undefined,
    },
    {
      value: diary.total,
      label: "Jobs today",
      tone: "plain" as const,
      note:
        diary.unclosed > 0
          ? `${diary.unclosed} still open`
          : diary.total > 0
            ? "all closed"
            : undefined,
    },
  ]

  return (
    <div className="flex flex-col gap-7 lg:gap-9">
      {/* ---- masthead ------------------------------------------------------
          The date is the headline. On a page whose whole subject is "today",
          the day itself is the title, and a greeting would only push the
          figures further down the screen. The name is there because this is
          somebody's desk, not a kiosk — quietly, at the end. */}
      <header>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-[1.375rem] leading-none font-semibold tracking-tight sm:text-2xl">
            {now.toLocaleDateString(undefined, {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </h1>
          <span className="text-sm text-muted-foreground">
            {now.getFullYear()}
          </span>
          {overview.restDay && (
            <span className="rounded-[3px] bg-muted px-1.5 py-0.5 text-[0.625rem] tracking-[0.1em] text-muted-foreground uppercase">
              Rest day
            </span>
          )}
          <span className="ml-auto hidden text-xs text-muted-foreground sm:block">
            {firstName}&apos;s desk
          </span>
        </div>

        {/* The day's five numbers, set as a run rather than as tiles. The
            dividers are the only structure they get. */}
        <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 border-t pt-5 sm:flex sm:flex-wrap sm:gap-y-6">
          {headline.map((item, index) => (
            <div
              key={item.label}
              className={cn(
                "min-w-0",
                index > 0 && "sm:border-l sm:pl-6",
                "sm:pr-6"
              )}
            >
              <Figure
                value={item.value}
                label={item.label}
                tone={item.tone}
                note={item.note}
              />
            </div>
          ))}
        </div>
      </header>

      {/* ---- the body ------------------------------------------------------
          Asymmetric by design: the floor and the diary are read, the margin is
          consulted. The vertical rule between them is the only thing dividing
          the two, and it exists only where there is room for two columns. */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-0 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-8 lg:gap-10 lg:pr-9">
          <Floor floor={floor} today={overview.today} />
          <Diary diary={diary} today={overview.today} />
        </div>

        <aside className="min-w-0 border-t pt-7 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-9">
          <Rail overview={overview} />
        </aside>
      </div>
    </div>
  )
}
