import type { NextRequest } from "next/server"

import { verifySession } from "@/lib/auth"
import {
  MAX_ZIP_FILES,
  parseTreePath,
  planDownload,
  type DownloadPlan,
} from "@/lib/document-tree"
import { getObjectBytes, isR2Configured } from "@/lib/r2"
import { zipStream, type ZipEntry } from "@/lib/zip"

// A folder of filed reports, as one archive.
//
// A route rather than a server action because the answer is a file, not data:
// the browser navigates here, gets `Content-Disposition: attachment` and takes
// over — its own progress, its own downloads tray, its own resume if the office
// wifi drops. An action would have had to buffer the whole thing into memory
// and hand it back through the page.
//
// Two ways to ask, one shape:
//
//   ?y=2026&t=PMS&c=<client>&m=7        the folder
//   ?y=2026&t=PMS&c=<client>&m=7&ids=…  the files ticked inside it
//
// The folder parameters are the same five the page is browsed by, read by the
// same parser, so the link on a tile is provably the tile it sits on.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * How many objects are in flight ahead of the writer.
 *
 * One at a time would spend a round trip to storage between every file; all at
 * once would pull a whole folder into memory. Four keeps the stream fed while
 * holding at most four files.
 */
const LOOKAHEAD = 4

async function* readEntries(files: DownloadPlan["files"]) {
  const queue: Promise<ZipEntry | null>[] = []
  let next = 0

  const fill = () => {
    while (queue.length < LOOKAHEAD && next < files.length) {
      const file = files[next++]
      queue.push(
        getObjectBytes(file.key).then((bytes) =>
          bytes ? { name: file.path, bytes, date: file.date } : null
        )
      )
    }
  }

  fill()
  while (queue.length > 0) {
    const entry = await queue.shift()!
    fill()
    // A row whose object is gone from the bucket is skipped, not fatal: the
    // other ninety-nine reports are still worth having.
    if (entry) yield entry
  }
}

export async function GET(request: NextRequest) {
  const session = await verifySession()
  if (session.role !== "DIRECTOR" && session.role !== "ADMINISTRATOR") {
    return new Response("Not allowed.", { status: 403 })
  }
  if (!isR2Configured()) {
    return new Response("File storage is not configured.", { status: 503 })
  }

  const params = request.nextUrl.searchParams
  const path = parseTreePath((key) => params.get(key))
  const ids = (params.get("ids") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, MAX_ZIP_FILES)

  const plan = await planDownload(path, ids)

  if (plan.total === 0) {
    return new Response("There are no reports here to download.", {
      status: 404,
    })
  }
  // A whole folder over the cap is refused rather than quietly truncated —
  // an archive that silently held the first 500 of 900 reports is worse than
  // one that didn't arrive. Ticked files can't hit this: the page can only
  // offer a page of them at a time.
  if (!ids.length && plan.total > MAX_ZIP_FILES) {
    return new Response(
      `This folder holds ${plan.total} reports and only ${MAX_ZIP_FILES} can be downloaded at once. Open a folder inside it, or tick the ones you need.`,
      { status: 413 }
    )
  }

  const name = ids.length ? `${plan.name}_selection` : plan.name

  return new Response(zipStream(readEntries(plan.files)), {
    headers: {
      "Content-Type": "application/zip",
      // Every segment of the name came out of `fileSegment`, so it is already
      // quote-free and ASCII.
      "Content-Disposition": `attachment; filename="${name}.zip"`,
      "Cache-Control": "no-store",
    },
  })
}
