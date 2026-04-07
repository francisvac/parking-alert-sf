import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchScheduleForStreet, findActiveOrUpcoming } from '../services/sfApi'
import { scheduleCleaningAlerts, cancelAllAlerts } from '../services/notifications'

const CHECK_INTERVAL_MS = 5 * 60 * 1000  // re-check every 5 minutes

/**
 * Fetches the street cleaning schedule for the parked location and
 * manages notification scheduling.
 *
 * @param {object|null} parkedLocation - from useParking
 * @param {number} warnMinutesBefore  - how early to notify (default 30)
 */
export function useStreetCleaning(parkedLocation, warnMinutesBefore = 30) {
  const [schedule, setSchedule] = useState([])
  const [activeWindows, setActiveWindows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const intervalRef = useRef(null)

  const checkSchedule = useCallback(async (location) => {
    if (!location?.streetName) return
    setLoading(true)
    setError(null)
    try {
      const entries = await fetchScheduleForStreet(location.streetName)
      setSchedule(entries)

      const active = findActiveOrUpcoming(entries, new Date(), 2)
      setActiveWindows(active)

      if (active.length > 0) {
        await scheduleCleaningAlerts(active, location.streetName, warnMinutesBefore)
      } else {
        await cancelAllAlerts()
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [warnMinutesBefore])

  // Run immediately and then on interval whenever parkedLocation changes
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)

    if (!parkedLocation) {
      setSchedule([])
      setActiveWindows([])
      cancelAllAlerts()
      return
    }

    checkSchedule(parkedLocation)
    intervalRef.current = setInterval(() => checkSchedule(parkedLocation), CHECK_INTERVAL_MS)

    return () => {
      clearInterval(intervalRef.current)
      cancelAllAlerts()
    }
  }, [parkedLocation, checkSchedule])

  return { schedule, activeWindows, loading, error, refresh: () => checkSchedule(parkedLocation) }
}
