import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Installable app + light offline: the app shell is cached so LaunchPage
// opens without a connection. Data still lives in Supabase.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['launchpage-logo.png', 'favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'LaunchPage',
        short_name: 'LaunchPage',
        description: 'Personal self-management: plan the day, launch into it, prove you did it.',
        theme_color: '#191428',
        background_color: '#191428',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin.includes('fonts.g'),
            handler: 'CacheFirst',
            options: { cacheName: 'fonts', expiration: { maxEntries: 20 } }
          }
        ]
      }
    })
  ]
});
