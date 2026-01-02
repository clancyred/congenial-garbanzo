import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // Use relative base so the build works under GitHub Pages sub-paths.
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'inline',
      includeAssets: ['icons/fishbowl.svg'],
      manifest: {
        name: 'Fishbowl',
        short_name: 'Fishbowl',
        description: 'Fishbowl party game (pass-and-play).',
        theme_color: '#0ea5e9',
        background_color: '#0b1220',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          {
            src: 'icons/fishbowl.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // SPA fallback for GitHub Pages refreshes.
        navigateFallback: 'index.html',
      },
    }),
  ],
})
