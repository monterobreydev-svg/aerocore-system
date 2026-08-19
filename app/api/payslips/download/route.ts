import type { NextRequest } from "next/server"

import { prisma } from "@/lib/db/prisma"
import { verifySession } from "@/lib/auth"
import { cutoffStart, parseDayParam } from "@/lib/attendance"
import { buildPayslip } from "@/lib/payroll/payslip-query"
import { payslipResponse } from "@/lib/payroll/payslip-pdf"

// The employee's own payslip, as a PDF.
//
// The same document the office downloads from /api/payroll/payslip, off the
// same reader and the same renderer: what an administrator checked before
// releasing the run is, to the centavo and to the byte, what the person is
// handed. There is no second version of a payslip in this system, and there
// should never be one — a document about somebody's pay that differs depending
// on who asked for it is worse than no document.
//
// It is a route rather than a server action because the answer is a file: the
// browser navigates, gets an attachment and files it in its own downloads
// list, which survives leaving the page.
//
// Scoped to the session, always. The employee id is never read from the query
// string — a payslip is the most personal record the system holds, and a URL
// that takes an id is a URL somebody can edit. The office's route does take
// one, and pays for it with a manager check on every request.

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

  // The reader already answers in the document's own shape, and the response
  // is built where the document is — so this route decides who may ask, and
  // nothing about what comes back.
  return payslipResponse(record)
}
