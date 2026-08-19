import type { NextRequest } from "next/server"

import { prisma } from "@/lib/db/prisma"
import { verifySession } from "@/lib/auth"
import { cutoffStart, parseDayParam } from "@/lib/attendance"
import { buildPayslip } from "@/lib/payroll/payslip-query"
import { payslipFileName, payslipPdf } from "@/lib/payroll/payslip-pdf"

// One person's payslip, in full, as a PDF.
//
// The page they came from shows the summary; this is the working behind it —
// every day, the hours it rendered and what each line of the summary is the
// sum of. It is a route rather than a server action because the answer is a
// file: the browser navigates, gets an attachment and files it in its own
// downloads list, which survives leaving the page.
//
// Scoped to the session, always. The employee id is never read from the query
// string — a payslip is the most personal record the system holds, and a URL
// that takes an id is a URL somebody can edit.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const session = await verifySession()

  const day = parseDayParam(
    request.nextUrl.searchParams.get("cutoff") ?? undefined,
    new Date()
  )
  const start = cutoffStart(day)

  // Released, or it does not exist as far as this route is concerned. An open
  // period is the office's working copy and its figures still move.
  const release = await prisma.payrollRelease.findUnique({
    where: { cutoffStart: start },
    select: { releasedAt: true },
  })
  if (!release) {
    return new Response("That payslip hasn't been released yet.", {
      status: 404,
    })
  }

  const record = await buildPayslip(session.employeeId, day)
  if (!record) {
    return new Response("No payslip for that period.", { status: 404 })
  }

  const document = {
    employeeName: record.employeeName,
    employeeNo: record.employeeNo,
    position: record.position,
    cutoffLabel: record.cutoffLabel,
    cutoffStart: record.cutoffStart,
    cutoffEnd: record.cutoffEnd,
    releasedAt: record.releasedAt,
    payslip: record.payslip,
    adjustments: record.adjustments,
  }

  return new Response(payslipPdf(document), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${payslipFileName(document)}"`,
      // Pay is personal and the figures are recomputed on every read; neither
      // is something a shared cache should be holding on to.
      "Cache-Control": "no-store, private",
    },
  })
}
