import React, { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow
})

const carIcon = new L.DivIcon({
  className: '',
  html: `<div class="map-car-pin" aria-label="Parked car">🚗</div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  popupAnchor: [0, -20]
})

function RecenterMap({ lat, lng }) {
  const map = useMap()
  useEffect(() => {
    map.setView([lat, lng], 17, { animate: true })
  }, [lat, lng, map])
  return null
}

/**
 * Color scheme for street blocks:
 *   Red    — cleaning active right now
 *   Orange — cleaning within 2 hours
 *   Blue   — no cleaning soon (informational)
 */
function blockColor(cnn, activeWindows) {
  const match = activeWindows?.find((w) => w.cnn === cnn)
  if (!match) return { color: '#1a73e8', weight: 4, opacity: 0.7 }
  if (match.isActive) return { color: '#d93025', weight: 5, opacity: 0.9 }
  return { color: '#f9ab00', weight: 5, opacity: 0.9 }
}

/**
 * @param {object} props.location     - { lat, lng, accuracy, streetName, fullAddress }
 * @param {ScheduleEntry[]} props.schedule  - full schedule (for drawing blocks)
 * @param {ActiveCleaning[]} props.activeWindows
 */
export function ParkingMap({ location, schedule, activeWindows }) {
  if (!location) return null

  const { lat, lng, accuracy, fullAddress, streetName } = location
  const isActive  = activeWindows?.some((w) => w.isActive)
  const hasAlert  = activeWindows?.length > 0

  // Deduplicate blocks by CNN — multiple schedule rows share the same physical block
  const uniqueBlocks = []
  const seenCNNs = new Set()
  for (const entry of (schedule || [])) {
    if (entry.coordinates && !seenCNNs.has(entry.cnn)) {
      seenCNNs.add(entry.cnn)
      uniqueBlocks.push(entry)
    }
  }

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

        {/* GPS accuracy radius — helps user understand position precision */}
        {accuracy && (
          <Circle
            center={[lat, lng]}
            radius={accuracy}
            pathOptions={{ color: '#1a73e8', fillColor: '#1a73e8', fillOpacity: 0.06, weight: 1, dashArray: '4' }}
          />
        )}

        {/* Draw each matched street block as a Polyline */}
        {uniqueBlocks.map((block) => {
          const style  = blockColor(block.cnn, activeWindows)
          const active = activeWindows?.find((w) => w.cnn === block.cnn)
          const label  = active
            ? active.isActive
              ? `Cleaning NOW until ${new Date(active.cleaningEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : `Cleaning at ${new Date(active.cleaningStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            : `${block.streetName} — no cleaning soon`

          return (
            <Polyline
              key={block.cnn}
              positions={block.coordinates}
              pathOptions={style}
            >
              <Popup>
                <strong>{block.streetName}</strong>
                {block.limits && <><br /><span style={{ fontSize: '0.8em', color: '#555' }}>{block.limits}</span></>}
                {block.blockSide && <><br /><span style={{ fontSize: '0.8em', color: '#555' }}>{block.blockSide} side</span></>}
                <br />
                <span style={{ fontSize: '0.85em', fontWeight: 600, color: style.color }}>{label}</span>
                {block.distanceMeters != null && (
                  <><br /><span style={{ fontSize: '0.75em', color: '#888' }}>{block.distanceMeters}m from your pin</span></>
                )}
              </Popup>
            </Polyline>
          )
        })}

        {/* Car marker */}
        <Marker position={[lat, lng]} icon={carIcon}>
          <Popup>
            <strong>{streetName || 'Parked here'}</strong>
            {fullAddress && <><br /><span style={{ fontSize: '0.8em', color: '#666' }}>{fullAddress}</span></>}
            {hasAlert && (
              <>
                <br />
                <span style={{ color: isActive ? '#d93025' : '#7a5900', fontWeight: 600, fontSize: '0.85em' }}>
                  {isActive ? '⚠ Street cleaning NOW' : '⏰ Street cleaning soon'}
                </span>
              </>
            )}
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  )
}
