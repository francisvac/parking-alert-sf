/**
 * Reverse geocoding using Nominatim (OpenStreetMap) — free, no API key required.
 *
 * Converts GPS coordinates → street name/address for use with the SF Open Data API.
 *
 * Rate limit: 1 request/second per Nominatim usage policy.
 * For production scale, consider using Google Maps Geocoding API or Mapbox.
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse'

/**
 * Reverse geocode a lat/lng to a street address in San Francisco.
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<{streetName: string, fullAddress: string, blockNumber: string}>}
 */
export async function reverseGeocode(lat, lng) {
  const params = new URLSearchParams({
    lat: lat.toString(),
    lon: lng.toString(),
    format: 'jsonv2',
    addressdetails: '1',
    zoom: '17'  // street-level precision
  })

  const response = await fetch(`${NOMINATIM_URL}?${params}`, {
    headers: {
      // Nominatim requires a User-Agent identifying your app
      'User-Agent': 'SF-Parking-Alert/1.0 (contact@example.com)'
    }
  })

  if (!response.ok) {
    throw new Error(`Geocoding failed: ${response.statusText}`)
  }

  const data = await response.json()

  if (!data.address) {
    throw new Error('No address found for this location.')
  }

  const address = data.address
  const streetName = (address.road || address.pedestrian || address.path || '').toUpperCase()
  const blockNumber = address.house_number || ''
  const fullAddress = data.display_name || ''

  if (!streetName) {
    throw new Error('Could not determine street name for this location.')
  }

  return { streetName, blockNumber, fullAddress }
}
