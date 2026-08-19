import type { NextRequest } from "next/server"

import { requireManager } from "@/lib/auth"
import { parseDayParam } from "@/lib/attendance"
import { buildPayslip } from "@/lib/payroll/payslip-query"
import { payslipResponse } from "@/lib/payroll/payslip-pdf"

// One person's payslip, from the office side.
//
// The sibling route under /api/payslips is the employee's own copy: it never
// takes an id, because a URL that takes one is a URL somebody can edit, and it
// refuses a period that has not been released yet. This one is the other half
// of that pair — the office names whose payslip it wants, and gets it whether
// or not the run has been published, because deciding to publish is exactly
// what they are reading it to do. Both are the same document from the same
// reader, so the copy an administrator checks is the copy the employee gets.
//
// A route rather than a server action because the answer is a file: the browser
// navigates, gets an attachment, and files it in its own downloads list, which
// survives leaving the page.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  // Director and Administrator. An Engineer reaches the admin shell but has no
  // business reading somebody else's pay.
  await requireManager()

  const employeeId = request.nextUrl.searchParams.get("employee")
  if (!employeeId) {
    return new Response("Which employee?", { status: 400 })
  }

  const day = parseDayParam(
    request.nextUrl.searchParams.get("cutoff") ?? undefined,
    new Date()
  )

  const record = await buildPayslip(employeeId, day)
  if (!record) {
    return new Response("No payslip for that period.", { status: 404 })
  }

  // Byte for byte the file the employee downloads once the run is released —
  // same reader, same renderer, same response. This route decides who may ask;
  // it decides nothing about what comes back.
  return payslipResponse(record)
}
