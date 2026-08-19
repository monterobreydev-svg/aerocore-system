"use server"

import { prisma } from "@/lib/db/prisma"
import { requireManager } from "@/lib/auth"
import { isR2Configured, presignDownload } from "@/lib/storage/r2"

/**
 * A short-lived link to one filed report.
 *
 * Takes the report's id rather than its storage key, for two reasons: a key
 * from the browser is a request to sign whatever the sender names, and the row
 * is where the composed filename lives — so the file arrives on the
 * administrator's machine called `PMS-1042_ACS_MAKATI.pdf` rather than
 * `Scan_20260811_0003.pdf`, whatever it was called on the way in.
 */
export async function getReportFileUrl(reportId: string) {
  await requireManager()
  if (!reportId || !isR2Configured()) return null

  const report = await prisma.attendanceReport.findUnique({
    where: { id: reportId },
    select: { fileKey: true, fileName: true },
  })
  if (!report) return null

  return presignDownload(report.fileKey, report.fileName)
}
