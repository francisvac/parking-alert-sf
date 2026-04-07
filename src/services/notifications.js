/**
 * Notification service
 *
 * Handles requesting permission and scheduling street cleaning alerts
 * through the registered Service Worker.
 *
 * How it works:
 *  1. Ask the user for notification permission.
 *  2. When active/upcoming cleaning windows are found, post them to the SW.
 *  3. The SW uses setTimeout to fire the notification at the right time.
 *
 * Limitation: SW timeouts only run while the browser is open (or backgrounded
 * on Android Chrome). For true "phone is locked" background delivery, you need
 * Firebase Cloud Messaging (FCM) — see README for the upgrade path.
 */

/**
 * Request notification permission from the user.
 * @returns {Promise<'granted'|'denied'|'default'>}
 */
export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    throw new Error('This browser does not support notifications.')
  }
  return Notification.requestPermission()
}

export function getNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported'
  return Notification.permission
}

/**
 * Schedule cleaning alerts via the Service Worker.
 * Cancels any previously scheduled alerts first.
 *
 * @param {ActiveCleaning[]} activeCleaning - results from findActiveOrUpcoming()
 * @param {string} streetName
 * @param {number} warnMinutesBefore - default 30
 */
export async function scheduleCleaningAlerts(activeCleaning, streetName, warnMinutesBefore = 30) {
  const sw = await getServiceWorker()
  if (!sw) {
    console.warn('Service worker not available — falling back to window.setTimeout notifications')
    scheduleWithWindowTimeout(activeCleaning, streetName, warnMinutesBefore)
    return
  }

  // Cancel existing checks
  sw.postMessage({ type: 'CANCEL_CHECKS' })

  for (const entry of activeCleaning) {
    sw.postMessage({
      type: 'SCHEDULE_CLEANING_CHECK',
      payload: {
        streetName,
        cleaningStart: entry.cleaningStart,
        cleaningEnd: entry.cleaningEnd,
        warnMinutesBefore
      }
    })
  }
}

export async function cancelAllAlerts() {
  const sw = await getServiceWorker()
  if (sw) sw.postMessage({ type: 'CANCEL_CHECKS' })
}

// ─── Fallback (no SW) ─────────────────────────────────────────────────────────

const fallbackTimeouts = []

function scheduleWithWindowTimeout(activeCleaning, streetName, warnMinutesBefore) {
  fallbackTimeouts.forEach(clearTimeout)
  fallbackTimeouts.length = 0

  for (const entry of activeCleaning) {
    const startMs = new Date(entry.cleaningStart).getTime()
    const notifyAt = startMs - warnMinutesBefore * 60 * 1000
    const delay = notifyAt - Date.now()

    if (delay > 0) {
      const id = setTimeout(() => showBrowserNotification(streetName, entry), delay)
      fallbackTimeouts.push(id)
    } else if (entry.isActive) {
      showBrowserNotification(streetName, entry)
    }
  }
}

function showBrowserNotification(streetName, entry) {
  const startTime = new Date(entry.cleaningStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const endTime = new Date(entry.cleaningEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  const title = entry.isActive
    ? `Street cleaning NOW on ${streetName}`
    : `Street cleaning soon on ${streetName}`

  const body = entry.isActive
    ? `Cleaning is happening until ${endTime}. Move your car!`
    : `Cleaning starts at ${startTime}. Move your car!`

  new Notification(title, { body, icon: '/icons/icon-192.png', tag: 'street-cleaning-alert' })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getServiceWorker() {
  if (!('serviceWorker' in navigator)) return null
  try {
    const reg = await navigator.serviceWorker.ready
    return reg.active
  } catch {
    return null
  }
}
