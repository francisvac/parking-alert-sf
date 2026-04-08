import React from 'react'
import { useParking } from './hooks/useParking'
import { useStreetCleaning } from './hooks/useStreetCleaning'
import { ParkButton } from './components/ParkButton'
import { SavedLocation } from './components/SavedLocation'
import { StreetCleaningStatus } from './components/StreetCleaningStatus'
import { NotificationPermission } from './components/NotificationPermission'
import { ParkingMap } from './components/ParkingMap'
import { IOSBanner } from './components/IOSBanner'
import './App.css'

export default function App() {
  const { parkedLocation, status, error: parkError, parkHere, clearParking } = useParking()
  const { schedule, activeWindows, loading, error: scheduleError, lastUpdated, refresh } = useStreetCleaning(parkedLocation)

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">SF Parking Alert</h1>
        <p className="app-subtitle">Never get a street cleaning ticket again</p>
      </header>

      <main className="app-main">
        <IOSBanner />
        <NotificationPermission />

        {parkError && (
          <div className="banner banner-error">
            <p>{parkError}</p>
          </div>
        )}

        <ParkButton
          onPark={parkHere}
          onClear={clearParking}
          isParked={!!parkedLocation}
          isLocating={status === 'locating'}
        />

        {parkedLocation && (
          <ParkingMap location={parkedLocation} activeWindows={activeWindows} />
        )}

        {parkedLocation && <SavedLocation location={parkedLocation} />}

        {parkedLocation && (
          <StreetCleaningStatus
            activeWindows={activeWindows}
            schedule={schedule}
            loading={loading}
            error={scheduleError}
            onRefresh={refresh}
            lastUpdated={lastUpdated}
          />
        )}

        {!parkedLocation && (
          <div className="empty-state">
            <div className="empty-icon" aria-hidden="true">🚗</div>
            <p>Tap the button when you park your car.<br />We'll watch the street cleaning schedule and alert you.</p>
          </div>
        )}
      </main>

      <footer className="app-footer">
        <p>
          San Francisco only · Data from{' '}
          <a href="https://data.sfgov.org" target="_blank" rel="noopener noreferrer">SF Open Data</a>
        </p>
      </footer>
    </div>
  )
}
