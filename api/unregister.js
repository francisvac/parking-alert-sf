/**
 * POST /api/unregister
 *
 * Removes an FCM token from Firestore.
 * Called when the user taps "Clear Parking Spot".
 *
 * Body: { fcmToken: string }
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

initAdminOnce()

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { fcmToken } = req.body || {}
  if (!fcmToken) return res.status(400).json({ error: 'fcmToken is required' })

  try {
    const db = getFirestore()
    await db.collection('parked_devices').doc(fcmToken).delete()
    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('[unregister]', err)
    return res.status(500).json({ error: 'Failed to unregister device' })
  }
}

function initAdminOnce() {
  if (getApps().length > 0) return
  initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    })
  })
}
