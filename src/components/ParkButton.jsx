import React from 'react'

/**
 * Big action button — "I'm parked here" / "Clear parking"
 */
export function ParkButton({ onPark, onClear, isParked, isLocating }) {
  if (isParked) {
    return (
      <div className="park-actions">
        <button className="btn btn-secondary" onClick={onClear}>
          Clear Parking Spot
        </button>
      </div>
    )
  }

  return (
    <button
      className="btn btn-primary btn-large"
      onClick={onPark}
      disabled={isLocating}
    >
      {isLocating ? (
        <>
          <span className="spinner" aria-hidden="true" />
          Getting your location…
        </>
      ) : (
        <>
          <span className="icon" aria-hidden="true">P</span>
          I'm parked here
        </>
      )}
    </button>
  )
}
