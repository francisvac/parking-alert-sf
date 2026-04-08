/**
 * SF Open Data — Street Sweeping Schedule
 *
 * Dataset: Street Sweeping Schedule (yhqp-riqs)
 * Docs:    https://data.sfgov.org/Transportation/Street-Sweeping-Schedule/yhqp-riqs
 *
 * Verified field names (live API, April 2026):
 *   corridor    - street name, e.g. "Market St"
 *   limits      - block range, e.g. "Larkin St  -  Polk St"
 *   blockside   - e.g. "SouthEast", "West"
 *   cnn         - unique centerline ID (used for direct lookups)
 *   weekday     - abbreviated: "Mon","Tues","Wed","Thur","Fri","Sat","Sun"
 *   fromhour    - start hour integer, e.g. 8  (= 8:00 AM)
 *   tohour      - end hour integer, e.g. 10 (= 10:00 AM)
 *   week1..week5 - "1" active / "0" inactive for each week of month
 *   holidays    - "1" if schedule applies on holidays, "0" if suspended
 *   line        - GeoJSON LineString — enables spatial queries
 */

const BASE_URL  = 'https://data.sfgov.org/resource/yhqp-riqs.json'
const FETCH_TIMEOUT_MS = 8_000

const APP_TOKEN = import.meta.env.VITE_SF_APP_TOKEN || ''

// ─── Simple in-memory cache (key: rounded lat_lng, TTL: 15 min) ───────────────

const _cache = new Map()
const CACHE_TTL_MS = 15 * 60 * 1000

function cacheKey(lat, lng) {
  // Round to ~11m precision so nearby re-parks hit the cache
  return `${lat.toFixed(4)}_${lng.toFixed(4)}`
}

function fromCache(key) {
  const hit = _cache.get(key)
  if (!hit) return null
  if (Date.now() - hit.ts > CACHE_TTL_MS) { _cache.delete(key); return null }
  return hit.data
}

