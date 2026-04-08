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
 *   1. Try GPS-based spatial query — `within_circle(line, lat, lng, 150m)`
 *      Returns only the blocks the user is physically next to. Most accurate.
 *   2. Fall back to keyword search on `corridor` if spatial returns nothing
 *      (e.g. GPS inaccuracy places the user mid-block away from any segment).
 *
 * @param {number} lat
 * @param {number} lng
 * @param {string} streetName - from reverse geocoder, used as fallback keyword
 * @returns {Promise<ScheduleEntry[]>}
 */
export async function fetchScheduleForLocation(lat, lng, streetName) {
  const key = cacheKey(lat, lng)
  const cached = fromCache(key)
  if (cached) return cached

  // 1. Spatial query — most accurate
  let entries = await fetchByCoords(lat, lng)

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

async function fetchByCoords(lat, lng, radiusMetres = 150) {
  const qs = `$where=within_circle(line,${lat},${lng},${radiusMetres})&$limit=50`
  const raw = await sfFetch(qs)
  return Array.isArray(raw) ? raw.map(parseEntry).filter(Boolean) : []
}

async function fetchByStreetName(streetName) {
  const keyword = extractStreetKeyword(streetName)
  if (!keyword) return []
  const qs = `$where=upper(corridor) like '%25${keyword.toUpperCase()}%25'&$limit=100`
  const raw = await sfFetch(qs)
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
      throw new Error(`SF Open Data API error: ${res.status} ${res.statusText}`)
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
    if (weeks.length === 0) return null  // No applicable weeks — skip

    return {
      cnn:               raw.cnn || '',
      streetName:        raw.corridor || '',
      limits:            raw.limits?.trim().replace(/\s{2,}/g, ' – ') || '',
      blockSide:         raw.blockside || '',
      weekday:           normaliseWeekday(raw.weekday || ''),
      startMinutes,
      endMinutes,
      weeks,
      appliesToHolidays: raw.holidays === '1',
      rawStartTime:      formatHour(startMinutes),
      rawEndTime:        formatHour(endMinutes)
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
