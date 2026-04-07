/**
 * Firebase Cloud Messaging — client side
 *
 * Initialises the Firebase app (once), requests an FCM token,
 * then registers that token + the parked location with our backend
 * so the cron job can push notifications even when the browser is closed.
 */

import { initializeApp, getApps } from 'firebase/app'
import { getMessaging, getToken, onMessage } from 'firebase/messaging'

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID
}

// Initialise only once (Vite HMR can re-run this module)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]
const messaging = getMessaging(app)

/**
 * Request an FCM token for this device.
 * Must be called after notification permission has been granted.
 * @returns {Promise<string>} FCM token
 */
export async function getFCMToken() {
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY
  if (!vapidKey) throw new Error('VITE_FIREBASE_VAPID_KEY is not set')

  const swReg = await navigator.serviceWorker.ready
  return getToken(messaging, { vapidKey, serviceWorkerRegistration: swReg })
}

/**
 * Register the FCM token + parking location with the backend.
 * The backend (api/register.js) saves this to Firestore so the
 * cron job knows where to send alerts.
 *
 * @param {string} fcmToken
 * @param {{ streetName: string, lat: number, lng: number }} location
 */
export async function registerWithBackend(fcmToken, location) {
  const res = await fetch('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fcmToken,
      streetName: location.streetName,
      lat: location.lat,
      lng: location.lng
    })
  })
  if (!res.ok) throw new Error(`Registration failed: ${res.statusText}`)
}

/**
 * Unregister this device from push alerts (called when parking is cleared).
 * @param {string} fcmToken
 */
export async function unregisterFromBackend(fcmToken) {
  await fetch('/api/unregister', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fcmToken })
  }).catch(() => {}) // best-effort
}

/**
 * Listen for FCM messages received while the app is in the foreground.
 * (Background messages are handled by firebase-messaging-sw.js)
 *
 * @param {function} onNotification - called with { title, body }
 * @returns cleanup function
 */
export function onForegroundMessage(onNotification) {
  return onMessage(messaging, (payload) => {
    const { title, body } = payload.notification || {}
    onNotification({ title, body })
  })
}
