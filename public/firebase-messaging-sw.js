/**
 * Firebase Messaging Service Worker
 *
 * Firebase SDK looks for this file at /firebase-messaging-sw.js
 * It handles FCM push messages when the app is in the background or closed.
 *
 * IMPORTANT: This file runs in the SW context — no ES module imports.
 * Must use importScripts() with the Firebase compat CDN build.
 */

importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey:            'AIzaSyC82nWAVT1ZnhuCaAsLqEygnATJ6x89HSk',
  authDomain:        'street-parking-alert-sf.firebaseapp.com',
  projectId:         'street-parking-alert-sf',
  storageBucket:     'street-parking-alert-sf.firebasestorage.app',
  messagingSenderId: '1092613533096',
  appId:             '1:1092613533096:web:71b5f4c755dc37fec4819d'
})

const messaging = firebase.messaging()

// Handle background push messages
messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {}

  self.registration.showNotification(title || 'SF Parking Alert', {
    body: body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: 'street-cleaning-alert',
    requireInteraction: true,
    data: { url: '/' }
  })
})

// Re-open or focus the app when a notification is tapped
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus()
        }
      }
      return clients.openWindow('/')
    })
  )
})