function toCache(key, data) {
  _cache.set(key, { data, ts: Date.now() })
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Primary fetch strategy:
 *   1. GPS spatial query — `within_circle(line, lat, lng, radius)`
 *      Radius is derived from the GPS accuracy reading so we cast the
 *      smallest net that still reliably captures the parked block.
 *      Results are then ranked by their true point-to-segment distance
 *      and filtered to the blocks the user is most likely parked next to.
 *   2. Keyword fallback on `corridor` if spatial returns nothing.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {string} streetName - from reverse geocoder, used as fallback keyword
 * @param {number} [accuracy]  - GPS accuracy in metres (from Geolocation API)
 * @returns {Promise<ScheduleEntry[]>}
 */
export async function fetchScheduleForLocation(lat, lng, streetName, accuracy) {
  const key = cacheKey(lat, lng)
  const cached = fromCache(key)
  if (cached) return cached

  // 1. Spatial query with dynamic radius
  let entries = await fetchByCoords(lat, lng, accuracy)

  // 2. Keyword fallback
  if (entries.length === 0 && streetName) {
    entries = await fetchByStreetName(streetName)
  }

  toCache(key, entries)
  return entries
}

/**
 * Given a list of schedule entries and a reference Date, return entries whose
 * cleaning window is active right now or starts within `lookaheadHours`.
 *
 * Also respects the `holidays` field — suspended schedules are excluded on
 * SF-observed public holidays.
 *
 * @param {ScheduleEntry[]} entries
 * @param {Date} now
 * @param {number} lookaheadHours
 * @returns {ActiveCleaning[]}
 */
export function findActiveOrUpcoming(entries, now = new Date(), lookaheadHours = 2) {
  const dayAbbr     = getDayAbbr(now)
  const weekOfMonth = getWeekOfMonth(now)
  const isTodayHoliday = isSFHoliday(now)
  const nowMin      = now.getHours() * 60 + now.getMinutes()
  const lookaheadMin = lookaheadHours * 60

  return entries
    .filter((e) => {
      if (e.weekday !== dayAbbr) return false
      if (!e.weeks.includes(weekOfMonth)) return false
      // Skip entries that are suspended on holidays if today is a holiday
      if (isTodayHoliday && !e.appliesToHolidays) return false
      return true
    })
    .map((e) => {
      const isActive   = nowMin >= e.startMinutes && nowMin < e.endMinutes
      const isUpcoming = nowMin < e.startMinutes && (e.startMinutes - nowMin) <= lookaheadMin

      if (!isActive && !isUpcoming) return null

      const todayDate   = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
      const cleaningStart = new Date(`${todayDate}T${minutesToTimeStr(e.startMinutes)}:00`)
      const cleaningEnd   = new Date(`${todayDate}T${minutesToTimeStr(e.endMinutes)}:00`)

      return {
        ...e,
        isActive,
        isUpcoming,
        minutesUntilStart: Math.max(0, e.startMinutes - nowMin),
        cleaningStart: cleaningStart.toISOString(),
        cleaningEnd:   cleaningEnd.toISOString()
      }
    })
    .filter(Boolean)
}

// ─── Fetch strategies ─────────────────────────────────────────────────────────

/**
 * Spatial fetch with distance ranking.
 *
 * - Radius = max(accuracy × 3, 120m), capped at 350m.
 *   Multiplying by 3 gives a comfortable buffer around the GPS dot.
 * - After fetching, compute the true point-to-segment distance for every
 *   returned block and keep only the ones within a tight "match" threshold.
 * - Match threshold = max(accuracy, 60m), capped at 120m.
 *   This ensures we return the actual block(s) the car is parked on,
 *   not every block within the search circle.
 * - Results are sorted nearest-first so callers always see the most
 *   relevant block at index 0.
 */
async function fetchByCoords(lat, lng, accuracy) {
  try {
    const accuracyM     = typeof accuracy === 'number' && accuracy > 0 ? accuracy : 30
    const searchRadius  = Math.min(Math.max(accuracyM * 3, 120), 350)
    const matchThreshold = Math.min(Math.max(accuracyM, 60), 120)

    const params = new URLSearchParams({
      '$where': `within_circle(line,${lat},${lng},${searchRadius})`,
      '$limit': '100'
    })
    const raw = await sfFetch(params.toString())
    if (!Array.isArray(raw)) return []

    return raw
      .map((r) => {
        const entry = parseEntry(r)
        if (!entry) return null
        const dist = r.line?.coordinates ? ptToLineString(lat, lng, r.line.coordinates) : Infinity
        return { ...entry, distanceMeters: Math.round(dist) }
      })
      .filter((e) => e && e.distanceMeters <= matchThreshold)
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
  } catch {
    return []
  }
}

async function fetchByStreetName(streetName) {
  const keyword = extractStreetKeyword(streetName)
  if (!keyword) return []
  const params = new URLSearchParams({
    '$where': `upper(corridor) like '%${keyword.toUpperCase()}%'`,
    '$limit': '100'
  })
  const raw = await sfFetch(params.toString())
  return Array.isArray(raw) ? raw.map(parseEntry).filter(Boolean) : []
}

/** Shared fetch with timeout and auth */
async function sfFetch(qs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const headers = {}
    if (APP_TOKEN) headers['X-App-Token'] = APP_TOKEN

    const res = await fetch(`${BASE_URL}?${qs}`, { headers, signal: controller.signal })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`SF Open Data API error: ${res.status} ${res.statusText}${body ? ` — ${body}` : ''}`)
    }

    return res.json()
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('SF Open Data request timed out. Try again.')
    throw err
  } finally {
    clearTimeout(timer)
  }
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

function parseEntry(raw) {
  try {
    const startMinutes = parseHour(raw.fromhour)
    const endMinutes   = parseHour(raw.tohour)
    if (startMinutes === null || endMinutes === null) return null

    const weeks = [1, 2, 3, 4, 5].filter((n) => raw[`week${n}`] === '1' || raw[`week${n}`] === 1)
    if (weeks.length === 0) return null

    // Convert GeoJSON [lng, lat] coordinates to Leaflet [lat, lng] for the map
    const coordinates = raw.line?.coordinates
      ? raw.line.coordinates.map(([lng, lat]) => [lat, lng])
      : null

    return {
      cnn:               raw.cnn || '',
      streetName:        raw.corridor || '',
      limits:            raw.limits?.trim().replace(/\s{2,}/g, ' – ') || '',
      blockSide:         raw.blockside || '',
      side:              raw.cnnrightleft || '',   // 'L' or 'R'
      weekday:           normaliseWeekday(raw.weekday || ''),
      startMinutes,
      endMinutes,
      weeks,
      appliesToHolidays: raw.holidays === '1',
      rawStartTime:      formatHour(startMinutes),
      rawEndTime:        formatHour(endMinutes),
      coordinates        // Leaflet [lat, lng] pairs for Polyline rendering
    }
  } catch {
    return null
  }
}

function parseHour(val) {
  if (val === null || val === undefined || val === '') return null
  const h = parseInt(val, 10)
  if (isNaN(h) || h < 0 || h > 23) return null
  return h * 60
}

