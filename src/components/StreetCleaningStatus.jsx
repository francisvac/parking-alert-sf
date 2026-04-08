import React from 'react'

/**
 * Displays:
 *  - Active or upcoming cleaning windows (with urgency)
 *  - Full weekly schedule for the parked street
 *  - Last updated timestamp
 */
export function StreetCleaningStatus({ activeWindows, schedule, loading, error, onRefresh, lastUpdated }) {
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
        <p className="error-msg">{friendlyError(error)}</p>
        <button className="btn btn-secondary btn-sm" onClick={onRefresh}>Retry</button>
      </div>
    )
  }

  return (
    <div className="status-section">
      <ActiveCleaningAlert windows={activeWindows} />
      <FullSchedule entries={schedule} onRefresh={onRefresh} lastUpdated={lastUpdated} />
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
        const isNow     = w.isActive
        const startTime = new Date(w.cleaningStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        const endTime   = new Date(w.cleaningEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

        return (
          <div key={i} className={`card status-card ${isNow ? 'danger' : 'warning'}`}>
            <span className="status-icon" aria-hidden="true">{isNow ? '⚠' : '⏰'}</span>
            <div>
              <p className="status-title">
                {isNow
                  ? `Street cleaning NOW until ${endTime}`
                  : `Street cleaning in ${w.minutesUntilStart} min (${startTime}–${endTime})`}
              </p>
              {(w.limits || w.blockSide) && (
                <p className="status-sub">
                  {w.limits && <span>{w.limits}</span>}
                  {w.limits && w.blockSide && ' · '}
                  {w.blockSide && <span>{w.blockSide} side</span>}
                </p>
              )}
              {w.appliesToHolidays === false && (
                <p className="status-sub holiday-note">Suspended on SF holidays</p>
              )}
            </div>
          </div>
        )
      })}
    </>
  )
}

// ─── Full Schedule Table ──────────────────────────────────────────────────────

function FullSchedule({ entries, onRefresh, lastUpdated }) {
  if (entries.length === 0) return null

  // Group by weekday for display
  const DAY_ORDER = ['Mon','Tues','Wed','Thur','Fri','Sat','Sun']
  const byDay = entries.reduce((acc, e) => {
    const abbr = e.weekday
    ;(acc[abbr] = acc[abbr] || []).push(e)
    return acc
  }, {})

  const lastUpdatedStr = lastUpdated
    ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="card schedule-card">
      <div className="card-header">
        <h2 className="section-title">Weekly Schedule</h2>
        <div className="header-right">
          {lastUpdatedStr && <span className="last-updated">Updated {lastUpdatedStr}</span>}
          <button className="btn btn-ghost btn-sm" onClick={onRefresh} title="Refresh">↻</button>
        </div>
      </div>
      <table className="schedule-table">
        <thead>
          <tr>
            <th>Day</th>
            <th>Time</th>
            <th>Weeks</th>
            <th>Block</th>
          </tr>
        </thead>
        <tbody>
          {DAY_ORDER.flatMap((abbr) =>
            (byDay[abbr] || []).map((e, i) => (
              <tr key={`${abbr}-${i}`}>
                <td>{i === 0 ? expandDay(abbr) : ''}</td>
                <td className="time-cell">{e.rawStartTime}–{e.rawEndTime}</td>
                <td>{formatWeeks(e.weeks)}</td>
                <td className="limits-cell">{e.limits || '—'}</td>
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAY_FULL = { Mon:'Monday', Tues:'Tuesday', Wed:'Wednesday', Thur:'Thursday', Fri:'Friday', Sat:'Saturday', Sun:'Sunday' }
const expandDay = (abbr) => DAY_FULL[abbr] || abbr

function formatWeeks(weeks) {
  if (!weeks?.length) return '?'
  if (weeks.length >= 4) return 'Every week'
  return weeks.map((n) => ['1st','2nd','3rd','4th','5th'][n - 1] || `${n}th`).join(', ')
}

function friendlyError(msg) {
  if (msg?.includes('429') || msg?.includes('Too Many Requests')) {
    return 'Rate limit reached. Try again in a few minutes, or add an SF Open Data token in settings.'
  }
  if (msg?.includes('timed out')) {
    return 'SF Open Data took too long to respond. Check your connection and retry.'
  }
  return `Could not load schedule: ${msg}`
}
