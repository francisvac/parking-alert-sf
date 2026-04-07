import React, { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix Leaflet's default marker icons broken by bundlers (missing asset URLs)
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow
})

// Custom blue car marker pin
const carIcon = new L.DivIcon({
  className: '',
  html: `<div class="map-car-pin" aria-label="Parked car">🚗</div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  popupAnchor: [0, -20]
})

/**
 * Smoothly re-centres the map whenever the position changes.
 */
function RecenterMap({ lat, lng }) {
  const map = useMap()
  useEffect(() => {
    map.setView([lat, lng], 17, { animate: true })
  }, [lat, lng, map])
  return null
}

/**
 * Displays the saved parking location on an OpenStreetMap tile layer.
 *
 * @param {object} props.location - { lat, lng, accuracy, streetName, fullAddress }
 * @param {ActiveCleaning[]} props.activeWindows - from useStreetCleaning
 */
export function ParkingMap({ location, activeWindows }) {
  if (!location) return null

  const { lat, lng, accuracy, fullAddress, streetName } = location
  const hasAlert = activeWindows && activeWindows.length > 0
  const isActive = hasAlert && activeWindows.some((w) => w.isActive)

  const circleColor = isActive ? '#d93025' : hasAlert ? '#f9ab00' : '#1a73e8'

  return (
    <div className={`map-wrapper ${isActive ? 'map-danger' : hasAlert ? 'map-warning' : ''}`}>
      <MapContainer
        center={[lat, lng]}
        zoom={17}
        zoomControl={true}
        scrollWheelZoom={false}
        className="parking-map"
        attributionControl={true}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          maxZoom={19}
        />

        <RecenterMap lat={lat} lng={lng} />

        {/* GPS accuracy radius */}
        {accuracy && (
          <Circle
            center={[lat, lng]}
            radius={accuracy}
            pathOptions={{ color: circleColor, fillColor: circleColor, fillOpacity: 0.08, weight: 1.5 }}
          />
        )}

        {/* Parking marker */}
        <Marker position={[lat, lng]} icon={carIcon}>
          <Popup>
            <strong>{streetName || 'Parked here'}</strong>
            {fullAddress && <><br /><span style={{ fontSize: '0.8em', color: '#666' }}>{fullAddress}</span></>}
            {hasAlert && (
              <>
                <br />
                <span style={{ color: isActive ? '#d93025' : '#7a5900', fontWeight: 600, fontSize: '0.85em' }}>
                  {isActive ? '⚠ Street cleaning NOW' : '⚠ Street cleaning soon'}
                </span>
              </>
            )}
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  )
}
