import type { NextRequest } from "next/server"

import { verifySession } from "@/lib/auth"
import { buildReport } from "@/lib/reports"
import { reportFileName, reportPdf } from "@/lib/report-pdf"

// The report on screen, as a document — same period, same figures, with the
// working written out in sentences rather than left to the charts.
//
// A route rather than a server action because the answer is a file: the browser
// navigates, gets an attachment, and files it in its own downloads list.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function parseDay(value: string | null, fallback: Date) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback
  const parsed = new Date(`${value}T00:00:00`)
  return Number.isNaN(+parsed) ? fallback : parsed
}

export async function GET(request: NextRequest) {
  const session = await verifySession()
  if (session.role !== "DIRECTOR" && session.role !== "ADMINISTRATOR") {
    return new Response("Not allowed.", { status: 403 })
  }

  const params = request.nextUrl.searchParams
  const today = new Date()
  const from = parseDay(
    params.get("from"),
    new Date(today.getFullYear(), today.getMonth(), 1)
  )
  const to = parseDay(params.get("to"), today)

  const data = await buildReport({ from, to })

  return new Response(reportPdf(data), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${reportFileName(data)}"`,
      "Cache-Control": "no-store, private",
    },
  })
}
