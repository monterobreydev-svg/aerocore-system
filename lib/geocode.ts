import "server-only"
import { prisma } from "@/lib/db/prisma"

// ---------------------------------------------------------------------------
// Turning a GPS fix into a place name
//
// A punch records latitude and longitude, which is exactly the wrong shape for
// the question anyone actually asks of it: "where was this?". "14.23845,
// 121.16476" answers that only for someone holding a map. So the coordinates
// are resolved to words — once — and the words are cached forever.
//
// The provider is OpenStreetMap's Nominatim, which is free and needs no key.
// Its usage policy asks for three things in return, all of which this does:
// results are cached so the same spot is never requested twice, requests are
// serialised with a gap rather than fired in parallel, and every request
// identifies the application. Set NOMINATIM_CONTACT to an email or URL the
// OSM admins could reach you at — it is what they ask for, and what stops a
// misbehaving deployment being blocked without warning.
//
// Everything here fails soft. A geocoder being slow, rate-limited or wrong is
// not a reason for an attendance record to fail to open: the coordinates and
// the photograph are the evidence, and the address is a convenience laid on
// top of them.
// ---------------------------------------------------------------------------

const ENDPOINT = "https://nominatim.openstreetmap.org/reverse"

/** Past this, stop waiting and show the coordinates alone. */
const TIMEOUT_MS = 4000

/** Nominatim asks for no more than one request a second. */
const GAP_MS = 1100

/**
 * ~11 metres. Deliberately coarser than the fixes being looked up: two punches
 * at the same gate should share one cached row, and a street address doesn't
 * change over eleven metres anyway.
 */
function placeKey(latitude: number, longitude: number) {
  return `${latitude.toFixed(4)},${longitude.toFixed(4)}`
}

type NominatimAddress = Record<string, string | undefined>

/**
 * Nominatim's own `display_name` is a full postal recital — house number,
 * street, barangay, city, province, region, postcode, country — which is far
 * too long to sit under a coordinate in a dialog. This keeps the parts that
 * locate a site for someone who knows the area and drops the rest.
 */
function formatPlace(address: NominatimAddress | undefined, fallback?: string) {
  if (!address) return fallback ?? null

  const parts = [
    address.road ?? address.pedestrian ?? address.hamlet,
    address.village ??
      address.suburb ??
      address.neighbourhood ??
      address.quarter,
    address.city ?? address.town ?? address.municipality ?? address.county,
    address.state,
  ]

  // A barangay and a municipality sometimes come back under the same name;
  // printing it twice looks like a bug.
  const seen = new Set<string>()
  const kept: string[] = []
  for (const part of parts) {
    if (!part || seen.has(part)) continue
    seen.add(part)
    kept.push(part)
  }

  return kept.length > 0 ? kept.slice(0, 4).join(", ") : (fallback ?? null)
}

async function askNominatim(latitude: number, longitude: number) {
  const url = new URL(ENDPOINT)
  url.searchParams.set("format", "jsonv2")
  url.searchParams.set("lat", String(latitude))
  url.searchParams.set("lon", String(longitude))
  // 18 is roughly building level. Asking for more detail than the fix can
  // support just invents precision the GPS never had.
  url.searchParams.set("zoom", "18")
  url.searchParams.set("addressdetails", "1")

  const contact = process.env.NOMINATIM_CONTACT
  const response = await fetch(url, {
    headers: {
      "User-Agent": `AeroCooleOperations/1.0${contact ? ` (${contact})` : ""}`,
      "Accept-Language": "en",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })

  // Anything other than a clean answer is treated as "ask again another time"
  // rather than "there is nothing here" — a 429 or a 503 says nothing about
  // the location.
  if (!response.ok) return { ok: false as const }

  const body = (await response.json()) as {
    address?: NominatimAddress
    display_name?: string
    error?: string
  }
  if (body.error) return { ok: true as const, label: null }

  return { ok: true as const, label: formatPlace(body.address, body.display_name) }
}

export type Place = { key: string; label: string | null }

/**
 * Resolve several coordinates at once, cache first.
 *
 * Returns a label per requested point, in order, with null wherever the place
 * isn't known — the caller shows the coordinates alone in that case.
 */
export async function reverseGeocode(
  points: { latitude: number; longitude: number }[]
): Promise<(string | null)[]> {
  if (points.length === 0) return []

  const keys = points.map((point) => placeKey(point.latitude, point.longitude))
  const unique = [...new Set(keys)]

  const cached = await prisma.geocodedPlace.findMany({
    where: { key: { in: unique } },
    select: { key: true, label: true },
  })
  const known = new Map(cached.map((row) => [row.key, row.label]))

  // Only the ones nobody has looked up before, and one at a time with a gap
  // between them — this is a shared, free service, not an API we are paying to
  // hammer. A punch has two positions, so this loop runs at most twice.
  for (const key of unique) {
    if (known.has(key)) continue

    const index = keys.indexOf(key)
    const point = points[index]

    let result: Awaited<ReturnType<typeof askNominatim>>
    try {
      result = await askNominatim(point.latitude, point.longitude)
    } catch {
      // Timed out or the network refused. Nothing is cached, so the next view
      // tries again.
      known.set(key, null)
      continue
    }

    if (!result.ok) {
      known.set(key, null)
      continue
    }

    known.set(key, result.label)
    // A genuine "nothing here" is worth remembering too, so open water and
    // unmapped provincial roads aren't re-asked on every view.
    await prisma.geocodedPlace
      .create({ data: { key, label: result.label } })
      // Two admins opening the same punch at once both miss the cache and both
      // write; the loser of that race has nothing to fix.
      .catch(() => undefined)

    if (unique.indexOf(key) < unique.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, GAP_MS))
    }
  }

  return keys.map((key) => known.get(key) ?? null)
}