function formatHour(totalMins) {
  const h    = Math.floor(totalMins / 60)
  const ampm = h < 12 ? 'AM' : 'PM'
  const h12  = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:00 ${ampm}`
}

// ─── Date & calendar helpers ──────────────────────────────────────────────────

const DAY_ABBRS = ['Sun', 'Mon', 'Tues', 'Wed', 'Thur', 'Fri', 'Sat']

function getDayAbbr(date) {
  return DAY_ABBRS[date.getDay()]
}

/** Which occurrence of this weekday within the month (1–5) */
function getWeekOfMonth(date) {
  return Math.ceil(date.getDate() / 7)
}

function normaliseWeekday(str) {
  const s = str.trim()
  if (DAY_ABBRS.includes(s)) return s
  const full = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  const idx  = full.findIndex((d) => d.toLowerCase() === s.toLowerCase())
  return idx >= 0 ? DAY_ABBRS[idx] : s
}

/**
 * Returns true if the date falls on an SF-observed public holiday
 * (street sweeping is suspended on these days regardless of schedule).
 *
 * SF-observed holidays: New Year's Day, MLK Jr Day, Presidents' Day,
 * César Chávez Day (Mar 31), Memorial Day, Juneteenth, Independence Day,
 * Labor Day, Indigenous Peoples' Day, Veterans Day, Thanksgiving, Christmas.
 */
function isSFHoliday(date) {
  const m = date.getMonth() + 1  // 1-12
  const d = date.getDate()
  const dow = date.getDay()       // 0=Sun
  const weekOfMonth = getWeekOfMonth(date)

  // Fixed-date holidays
  if (m === 1  && d === 1)  return true  // New Year's Day
  if (m === 3  && d === 31) return true  // César Chávez Day
  if (m === 6  && d === 19) return true  // Juneteenth
  if (m === 7  && d === 4)  return true  // Independence Day
  if (m === 11 && d === 11) return true  // Veterans Day
  if (m === 12 && d === 25) return true  // Christmas

  // Floating Monday holidays
  if (m === 1  && dow === 1 && weekOfMonth === 3) return true  // MLK Jr Day (3rd Mon Jan)
  if (m === 2  && dow === 1 && weekOfMonth === 3) return true  // Presidents' Day (3rd Mon Feb)
  if (m === 5  && dow === 1 && d >= 25)           return true  // Memorial Day (last Mon May)
  if (m === 9  && dow === 1 && weekOfMonth === 1) return true  // Labor Day (1st Mon Sep)
  if (m === 10 && dow === 1 && weekOfMonth === 2) return true  // Indigenous Peoples' Day (2nd Mon Oct)

  // Thanksgiving (4th Thu Nov)
  if (m === 11 && dow === 4 && weekOfMonth === 4) return true

  return false
}

// ─── Point-to-geometry distance (metres) ─────────────────────────────────────

/**
 * Minimum distance from a GPS point to a GeoJSON LineString.
 * Uses a flat-earth approximation — accurate to < 0.1% for distances under 1 km.
 *
 * @param {number} lat  - point latitude
 * @param {number} lng  - point longitude
 * @param {[number,number][]} coords - GeoJSON coordinates array ([lng, lat] pairs)
 * @returns {number} distance in metres
 */
function ptToLineString(lat, lng, coords) {
  let min = Infinity
  for (let i = 0; i < coords.length - 1; i++) {
    const [aLng, aLat] = coords[i]
    const [bLng, bLat] = coords[i + 1]
    const d = ptToSegment(lat, lng, aLat, aLng, bLat, bLng)
    if (d < min) min = d
  }
  return min
}

function ptToSegment(pLat, pLng, aLat, aLng, bLat, bLng) {
  const cosLat = Math.cos((pLat * Math.PI) / 180)
  // Scale lng to equal-distance units
  const px = pLng * cosLat, py = pLat
  const ax = aLng * cosLat, ay = aLat
  const bx = bLng * cosLat, by = bLat
  const dx = bx - ax, dy = by - ay
  const lenSq = dx * dx + dy * dy
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq))
  const cx = ax + t * dx, cy = ay + t * dy
  return Math.sqrt(((py - cy) * 111320) ** 2 + ((px - cx) * 111320) ** 2)
}

// ─── Street name helpers ──────────────────────────────────────────────────────

function extractStreetKeyword(name) {
  return name
    .replace(/\b(street|st|avenue|ave|boulevard|blvd|drive|dr|road|rd|way|lane|ln|court|ct|place|pl|terrace|ter|alley|aly)\b/gi, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .toUpperCase()
}

// ─── Misc ─────────────────────────────────────────────────────────────────────

function minutesToTimeStr(m) {
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

function pad(n) {
  return String(n).padStart(2, '0')
}
