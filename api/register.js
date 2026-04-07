/**
 * POST /api/register
 *
 * Saves an FCM token + parked location to Firestore.
 * Called by the client when the user taps "I'm parked here".
 *
 * Body: { fcmToken: string, streetName: string, lat: number, lng: number }
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

initAdminOnce()

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { fcmToken, streetName, lat, lng } = req.body || {}

  if (!fcmToken || !streetName) {
    return res.status(400).json({ error: 'fcmToken and streetName are required' })
  }

  try {
    const db = getFirestore()
    // Use the FCM token as the document ID so re-parking overwrites cleanly
    await db.collection('parked_devices').doc(fcmToken).set({
      fcmToken,
      streetName: streetName.toUpperCase(),
      lat: lat || null,
      lng: lng || null,
      savedAt: new Date().toISOString(),
      lastNotifiedWindow: null
    })

    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('[register]', err)
    return res.status(500).json({ error: 'Failed to register device' })
  }
}

// ─── Firebase Admin ───────────────────────────────────────────────────────────

function initAdminOnce() {
  if (getApps().length > 0) return

  initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Vercel env vars strip newlines — restore them
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    })
  })
}
