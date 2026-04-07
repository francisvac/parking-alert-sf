import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  server: {
    host: true,   // bind to 0.0.0.0 so Docker can expose the port
    port: 5173
  },
  preview: {
    host: true,
    port: 4173
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Custom service worker file that handles notification scheduling
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      manifest: {
        name: 'SF Parking Alert',
        short_name: 'ParkAlert',
        description: 'Get notified before street cleaning hits your parked car in San Francisco',
        theme_color: '#1a73e8',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}']
      }
    })
  ]
})
