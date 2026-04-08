import React, { useState } from 'react'

/**
 * Detects iOS and shows a contextual banner explaining notification limitations.
 *
 * On iOS:
 * - Safari: Push notifications require the PWA to be installed to Home Screen
 * - Once installed, notifications fire while the app is in the foreground only
 *   (background push is limited to iOS 16.4+ with Home Screen install)
 */
export function IOSBanner() {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem('ios_banner_dismissed') === '1'
  )

  if (dismissed || !isIOS()) return null

  function dismiss() {
    localStorage.setItem('ios_banner_dismissed', '1')
    setDismissed(true)
  }

  const isInstalled = window.navigator.standalone === true
  const isNewEnoughIOS = getIOSVersion() >= 16.4

  if (isInstalled && isNewEnoughIOS) return null  // Should work fine

  return (
    <div className="banner banner-warning ios-banner">
      <div className="ios-banner-content">
        {!isInstalled ? (
          <>
            <strong>Install to Home Screen for notifications</strong>
            <p>On iOS, push notifications only work when this app is added to your Home Screen.
              Tap the share icon <span className="share-icon">⎋</span> → "Add to Home Screen".</p>
          </>
        ) : (
          <>
            <strong>iOS notifications require iOS 16.4+</strong>
            <p>Your iOS version may not support background push. Notifications will fire
              while the app is open. Update iOS for full support.</p>
          </>
        )}
      </div>
      <button className="btn btn-ghost btn-sm" onClick={dismiss} aria-label="Dismiss">✕</button>
    </div>
  )
}

function isIOS() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)  // iPad on modern iOS
  )
}

function getIOSVersion() {
  const match = navigator.userAgent.match(/OS (\d+)_(\d+)/)
  if (!match) return 0
  return parseFloat(`${match[1]}.${match[2]}`)
}
