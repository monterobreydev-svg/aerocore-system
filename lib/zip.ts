import "server-only"

// ---------------------------------------------------------------------------
// A ZIP file, written one entry at a time into a stream
// ---------------------------------------------------------------------------
//
// Downloading a folder means handing over one file, not twenty tabs of
// presigned URLs that a popup blocker eats and that expire while the office is
// still clicking through them. So the entries are stitched into a ZIP here.
//
// Two deliberate choices:
//
//   *Stored*, never deflated. Everything in the bucket is a PDF or a JPEG —
//   already compressed — so deflating spends CPU per megabyte to save roughly
//   nothing, and stored entries need no compressor at all.
//
//   *Streamed*, never buffered. Each entry is fetched, written and dropped, so
//   a 400 MB folder costs one file of memory rather than 400 MB of it, and the
//   browser starts showing a download the moment the first byte lands instead
//   of after the last one.
//
// No dependency for the same reason `lib/documents.ts` composes its own names:
// the stored-entry subset of the format is a few headers and a checksum, and
// the whole of it fits on this page.

/**
 * Offsets in the end-of-directory record are 32-bit, so past 4 GB the archive
 * needs the ZIP64 extensions this writer doesn't implement. Cut off well short
 * of that rather than emit something that unzips to garbage — the file cap on
 * the caller's side means real folders never come near it.
 */
const MAX_ARCHIVE_BYTES = 3 * 1024 * 1024 * 1024

const LOCAL_SIGNATURE = 0x04034b50
const CENTRAL_SIGNATURE = 0x02014b50
const END_SIGNATURE = 0x06054b50

/** Stored, and "the name is UTF-8" — bit 11, so accents survive the trip. */
const NO_COMPRESSION = 0
const UTF8_NAMES = 0x0800
const VERSION = 20

export type ZipEntry = {
  /** Path inside the archive, `/` separated. Folders need no entry of their own. */
  name: string
  bytes: Uint8Array
  /** Shown as the file's date in the archive. */
  date?: Date
}

const encoder = new TextEncoder()

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let bit = 0; bit < 8; bit++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

// MS-DOS packed time: two-second resolution, and years counted from 1980.
// Anything older than that can't be represented, so it clamps rather than
// wrapping into the future.
function dosStamp(date: Date) {
  const year = Math.max(1980, date.getFullYear())
  return {
    time:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  }
}

type Written = {
  name: Uint8Array
  crc: number
  size: number
  stamp: { time: number; date: number }
  offset: number
}

function localHeader(entry: Written) {
  const header = new Uint8Array(30 + entry.name.length)
  const view = new DataView(header.buffer)

  view.setUint32(0, LOCAL_SIGNATURE, true)
  view.setUint16(4, VERSION, true)
  view.setUint16(6, UTF8_NAMES, true)
  view.setUint16(8, NO_COMPRESSION, true)
  view.setUint16(10, entry.stamp.time, true)
  view.setUint16(12, entry.stamp.date, true)
  view.setUint32(14, entry.crc, true)
  // Stored, so the compressed and uncompressed sizes are the same number.
  view.setUint32(18, entry.size, true)
  view.setUint32(22, entry.size, true)
  view.setUint16(26, entry.name.length, true)
  view.setUint16(28, 0, true)
  header.set(entry.name, 30)

  return header
}

// The central directory is what an unzipper actually reads: the local headers
// are only a hint, and a file with a valid directory opens even if it had to be
// cut short.
function centralDirectory(entries: Written[]) {
  const size = entries.reduce((total, e) => total + 46 + e.name.length, 0)
  const block = new Uint8Array(size + 22)
  const view = new DataView(block.buffer)

  let at = 0
  for (const entry of entries) {
    view.setUint32(at, CENTRAL_SIGNATURE, true)
    view.setUint16(at + 4, VERSION, true)
    view.setUint16(at + 6, VERSION, true)
    view.setUint16(at + 8, UTF8_NAMES, true)
    view.setUint16(at + 10, NO_COMPRESSION, true)
    view.setUint16(at + 12, entry.stamp.time, true)
    view.setUint16(at + 14, entry.stamp.date, true)
    view.setUint32(at + 16, entry.crc, true)
    view.setUint32(at + 20, entry.size, true)
    view.setUint32(at + 24, entry.size, true)
    view.setUint16(at + 28, entry.name.length, true)
    view.setUint16(at + 30, 0, true) // extra
    view.setUint16(at + 32, 0, true) // comment
    view.setUint16(at + 34, 0, true) // disk
    view.setUint16(at + 36, 0, true) // internal attributes
    view.setUint32(at + 38, 0, true) // external attributes
    view.setUint32(at + 42, entry.offset, true)
    block.set(entry.name, at + 46)
    at += 46 + entry.name.length
  }

  const offset = entries.length
    ? entries[entries.length - 1].offset +
      30 +
      entries[entries.length - 1].name.length +
      entries[entries.length - 1].size
    : 0

  view.setUint32(at, END_SIGNATURE, true)
  view.setUint16(at + 4, 0, true)
  view.setUint16(at + 6, 0, true)
  view.setUint16(at + 8, entries.length, true)
  view.setUint16(at + 10, entries.length, true)
  view.setUint32(at + 12, size, true)
  view.setUint32(at + 16, offset, true)
  view.setUint16(at + 20, 0, true)

  return block
}

async function* archive(source: AsyncIterable<ZipEntry>) {
  const written: Written[] = []
  let offset = 0

  for await (const entry of source) {
    const name = encoder.encode(entry.name)
    const total = offset + 30 + name.length + entry.bytes.length
    // Out of room. Stop taking entries and close the archive properly, so what
    // did fit still opens — a truncated stream would not.
    if (total > MAX_ARCHIVE_BYTES) break

    const record: Written = {
      name,
      crc: crc32(entry.bytes),
      size: entry.bytes.length,
      stamp: dosStamp(entry.date ?? new Date()),
      offset,
    }

    yield localHeader(record)
    yield entry.bytes

    written.push(record)
    offset = total
  }

  yield centralDirectory(written)
}

/**
 * A ZIP of everything the source yields, as a stream.
 *
 * Pull-based on purpose: the next entry is only fetched when the socket is
 * ready for it, so a slow connection throttles the reads from storage instead
 * of piling them up in memory.
 */
export function zipStream(source: AsyncIterable<ZipEntry>) {
  const chunks = archive(source)

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await chunks.next()
      if (done) controller.close()
      else controller.enqueue(value)
    },
    async cancel() {
      await chunks.return(undefined)
    },
  })
}
