import { useState, useCallback } from 'react'
import { getCurrentPosition, saveParkedLocation, loadParkedLocation, clearParkedLocation } from '../services/geolocation'
import { reverseGeocode } from '../services/geocoding'
import { getFCMToken, registerWithBackend, unregisterFromBackend } from '../services/fcm'

const FCM_TOKEN_KEY = 'fcm_token'

/**
 * Manages the "save parking spot" flow:
 *   1. Get current GPS position
 *   2. Reverse geocode to a street name
 *   3. Persist to localStorage
 *   4. Register FCM token + location with backend for server-side push alerts
 */
export function useParking() {
  const [parkedLocation, setParkedLocation] = useState(() => loadParkedLocation())
  const [status, setStatus] = useState('idle')   // 'idle' | 'locating' | 'error'
  const [error, setError] = useState(null)

  const parkHere = useCallback(async () => {
    setStatus('locating')
    setError(null)
    try {
      const coords = await getCurrentPosition()
      const geocoded = await reverseGeocode(coords.lat, coords.lng)
      const location = { ...coords, ...geocoded }
      saveParkedLocation(location)
      const saved = { ...location, savedAt: new Date().toISOString() }
      setParkedLocation(saved)
      setStatus('idle')

      // Register with FCM backend (best-effort — don't block the UI on failure)
      registerFCM(saved).catch((err) =>
        console.warn('[FCM] Registration failed (notifications may not work):', err.message)
      )

      return saved
    } catch (err) {
      setError(err.message)
      setStatus('error')
      return null
    }
  }, [])

  const clearParking = useCallback(() => {
    // Unregister FCM so the cron job stops sending alerts for this device
    const token = localStorage.getItem(FCM_TOKEN_KEY)
    if (token) {
      unregisterFromBackend(token)
      localStorage.removeItem(FCM_TOKEN_KEY)
    }

    clearParkedLocation()
    setParkedLocation(null)
    setError(null)
    setStatus('idle')
  }, [])

  return { parkedLocation, status, error, parkHere, clearParking }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function registerFCM(location) {
  if (Notification.permission !== 'granted') return

  const token = await getFCMToken()
  localStorage.setItem(FCM_TOKEN_KEY, token)
  await registerWithBackend(token, location)
}
