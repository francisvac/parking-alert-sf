# SF Parking Alert — PWA

A Progressive Web App that saves your parking spot and alerts you before street cleaning happens.

## How it works

1. You tap **"I'm parked here"** — the app saves your GPS coordinates and reverse-geocodes them to a street name.
2. It queries the [SF Open Data street sweeping schedule](https://data.sfgov.org/Transportation/Street-Sweeping-Schedule/yhqp-riqs) for that street.
3. If cleaning is happening now or within 2 hours, a push notification fires.
4. The schedule is re-checked every 5 minutes while the browser is running.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | React + Vite | Fast dev, small bundle |
| PWA | vite-plugin-pwa + Workbox | Precaching, service worker, manifest |
| Geolocation | Browser Geolocation API | Native, no dependencies |
| Reverse geocoding | Nominatim (OpenStreetMap) | Free, no API key |
| Street cleaning data | SF Open Data (Socrata) | Free, official city data |
| Notifications | Web Notifications API + Service Worker | Works on Android Chrome |

## Local development

```bash
npm install
cp .env.example .env
npm run dev
# or with Docker:
docker compose --profile dev up
```

Open on your phone via your local IP: `http://192.168.x.x:5173`

To install as a PWA on Android: open in Chrome → menu → "Add to Home screen".

## Deploy for free (production)

### Option A — Vercel (recommended, no Docker required)

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → Import project → select the repo
3. Framework preset: **Vite** — Vercel auto-detects it
4. Add env var `VITE_SF_APP_TOKEN` if you have one (optional)
5. Click Deploy

Vercel gives you a public HTTPS URL immediately (e.g. `parking-alert-sf.vercel.app`).
Open it on your phone, tap "Add to Home Screen", and it works as a native-feeling PWA.

### Option B — Fly.io (Docker-based, free tier)

```bash
# Install flyctl: https://fly.io/docs/hands-on/install-flyctl/
fly auth login

# First deploy — edit app name in fly.toml first (must be globally unique)
fly launch --no-deploy        # reads fly.toml, creates the app
fly deploy                    # builds Docker image and deploys

# Subsequent deploys
fly deploy
```

Your app gets a free `<appname>.fly.dev` HTTPS URL. Free tier includes 3 VMs and
auto-scales to zero when idle so you won't be charged.

## Notification support

| Platform | Behaviour |
|---|---|
| Android Chrome | Full support — notifications fire even when browser is backgrounded |
| Android Firefox | Works while browser is open/backgrounded |
| iOS Safari | Requires the PWA to be added to Home Screen; limited background support |
| Desktop Chrome/Edge | Works while browser is running |

### True background notifications (locked phone)

For notifications when the phone screen is off and the browser is closed, you need a push server:

1. Set up **Firebase Cloud Messaging (FCM)**
2. Add your VAPID key to `.env` as `VITE_FCM_VAPID_KEY`
3. Deploy a small backend (Cloud Functions / Vercel edge function) that:
   - Subscribes users to push topics
   - Runs a cron job against the SF Open Data API
   - Sends FCM push messages to subscribed users near upcoming cleaning events

## Extending beyond SF

The `sfApi.js` service is the only SF-specific layer. To support other cities:
- Find their open data street sweeping dataset
- Adapt the `fetchScheduleForStreet()` and `parseEntry()` functions
- Or use a unified national dataset if available

## Project structure

```
src/
  services/
    geolocation.js      GPS + localStorage persistence
    geocoding.js        Nominatim reverse geocoding
    sfApi.js            SF Open Data street sweeping API
    notifications.js    Web Push + Service Worker messaging
  hooks/
    useParking.js       Park/unpark flow
    useStreetCleaning.js Schedule fetching + notification scheduling
  components/
    ParkButton.jsx
    SavedLocation.jsx
    StreetCleaningStatus.jsx
    NotificationPermission.jsx
  sw.js                 Service Worker (Workbox + notification scheduling)
```
