import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Register the service worker (handled by vite-plugin-pwa)
import { registerSW } from 'virtual:pwa-register'

registerSW({
  onNeedRefresh() {
    // A new version is available — could show a toast prompting the user to reload
    console.info('[PWA] New version available. Reload to update.')
  },
  onOfflineReady() {
    console.info('[PWA] App ready for offline use.')
  }
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
