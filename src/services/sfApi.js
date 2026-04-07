/**
 * SF Open Data — Street Sweeping Schedule
 *
 * Dataset: Street Sweeping Schedule (yhqp-riqs)
 * Docs:    https://data.sfgov.org/Transportation/Street-Sweeping-Schedule/yhqp-riqs
 * API:     Socrata SODA (no API key needed for read-only, but rate-limited at 1000/hr unauthenticated)
 *
 * Key fields returned by the API:
 *   streetname  - street name in uppercase, e.g. "MARKET"
 *   fromst      - starting cross street
 *   tost        - ending cross street
 *   blockside   - side of street ("East", "West", "North", "South", "Both")
 *   weekday     - day of week, e.g. "Monday"
 *   starttime   - start time string, e.g. "08:00 AM"  (or fromhour on some exports)
 *   endtime     - end time string, e.g. "10:00 AM"
 *   week1..week5 - "Yes"/"No" for which weeks of the month apply
 *
 * NOTE: The dataset uses street name segments (blocks), not individual addresses.
 * We match by street name and the city handles the rest by block range.
 */

const BASE_URL = 'https://data.sfgov.org/resource/yhqp-riqs.json'

// SF Open Data app token (optional but raises rate limit from 1k to 1M/day)
// Set VITE_SF_APP_TOKEN in your .env file to use one.
// Get a free token at: https://data.sfgov.org/profile/app_tokens
const APP_TOKEN = import.meta.env.VITE_SF_APP_TOKEN || ''

/**
 * Fetch all street sweeping schedule entries for a given street name.
 * @param {string} streetName - uppercase street name, e.g. "MARKET"
 * @returns {Promise<ScheduleEntry[]>}
 */
export async function fetchScheduleForStreet(streetName) {
  const normalised = normaliseStreetName(streetName)

  const params = new URLSearchParams({
    streetname: normalised,
    '$limit': '200',
    '$order': 'weekday,starttime'
  })

  const headers = {}
  if (APP_TOKEN) headers['X-App-Token'] = APP_TOKEN

  const response = await fetch(`${BASE_URL}?${params}`, { headers })

  if (!response.ok) {
    throw new Error(`SF Open Data API error: ${response.status} ${response.statusText}`)
  }

  const raw = await response.json()
  return raw.map(parseEntry).filter(Boolean)
}

/**
 * Given a list of schedule entries and a reference Date, return entries whose
 * cleaning window overlaps with right now or starts within the next `lookaheadHours`.
 *
 * @param {ScheduleEntry[]} entries
 * @param {Date} now
 * @param {number} lookaheadHours
 * @returns {ActiveCleaning[]}
 */
export function findActiveOrUpcoming(entries, now = new Date(), lookaheadHours = 2) {
  const dayName = getDayName(now)
  const weekOfMonth = getWeekOfMonth(now)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const lookaheadMinutes = lookaheadHours * 60

  return entries
    .filter((e) => {
      if (e.weekday !== dayName) return false
      if (!e.weeks.includes(weekOfMonth)) return false
      return true
    })
    .map((e) => {
      const startMin = e.startMinutes
      const endMin = e.endMinutes

      const isActive = nowMinutes >= startMin && nowMinutes < endMin
      const isUpcoming = nowMinutes < startMin && startMin - nowMinutes <= lookaheadMinutes

      if (!isActive && !isUpcoming) return null

      // Build ISO timestamps for today's cleaning window
      const todayDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
      const cleaningStart = new Date(`${todayDate}T${minutesToTimeStr(startMin)}:00`)
      const cleaningEnd = new Date(`${todayDate}T${minutesToTimeStr(endMin)}:00`)

      return {
        ...e,
        isActive,
        isUpcoming,
        minutesUntilStart: Math.max(0, startMin - nowMinutes),
        cleaningStart: cleaningStart.toISOString(),
        cleaningEnd: cleaningEnd.toISOString()
      }
    })
    .filter(Boolean)
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

function parseEntry(raw) {
  try {
    const startMinutes = parseTimeString(raw.starttime || raw.fromhour)
    const endMinutes = parseTimeString(raw.endtime || raw.tohour)
    if (startMinutes === null || endMinutes === null) return null

    // Build the list of applicable week numbers (1–5) from week1..week5 fields
    const weeks = [1, 2, 3, 4, 5].filter((n) => {
      const val = raw[`week${n}`]
      return val === 'Yes' || val === true || val === 'true'
    })

    return {
      streetName: (raw.streetname || '').toUpperCase(),
      fromStreet: raw.fromst || '',
      toStreet: raw.tost || '',
      blockSide: raw.blockside || '',
      weekday: normaliseWeekday(raw.weekday || ''),
      startMinutes,
      endMinutes,
      weeks,
      rawStartTime: raw.starttime || raw.fromhour || '',
      rawEndTime: raw.endtime || raw.tohour || ''
    }
  } catch {
    return null
  }
}

// Parses "08:00 AM", "8:00 AM", "1430" style strings → total minutes from midnight
function parseTimeString(str) {
  if (!str) return null
  str = str.trim()

  // "HH:MM AM/PM" format
  const ampmMatch = str.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1], 10)
    const mins = parseInt(ampmMatch[2], 10)
    const period = ampmMatch[3].toUpperCase()
    if (period === 'PM' && hours !== 12) hours += 12
    if (period === 'AM' && hours === 12) hours = 0
    return hours * 60 + mins
  }

  // "HH:MM" 24h format
  const h24Match = str.match(/^(\d{1,2}):(\d{2})$/)
  if (h24Match) {
    return parseInt(h24Match[1], 10) * 60 + parseInt(h24Match[2], 10)
  }

  // "HHMM" numeric
  const numMatch = str.match(/^(\d{3,4})$/)
  if (numMatch) {
    const n = str.padStart(4, '0')
    return parseInt(n.slice(0, 2), 10) * 60 + parseInt(n.slice(2), 10)
  }

  return null
}

// ─── Date Helpers ─────────────────────────────────────────────────────────────

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function getDayName(date) {
  return DAYS[date.getDay()]
}

// Returns which occurrence of this weekday in the month (1st, 2nd, 3rd, 4th, or 5th)
function getWeekOfMonth(date) {
  return Math.ceil(date.getDate() / 7)
}

function normaliseWeekday(str) {
  const s = str.trim()
  return DAYS.find((d) => d.toLowerCase() === s.toLowerCase()) || s
}

function normaliseStreetName(name) {
  return name
    .toUpperCase()
    .replace(/\bSTREET\b/g, 'ST')
    .replace(/\bAVENUE\b/g, 'AVE')
    .replace(/\bBOULEVARD\b/g, 'BLVD')
    .replace(/\bDRIVE\b/g, 'DR')
    .replace(/\bROAD\b/g, 'RD')
    .trim()
}

function minutesToTimeStr(totalMins) {
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  return `${pad(h)}:${pad(m)}`
}

function pad(n) {
  return String(n).padStart(2, '0')
}
