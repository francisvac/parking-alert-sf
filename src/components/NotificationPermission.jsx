import React, { useState } from 'react'
import { requestNotificationPermission, getNotificationPermission } from '../services/notifications'

/**
 * Banner that prompts the user to enable notifications.
 * Disappears once permission is granted or permanently denied.
 */
export function NotificationPermission({ onGranted }) {
  const [permission, setPermission] = useState(getNotificationPermission)
  const [requesting, setRequesting] = useState(false)

  if (permission === 'granted' || permission === 'unsupported') return null

  async function handleRequest() {
    setRequesting(true)
    try {
      const result = await requestNotificationPermission()
      setPermission(result)
      if (result === 'granted' && onGranted) onGranted()
    } finally {
      setRequesting(false)
    }
  }

  if (permission === 'denied') {
    return (
      <div className="banner banner-warning">
        <p>
          Notifications are blocked. To receive street cleaning alerts, enable
          notifications for this site in your browser settings.
        </p>
      </div>
    )
  }

  return (
    <div className="banner banner-info">
      <p>Enable notifications to get alerted before street cleaning hits your car.</p>
      <button className="btn btn-primary btn-sm" onClick={handleRequest} disabled={requesting}>
        {requesting ? 'Requesting…' : 'Enable Notifications'}
      </button>
    </div>
  )
}
