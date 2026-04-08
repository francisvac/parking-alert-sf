/**
 * POST /api/cron/check-cleaning
 *
 * Called every 30 minutes by the GitHub Actions cron workflow.
 * Protected by a shared secret in the Authorization header.
 *
 * For each device registered in Firestore:
 *   1. Check the SF Open Data street sweeping schedule for their street
 *   2. If cleaning starts within 60 minutes, send an FCM push notification
 *   3. Avoid re-notifying for the same cleaning window
 *   4. Delete stale entries (parked > 24 hours ago)
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'

initAdminOnce()

const SF_API = 'https://data.sfgov.org/resource/yhqp-riqs.json'
const LOOKAHEAD_MINUTES = 60
const STALE_HOURS = 24

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  // Verify the cron secret
  const auth = req.headers['authorization'] || ''
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const db = getFirestore()
    const messaging = getMessaging()
    const now = new Date()

    // Load all registered devices
    const snapshot = await db.collection('parked_devices').get()
    if (snapshot.empty) return res.status(200).json({ notified: 0, checked: 0 })

    const devices = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))

    // Drop stale entries (parked more than 24 hours ago)
    const staleIds = devices
      .filter((d) => hoursSince(d.savedAt, now) > STALE_HOURS)
      .map((d) => d.id)

    if (staleIds.length > 0) {
      const batch = db.batch()
      staleIds.forEach((id) => batch.delete(db.collection('parked_devices').doc(id)))
      await batch.commit()
    }

    const activeDevices = devices.filter((d) => hoursSince(d.savedAt, now) <= STALE_HOURS)
    if (activeDevices.length === 0) return res.status(200).json({ notified: 0, checked: 0 })

    // Group devices by street so we only call the SF API once per street
    const byStreet = groupBy(activeDevices, (d) => d.streetName)

    let notified = 0
    const updates = []

    for (const [streetName, streetDevices] of Object.entries(byStreet)) {
      const windows = await getUpcomingWindows(streetName, now, LOOKAHEAD_MINUTES)
      if (windows.length === 0) continue

      // Use the first upcoming window as the notification target
      const window = windows[0]
      const windowKey = window.cleaningStart

      for (const device of streetDevices) {
        // Skip if we already notified for this exact window
        if (device.lastNotifiedWindow === windowKey) continue

        const minutesUntil = Math.round((new Date(window.cleaningStart) - now) / 60000)
        const startTime = new Date(window.cleaningStart).toLocaleTimeString('en-US', {
          hour: '2-digit', minute: '2-digit', timeZone: 'America/Los_Angeles'
        })
        const endTime = new Date(window.cleaningEnd).toLocaleTimeString('en-US', {
          hour: '2-digit', minute: '2-digit', timeZone: 'America/Los_Angeles'
        })

        const isNow = minutesUntil <= 0
        const title = isNow
          ? `Street cleaning NOW on ${streetName}`
          : `Street cleaning in ${minutesUntil} min on ${streetName}`
        const body = `${startTime}–${endTime}. Move your car to avoid a ticket!`

        try {
          await messaging.send({
            token: device.fcmToken,
            notification: { title, body },
            webpush: {
              notification: {
                icon: '/icons/icon-192.png',
                badge: '/icons/icon-192.png',
                requireInteraction: true,
                tag: 'street-cleaning-alert',
                renotify: true
              },
              fcmOptions: { link: '/' }
            }
          })

          // Record that we notified for this window
          updates.push(
            db.collection('parked_devices').doc(device.id).update({
              lastNotifiedWindow: windowKey,
              lastNotifiedAt: now.toISOString()
            })
          )
          notified++
        } catch (err) {
          // Token may have expired — remove it
          if (err.code === 'messaging/registration-token-not-registered') {
            updates.push(db.collection('parked_devices').doc(device.id).delete())
          } else {
            console.error(`[cron] FCM send failed for ${device.id}:`, err.message)
          }
        }
      }
    }

    await Promise.allSettled(updates)
    return res.status(200).json({ notified, checked: activeDevices.length })
  } catch (err) {
    console.error('[cron] check-cleaning error:', err)
    return res.status(500).json({ error: err.message })
  }
}

// ─── SF Open Data ─────────────────────────────────────────────────────────────

async function getUpcomingWindows(streetName, now, lookaheadMinutes) {
  const keyword = extractStreetKeyword(streetName)
  const qs = `$where=upper(corridor) like '%25${keyword.toUpperCase()}%25'&$limit=200`

  const headers = {}
  if (process.env.SF_APP_TOKEN) headers['X-App-Token'] = process.env.SF_APP_TOKEN

  const res = await fetch(`${SF_API}?${qs}`, { headers })
  if (!res.ok) return []

  const entries = await res.json()
  const sfNow = toSFTime(now)
  const dayAbbr = getDayAbbr(sfNow)
  const weekOfMonth = getWeekOfMonth(sfNow)
  const sfNowMin = sfNow.getHours() * 60 + sfNow.getMinutes()

  return entries
    .map((e) => parseEntry(e))
    .filter(Boolean)
    .filter((e) => {
      if (e.weekday !== dayAbbr) return false
      if (!e.weeks.includes(weekOfMonth)) return false
      const isActive   = sfNowMin >= e.startMinutes && sfNowMin < e.endMinutes
      const isUpcoming = sfNowMin < e.startMinutes && (e.startMinutes - sfNowMin) <= lookaheadMinutes
      return isActive || isUpcoming
    })
    .map((e) => {
      const todayPT = sfNow.toISOString().slice(0, 10)
      return {
        cleaningStart: new Date(`${todayPT}T${mins(e.startMinutes)}:00-07:00`).toISOString(),
        cleaningEnd:   new Date(`${todayPT}T${mins(e.endMinutes)}:00-07:00`).toISOString()
      }
    })
}

function parseEntry(raw) {
  try {
    const startMinutes = parseHour(raw.fromhour)
    const endMinutes   = parseHour(raw.tohour)
    if (startMinutes === null || endMinutes === null) return null
    const weeks = [1,2,3,4,5].filter((n) => raw[`week${n}`] === '1' || raw[`week${n}`] === 1)
    return { weekday: normaliseWeekday(raw.weekday || ''), startMinutes, endMinutes, weeks }
  } catch { return null }
}

function parseHour(val) {
  if (val === null || val === undefined || val === '') return null
  const h = parseInt(val, 10)
  if (isNaN(h) || h < 0 || h > 23) return null
  return h * 60
}

function extractStreetKeyword(name) {
  return name
    .replace(/\b(street|st|avenue|ave|boulevard|blvd|drive|dr|road|rd|way|lane|ln|court|ct|place|pl|terrace|ter|alley|aly)\b/gi, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .toUpperCase()
}

// ─── Date Helpers ─────────────────────────────────────────────────────────────

const DAY_ABBRS = ['Sun','Mon','Tues','Wed','Thur','Fri','Sat']

function getDayAbbr(sfDate) {
  return DAY_ABBRS[sfDate.getDay()]
}

function getWeekOfMonth(sfDate) {
  return Math.ceil(sfDate.getDate() / 7)
}

function normaliseWeekday(str) {
  const s = str.trim()
  if (DAY_ABBRS.includes(s)) return s
  const full = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  const idx  = full.findIndex((d) => d.toLowerCase() === s.toLowerCase())
  return idx >= 0 ? DAY_ABBRS[idx] : s
}

function toSFTime(date) {
  // Convert to Pacific Time for schedule comparisons
  return new Date(date.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
}

function mins(m) {
  return `${String(Math.floor(m / 60)).padStart(2,'0')}:${String(m % 60).padStart(2,'0')}`
}

function hoursSince(isoStr, now) {
  return (now - new Date(isoStr)) / 3_600_000
}

function groupBy(arr, keyFn) {
  return arr.reduce((acc, item) => {
    const k = keyFn(item)
    ;(acc[k] = acc[k] || []).push(item)
    return acc
  }, {})
}

// ─── Firebase Admin ───────────────────────────────────────────────────────────

function initAdminOnce() {
  if (getApps().length > 0) return
  initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    })
  })
}
