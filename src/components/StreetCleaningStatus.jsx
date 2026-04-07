import React from 'react'

/**
 * Displays:
 *  - Active or upcoming cleaning windows (with urgency)
 *  - Full weekly schedule for the parked street
 */
export function StreetCleaningStatus({ activeWindows, schedule, loading, error, onRefresh }) {
  if (loading) {
    return (
      <div className="card status-card loading">
        <span className="spinner" aria-hidden="true" />
        <p>Checking street cleaning schedule…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="card status-card error">
        <p className="error-msg">Could not load schedule: {error}</p>
        <button className="btn btn-secondary btn-sm" onClick={onRefresh}>Retry</button>
      </div>
    )
  }

  return (
    <div className="status-section">
      <ActiveCleaningAlert windows={activeWindows} />
      <FullSchedule entries={schedule} onRefresh={onRefresh} />
    </div>
  )
}

// ─── Active/Upcoming Alert ────────────────────────────────────────────────────

function ActiveCleaningAlert({ windows }) {
  if (windows.length === 0) {
    return (
      <div className="card status-card safe">
        <span className="status-icon" aria-hidden="true">✓</span>
        <div>
          <p className="status-title">No cleaning in the next 2 hours</p>
          <p className="status-sub">You're good for now — we'll alert you when that changes.</p>
        </div>
      </div>
    )
  }

  return (
    <>
      {windows.map((w, i) => {
        const isNow = w.isActive
        const startTime = new Date(w.cleaningStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        const endTime = new Date(w.cleaningEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

        return (
          <div key={i} className={`card status-card ${isNow ? 'danger' : 'warning'}`}>
            <span className="status-icon" aria-hidden="true">{isNow ? '!' : '⚠'}</span>
            <div>
              <p className="status-title">
                {isNow
                  ? `Street cleaning happening NOW until ${endTime}`
                  : `Street cleaning in ${w.minutesUntilStart} min (${startTime}–${endTime})`}
              </p>
              <p className="status-sub">
                {w.blockSide && `${w.blockSide} side · `}
                {w.fromStreet && w.toStreet ? `${w.fromStreet} to ${w.toStreet}` : ''}
              </p>
            </div>
          </div>
        )
      })}
    </>
  )
}

// ─── Full Schedule Table ──────────────────────────────────────────────────────

function FullSchedule({ entries, onRefresh }) {
  if (entries.length === 0) return null

  // Group by day for a cleaner display
  const byDay = entries.reduce((acc, e) => {
    if (!acc[e.weekday]) acc[e.weekday] = []
    acc[e.weekday].push(e)
    return acc
  }, {})

  const orderedDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

  return (
    <div className="card schedule-card">
      <div className="card-header">
        <h2 className="section-title">Weekly Schedule</h2>
        <button className="btn btn-ghost btn-sm" onClick={onRefresh} title="Refresh">↻</button>
      </div>
      <table className="schedule-table">
        <thead>
          <tr>
            <th>Day</th>
            <th>Time</th>
            <th>Weeks</th>
            <th>Side</th>
          </tr>
        </thead>
        <tbody>
          {orderedDays.flatMap((day) =>
            (byDay[day] || []).map((e, i) => (
              <tr key={`${day}-${i}`}>
                <td>{i === 0 ? day : ''}</td>
                <td>{e.rawStartTime}–{e.rawEndTime}</td>
                <td>{formatWeeks(e.weeks)}</td>
                <td>{e.blockSide || '—'}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <p className="data-source">
        Data: <a href="https://data.sfgov.org/Transportation/Street-Sweeping-Schedule/yhqp-riqs"
          target="_blank" rel="noopener noreferrer">SF Open Data</a>
      </p>
    </div>
  )
}

function formatWeeks(weeks) {
  if (!weeks || weeks.length === 0) return '?'
  if (weeks.length === 4 || weeks.length === 5) return 'Every week'
  return weeks.map(ordinal).join(', ')
}

function ordinal(n) {
  return ['1st', '2nd', '3rd', '4th', '5th'][n - 1] || `${n}th`
}
