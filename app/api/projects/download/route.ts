import type { NextRequest } from "next/server"

import { verifySession } from "@/lib/auth"
import { roleLabel } from "@/lib/auth/roles"
import { getCurrentEmployee } from "@/lib/db/dal"
import { xlsxStream } from "@/lib/formats/xlsx"
import { buildProjectsReport } from "@/lib/projects/report"
import {
  projectsReportFileName,
  projectsReportPdf,
} from "@/lib/projects/projects-pdf"
import {
  projectsWorkbook,
  projectsWorkbookFileName,
} from "@/lib/projects/projects-xlsx"

// The project book for a year, in whichever of the two shapes was asked for.
//
// A route rather than a server action because the answer is a file: the browser
// navigates, gets an attachment, and files it in its own downloads list.
//
// Both formats are built from one buildProjectsReport() — the same figures, so
// the document and the workbook can never disagree with each other or with the
// tracker they were exported from.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Projects are the Director's book — the same rule the page and actions use. */
async function requireDirector() {
  const session = await verifySession()
  return session.role === "DIRECTOR" ? session : null
}

function parseYear(value: string | null) {
  const year = Number(value)
  const thisYear = new Date().getFullYear()
  // Any plausible year, not just one with projects in it: the picker steps a
  // year at a time and a download that silently landed on a different year
  // than the screen would be quoted as if it were the one asked for.
  return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : thisYear
}

/** A "YYYY-MM-DD" off the query string, or nothing. */
function parseDay(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined
}

export async function GET(request: NextRequest) {
  const session = await requireDirector()
  if (!session) return new Response("Not allowed.", { status: 403 })

  const params = request.nextUrl.searchParams
  const format = params.get("format") === "xlsx" ? "xlsx" : "pdf"

  // The same four the tracker filters by, so what downloads is what was on
  // screen. The parameter names match the page's own, which is what lets the
  // link be built by copying them straight across.
  const report = await buildProjectsReport({
    year: parseYear(params.get("year")),
    from: parseDay(params.get("from")),
    to: parseDay(params.get("to")),
    clientId: params.get("c") || undefined,
    query: params.get("q") || undefined,
  })

  if (format === "xlsx") {
    const name = projectsWorkbookFileName(report)
    return new Response(xlsxStream(projectsWorkbook(report)), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store, private",
      },
    })
  }

  // Whose name goes on it. A report is quoted back weeks later, and "who ran
  // this, and when" is the first thing anybody asks of a figure they disagree
  // with — so it is stamped in the footer of every page.
  const employee = await getCurrentEmployee()
  const pdf = projectsReportPdf(report, {
    generatedBy: `${employee.firstName} ${employee.lastName}`,
    role: roleLabel(session.role),
    generatedAt: new Date(),
  })

  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${projectsReportFileName(report)}"`,
      "Cache-Control": "no-store, private",
    },
  })
}
