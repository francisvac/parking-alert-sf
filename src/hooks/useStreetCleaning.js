import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchScheduleForLocation, findActiveOrUpcoming } from '../services/sfApi'
import { scheduleCleaningAlerts, cancelAllAlerts } from '../services/notifications'

/**
 * Adaptive polling intervals based on how soon cleaning is.
 * Polls more frequently when cleaning is imminent, backs off when safe.
 */
function nextCheckMs(activeWindows) {
  if (activeWindows.length === 0) return 30 * 60 * 1000    // 30 min — nothing upcoming

  const soonest = Math.min(...activeWindows.map((w) => w.minutesUntilStart))
  if (soonest <= 0)  return 60 * 1000                       // 1 min  — active right now
  if (soonest <= 30) return 60 * 1000                       // 1 min  — within 30 min
  if (soonest <= 90) return 5 * 60 * 1000                   // 5 min  — within 1.5 hrs
  return 15 * 60 * 1000                                     // 15 min — more than 1.5 hrs away
}

/**
 * Fetches the street cleaning schedule for the parked location using
 * GPS-based spatial query (most accurate) with keyword fallback,
 * and manages notification scheduling.
 *
 * @param {object|null} parkedLocation - from useParking
 * @param {number} warnMinutesBefore  - how early to notify (default 30)
 */
export function useStreetCleaning(parkedLocation, warnMinutesBefore = 30) {
  const [schedule, setSchedule]         = useState([])
  const [activeWindows, setActiveWindows] = useState([])
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState(null)
  const [lastUpdated, setLastUpdated]   = useState(null)
  const timeoutRef = useRef(null)

  const checkSchedule = useCallback(async (location) => {
    if (!location?.lat || !location?.lng) return
    setLoading(true)
    setError(null)

    try {
      const entries = await fetchScheduleForLocation(
        location.lat,
        location.lng,
        location.streetName,
        location.accuracy
      )
      setSchedule(entries)

      const active = findActiveOrUpcoming(entries, new Date(), 2)
      setActiveWindows(active)
      setLastUpdated(new Date())

      if (active.length > 0) {
        await scheduleCleaningAlerts(active, location.streetName || location.corridor, warnMinutesBefore)
      } else {
        await cancelAllAlerts()
      }

      return active
    } catch (err) {
      setError(err.message)
      return []
    } finally {
      setLoading(false)
    }
  }, [warnMinutesBefore])

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)

    if (!parkedLocation) {
      setSchedule([])
      setActiveWindows([])
      setLastUpdated(null)
      cancelAllAlerts()
      return
    }

    // Initial check, then schedule next check adaptively
    async function run() {
      const active = await checkSchedule(parkedLocation)
      const delay  = nextCheckMs(active || [])
      timeoutRef.current = setTimeout(run, delay)
    }

    run()

    return () => {
      clearTimeout(timeoutRef.current)
      cancelAllAlerts()
    }
  }, [parkedLocation, checkSchedule])

  return {
    schedule,
    activeWindows,
    loading,
    error,
    lastUpdated,
    refresh: () => checkSchedule(parkedLocation)
  }
}
