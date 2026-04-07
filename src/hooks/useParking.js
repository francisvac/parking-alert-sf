import { useState, useCallback } from 'react'
import { getCurrentPosition, saveParkedLocation, loadParkedLocation, clearParkedLocation } from '../services/geolocation'
import { reverseGeocode } from '../services/geocoding'

/**
 * Manages the "save parking spot" flow:
 *   1. Get current GPS position
 *   2. Reverse geocode to a street name
 *   3. Persist to localStorage
 *   4. Expose state for the UI
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
      setParkedLocation({ ...location, savedAt: new Date().toISOString() })
      setStatus('idle')
      return location
    } catch (err) {
      setError(err.message)
      setStatus('error')
      return null
    }
  }, [])

  const clearParking = useCallback(() => {
    clearParkedLocation()
    setParkedLocation(null)
    setError(null)
    setStatus('idle')
  }, [])

  return { parkedLocation, status, error, parkHere, clearParking }
}
