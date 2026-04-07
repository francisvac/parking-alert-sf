import React from 'react'

/**
 * Shows the currently saved parking location.
 */
export function SavedLocation({ location }) {
  if (!location) return null

  const savedAt = new Date(location.savedAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  })

  const mapsUrl = `https://www.google.com/maps?q=${location.lat},${location.lng}`

  return (
    <div className="card location-card">
      <div className="card-header">
        <span className="badge badge-blue">Parked</span>
        <span className="timestamp">Saved at {savedAt}</span>
      </div>
      <p className="street-name">{location.fullAddress || location.streetName}</p>
      <p className="coords">
        {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
        {location.accuracy && (
          <span className="accuracy"> ±{Math.round(location.accuracy)}m</span>
        )}
      </p>
      <a
        className="map-link"
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        Open in Google Maps →
      </a>
    </div>
  )
}
