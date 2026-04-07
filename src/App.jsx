import React, { useState } from 'react'
import { useParking } from './hooks/useParking'
import { useStreetCleaning } from './hooks/useStreetCleaning'
import { ParkButton } from './components/ParkButton'
import { SavedLocation } from './components/SavedLocation'
import { StreetCleaningStatus } from './components/StreetCleaningStatus'
import { NotificationPermission } from './components/NotificationPermission'
import { ParkingMap } from './components/ParkingMap'
import './App.css'

export default function App() {
  const { parkedLocation, status, error: parkError, parkHere, clearParking } = useParking()
  const { schedule, activeWindows, loading, error: scheduleError, refresh } = useStreetCleaning(parkedLocation)

  const [warnMinutes] = useState(30)

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">SF Parking Alert</h1>
        <p className="app-subtitle">Never get a street cleaning ticket again</p>
      </header>

      <main className="app-main">
        <NotificationPermission />

        {/* Error from location/geocoding */}
        {parkError && (
          <div className="banner banner-error">
            <p>{parkError}</p>
          </div>
        )}

        {/* Primary action */}
        <ParkButton
          onPark={parkHere}
          onClear={clearParking}
          isParked={!!parkedLocation}
          isLocating={status === 'locating'}
        />

        {/* Map + saved location card */}
        {parkedLocation && (
          <ParkingMap location={parkedLocation} activeWindows={activeWindows} />
        )}
        {parkedLocation && <SavedLocation location={parkedLocation} />}

        {/* Street cleaning status — only shows after a spot is saved */}
        {parkedLocation && (
          <StreetCleaningStatus
            activeWindows={activeWindows}
            schedule={schedule}
            loading={loading}
            error={scheduleError}
            onRefresh={refresh}
          />
        )}

        {/* Empty state */}
        {!parkedLocation && (
          <div className="empty-state">
            <div className="empty-icon" aria-hidden="true">🚗</div>
            <p>Tap the button when you park your car.<br />We'll watch the street cleaning schedule and alert you.</p>
          </div>
        )}
      </main>

      <footer className="app-footer">
        <p>
          Works in San Francisco only · Data from{' '}
          <a href="https://data.sfgov.org" target="_blank" rel="noopener noreferrer">SF Open Data</a>
        </p>
        <p className="footer-note">
          Notifications work best on Android Chrome. For iOS, keep the app open.
        </p>
      </footer>
    </div>
  )
}
