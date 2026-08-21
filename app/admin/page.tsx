import { getCurrentEmployee } from "@/lib/db/dal"
import { getOverview } from "@/lib/dashboard"
import { Masthead } from "@/components/dashboard/overview/masthead"
import { Attention } from "@/components/dashboard/overview/attention"
import { Floor } from "@/components/dashboard/overview/floor"
import { Diary } from "@/components/dashboard/overview/diary"
import { WeekAhead } from "@/components/dashboard/overview/week-ahead"
import { Payroll } from "@/components/dashboard/overview/payroll"
import { Claims, Documents } from "@/components/dashboard/overview/queues"

// ---------------------------------------------------------------------------
// The overview
// ---------------------------------------------------------------------------
//
// The front page of the admin side: the day as it stands, in one screen.
//
// Two columns and a banner. The banner is the day itself and is the only dark
// surface here, tying the page to the navigation rail and giving the eye a
// place to start. The wide column is what gets read — the floor, the diary, the
// week coming — and the narrow one is what gets acted on: the queue of things
// waiting, the money, the paperwork. Reading and doing are different postures
// and they are kept in different columns.
//
// Every panel is one subject with one way in. A panel is not a decorative box:
// it is the boundary that lets somebody skip three sections without reading a
// word of them, which on a phone at a client's site is most of the value the
// page has.
//
// Rendered on the server in full. Nothing here is interactive, so nothing here
// is a client component, and the whole page costs one HTML response.

// Live figures, read at request time. Without this Next would be free to render
// the day once at build and serve yesterday's floor tomorrow.
export const dynamic = "force-dynamic"

export default async function Page() {
  const { firstName, role } = await getCurrentEmployee()
  const overview = await getOverview(role)

  // One `now` for the page. The masthead's date and the "now" line drawn on the
  // floor plot have to be the same instant, and two calls to `new Date()` while
  // a page renders are two slightly different instants.
  const now = new Date()

  return (
    // `viz` scopes the validated chart palette — the ordinal ramp the payroll
    // composition is drawn from, the grid and track greys, and the one hue the
    // floor plot and the week's columns share. Defined in globals.css.
    <div className="viz flex flex-col gap-4 sm:gap-5">
      <Masthead overview={overview} firstName={firstName} now={now} />

      <div className="grid min-w-0 gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
          <Floor floor={overview.floor} today={overview.today} />
          <Diary diary={overview.diary} today={overview.today} />
          <WeekAhead diary={overview.diary} />
        </div>

        {/* The margin. Ordered by what it costs to ignore: the queue first,
            then the money, then the filing. */}
        <aside className="flex min-w-0 flex-col gap-4 sm:gap-5">
          <Attention overview={overview} />
          {overview.payroll && <Payroll payroll={overview.payroll} />}
          {overview.claims && <Claims claims={overview.claims} />}
          <Documents documents={overview.documents} />
        </aside>
      </div>
    </div>
  )
}
