/**
 * Service Worker for SF Parking Alert
 *
 * Handles:
 * - Workbox precaching (injected by vite-plugin-pwa)
 * - Periodic schedule checks for street cleaning notifications
 * - Push notification display
 *
 * NOTE: For true background notifications when the browser is closed,
 * you need a push server (e.g. Firebase Cloud Messaging). This SW handles
 * notifications when the browser is running (including backgrounded tabs),
 * which covers Android Chrome reliably.
 */

import { precacheAndRoute } from 'workbox-precaching'

// Injected by vite-plugin-pwa at build time
precacheAndRoute(self.__WB_MANIFEST)

// ─── Message Handling ────────────────────────────────────────────────────────

// The main thread sends parking data and schedule intervals via postMessage
self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {}

  if (type === 'SCHEDULE_CLEANING_CHECK') {
    scheduleClearingCheck(payload)
  }

  if (type === 'CANCEL_CHECKS') {
    cancelAllChecks()
  }
})

// ─── Notification Scheduling ─────────────────────────────────────────────────

const pendingTimeouts = []

function cancelAllChecks() {
  pendingTimeouts.forEach(clearTimeout)
  pendingTimeouts.length = 0
}

/**
 * Schedule a notification at a specific time in the future.
 * @param {Object} params
 * @param {string} params.streetName
 * @param {string} params.cleaningStart  - ISO timestamp when cleaning starts
 * @param {string} params.cleaningEnd    - ISO timestamp when cleaning ends
 * @param {number} params.warnMinutesBefore - how many minutes before to warn (default 30)
 */
function scheduleClearingCheck({ streetName, cleaningStart, cleaningEnd, warnMinutesBefore = 30 }) {
  const startMs = new Date(cleaningStart).getTime()
  const notifyAt = startMs - warnMinutesBefore * 60 * 1000
  const now = Date.now()

  if (notifyAt <= now) {
    // Cleaning is imminent or already started — notify right away
    if (new Date(cleaningEnd).getTime() > now) {
      showCleaningNotification(streetName, cleaningStart, cleaningEnd, true)
    }
    return
  }

  const delay = notifyAt - now
  const id = setTimeout(() => {
    showCleaningNotification(streetName, cleaningStart, cleaningEnd, false)
  }, delay)
  pendingTimeouts.push(id)
}

function showCleaningNotification(streetName, cleaningStart, cleaningEnd, isNow) {
  const startTime = new Date(cleaningStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const endTime = new Date(cleaningEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  const title = isNow
    ? `Street cleaning NOW on ${streetName}`
    : `Street cleaning soon on ${streetName}`

  const body = isNow
    ? `Cleaning is happening until ${endTime}. Move your car!`
    : `Cleaning starts at ${startTime} and ends at ${endTime}. Move your car!`

  self.registration.showNotification(title, {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: 'street-cleaning-alert',
    renotify: true,
    requireInteraction: true,
    actions: [
      { action: 'open', title: 'Open App' },
      { action: 'dismiss', title: 'Dismiss' }
    ],
    data: { url: '/' }
  })
}

// ─── Notification Click ───────────────────────────────────────────────────────

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  if (event.action === 'dismiss') return

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus()
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/')
      }
    })
  )
})

// ─── Push (for future FCM integration) ───────────────────────────────────────

self.addEventListener('push', (event) => {
  if (!event.data) return
  const data = event.data.json()
  event.waitUntil(
    self.registration.showNotification(data.title || 'SF Parking Alert', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'street-cleaning-alert',
      requireInteraction: true,
      data: { url: data.url || '/' }
    })
  )
})
