/**
 * Geolocation service
 * Wraps the browser Geolocation API with Promise-based helpers.
 */

const GEO_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 10_000,
  maximumAge: 0
}

/**
 * Get the device's current GPS position once.
 * @returns {Promise<{lat: number, lng: number, accuracy: number}>}
 */
export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser.'))
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy  // metres
      }),
      (err) => reject(new Error(geolocationErrorMessage(err))),
      GEO_OPTIONS
    )
  })
}

/**
 * Watch the device's position continuously.
 * @param {function} onUpdate - called with {lat, lng, accuracy} on each update
 * @param {function} onError  - called with an Error on failure
 * @returns {number} watchId — pass to stopWatchingPosition() to stop
 */
export function watchPosition(onUpdate, onError) {
  if (!navigator.geolocation) {
    onError(new Error('Geolocation is not supported by this browser.'))
    return null
  }

  return navigator.geolocation.watchPosition(
    (pos) => onUpdate({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy
    }),
    (err) => onError(new Error(geolocationErrorMessage(err))),
    GEO_OPTIONS
  )
}

export function stopWatchingPosition(watchId) {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId)
}

// ─── Persistence ──────────────────────────────────────────────────────────────

const STORAGE_KEY = 'parked_location'

export function saveParkedLocation(location) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    ...location,
    savedAt: new Date().toISOString()
  }))
}

export function loadParkedLocation() {
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw ? JSON.parse(raw) : null
}

export function clearParkedLocation() {
  localStorage.removeItem(STORAGE_KEY)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function geolocationErrorMessage(err) {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return 'Location permission denied. Please allow location access in your browser settings.'
    case err.POSITION_UNAVAILABLE:
      return 'Location unavailable. Make sure GPS is enabled.'
    case err.TIMEOUT:
      return 'Location request timed out. Try again.'
    default:
      return 'Unknown location error.'
  }
}
