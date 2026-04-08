/**
 * SF Open Data — Street Sweeping Schedule
 *
 * Dataset: Street Sweeping Schedule (yhqp-riqs)
 * Docs:    https://data.sfgov.org/Transportation/Street-Sweeping-Schedule/yhqp-riqs
 * API:     Socrata SODA (no API key needed for read-only, rate-limited at 1000/hr unauthenticated)
 *
 * Actual field names (verified against live API):
 *   corridor    - street name, e.g. "Market St"  (mixed case, abbreviated)
 *   limits      - block range, e.g. "Larkin St  -  Polk St"
 *   blockside   - e.g. "SouthEast", "West"
 *   weekday     - abbreviated day: "Mon","Tues","Wed","Thur","Fri","Sat","Sun"
 *   fromhour    - start hour as integer string, e.g. "8" (= 8:00 AM)
 *   tohour      - end hour as integer string, e.g. "10" (= 10:00 AM)
 *   week1..week5 - "1" (active) or "0" (inactive) for each week of the month
 */

const BASE_URL = 'https://data.sfgov.org/resource/yhqp-riqs.json'

const APP_TOKEN = import.meta.env.VITE_SF_APP_TOKEN || ''

/**
 * Fetch all street sweeping schedule entries for a given street name.
 * Uses a LIKE query against the `corridor` field so "Market Street" → "Market St" still matches.
 *
 * @param {string} streetName - as returned by the geocoder, e.g. "Market Street"
 * @returns {Promise<ScheduleEntry[]>}
 */
export async function fetchScheduleForStreet(streetName) {
  const keyword = extractStreetKeyword(streetName)

  // Socrata LIKE query — case-insensitive partial match on corridor
  const params = new URLSearchParams({
    '$where': `upper(corridor) like '%25${encodeURIComponent(keyword.toUpperCase())}%25'`,
    '$limit': '200'
  })

  // Socrata encodes % as %25 in $where — build the raw query string manually
  const qs = `$where=upper(corridor) like '%25${keyword.toUpperCase()}%25'&$limit=200`

  const headers = {}
  if (APP_TOKEN) headers['X-App-Token'] = APP_TOKEN

  const response = await fetch(`${BASE_URL}?${qs}`, { headers })

  if (!response.ok) {
    throw new Error(`SF Open Data API error: ${response.status} ${response.statusText}`)
  }

  const raw = await response.json()
  return raw.map(parseEntry).filter(Boolean)
}

/**
 * Given a list of schedule entries and a reference Date, return entries whose
 * cleaning window overlaps with right now or starts within the next `lookaheadHours`.
 */
export function findActiveOrUpcoming(entries, now = new Date(), lookaheadHours = 2) {
  const dayAbbr = getDayAbbr(now)
  const weekOfMonth = getWeekOfMonth(now)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const lookaheadMinutes = lookaheadHours * 60

  return entries
    .filter((e) => {
      if (e.weekday !== dayAbbr) return false
      if (!e.weeks.includes(weekOfMonth)) return false
      return true
    })
    .map((e) => {
      const startMin = e.startMinutes
      const endMin = e.endMinutes

      const isActive   = nowMinutes >= startMin && nowMinutes < endMin
      const isUpcoming = nowMinutes < startMin && (startMin - nowMinutes) <= lookaheadMinutes

      if (!isActive && !isUpcoming) return null

      const todayDate   = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
      const cleaningStart = new Date(`${todayDate}T${minutesToTimeStr(startMin)}:00`)
      const cleaningEnd   = new Date(`${todayDate}T${minutesToTimeStr(endMin)}:00`)

      return {
        ...e,
        isActive,
        isUpcoming,
        minutesUntilStart: Math.max(0, startMin - nowMinutes),
        cleaningStart: cleaningStart.toISOString(),
        cleaningEnd:   cleaningEnd.toISOString()
      }
    })
    .filter(Boolean)
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

function parseEntry(raw) {
  try {
    // fromhour/tohour are plain integers representing the hour (e.g. 8 = 8:00 AM)
    const startMinutes = parseHour(raw.fromhour)
    const endMinutes   = parseHour(raw.tohour)
    if (startMinutes === null || endMinutes === null) return null

    // week1..week5 are "1" / "0"
    const weeks = [1, 2, 3, 4, 5].filter((n) => raw[`week${n}`] === '1' || raw[`week${n}`] === 1)

    return {
      streetName:  raw.corridor || '',
      limits:      raw.limits   || '',
      blockSide:   raw.blockside || '',
      weekday:     normaliseWeekday(raw.weekday || ''),
      startMinutes,
      endMinutes,
      weeks,
      rawStartTime: formatHour(startMinutes),
      rawEndTime:   formatHour(endMinutes)
    }
  } catch {
    return null
  }
}

/** fromhour is a plain integer hour (0–23) → minutes from midnight */
function parseHour(val) {
  if (val === null || val === undefined || val === '') return null
  const h = parseInt(val, 10)
  if (isNaN(h) || h < 0 || h > 23) return null
  return h * 60
}

function formatHour(totalMins) {
  const h = Math.floor(totalMins / 60)
  const ampm = h < 12 ? 'AM' : 'PM'
  const h12  = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:00 ${ampm}`
}

// ─── Day helpers ──────────────────────────────────────────────────────────────

// Dataset uses abbreviated days: Mon, Tues, Wed, Thur, Fri, Sat, Sun
const DAY_ABBRS = ['Sun', 'Mon', 'Tues', 'Wed', 'Thur', 'Fri', 'Sat']

function getDayAbbr(date) {
  return DAY_ABBRS[date.getDay()]
}

function getWeekOfMonth(date) {
  return Math.ceil(date.getDate() / 7)
}

/** Map any weekday string to the abbreviated form used by the dataset */
function normaliseWeekday(str) {
  const s = str.trim()
  // Already abbreviated
  if (DAY_ABBRS.includes(s)) return s
  // Full name → abbreviation
  const full = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  const idx  = full.findIndex((d) => d.toLowerCase() === s.toLowerCase())
  return idx >= 0 ? DAY_ABBRS[idx] : s
}

// ─── Street name helpers ──────────────────────────────────────────────────────

/**
 * Extract the bare street keyword for the LIKE query.
 * "Market Street" → "MARKET"
 * "Valencia St"   → "VALENCIA"
 * "19th Avenue"   → "19TH"
 */
function extractStreetKeyword(name) {
  return name
    .replace(/\b(street|st|avenue|ave|boulevard|blvd|drive|dr|road|rd|way|lane|ln|court|ct|place|pl|terrace|ter|alley|aly)\b/gi, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .toUpperCase()
}

// ─── Misc ─────────────────────────────────────────────────────────────────────

function minutesToTimeStr(totalMins) {
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  return `${pad(h)}:${pad(m)}`
}

function pad(n) {
  return String(n).padStart(2, '0')
}
