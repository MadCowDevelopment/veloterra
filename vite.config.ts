import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { copyFileSync, createReadStream } from 'node:fs'
import { resolve } from 'node:path'

// MapLibre GL v6 runs tile parsing in web workers; the worker bundle must be
// copied into dist/ so the built app can locate it at runtime.
const maplibreWorker = resolve('node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs')
const maplibreShared = resolve('node_modules/maplibre-gl/dist/maplibre-gl-shared.mjs')

export default defineConfig(({ command }) => {
  // Local development has its own host and needs no repository subpath.
  // Deployment workflows override the production-safe build fallback.
  const base = process.env.BASE_URL ?? (command === 'serve' ? '/' : '/veloterra/')

  return {
    base,
    define: {
      __BUILD_REVISION__: JSON.stringify(process.env.GITHUB_SHA?.slice(0, 7) ?? 'local'),
      __BUILD_TIMESTAMP__: JSON.stringify(new Date().toISOString()),
    },
    plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon-48x48.png', 'apple-touch-icon.png', 'logo.svg', 'maplibre-gl-worker.mjs'],
      manifest: {
        name: 'VeloTerra',
        short_name: 'VeloTerra',
        description: 'Ride your bike, uncover the fog of war, earn coins.',
        theme_color: '#0a0e14',
        background_color: '#0a0e14',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        categories: ['navigation', 'sports', 'games'],
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,mjs}', 'assets/maplibre-gl-worker.mjs'],
        navigateFallback: `${base}index.html`,
        runtimeCaching: [
          {
            // Best-effort offline: cache basemap tiles/fonts/sprites as visited.
            urlPattern: ({ url }) => url.host === 'tiles.openfreemap.org',
            handler: 'CacheFirst',
            options: {
              cacheName: 'basemap-openfreemap',
              expiration: { maxEntries: 60000, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
    // GitHub Pages has no SPA rewrite; serve index.html for unknown deep links.
    {
      name: 'spa-404-fallback',
      configureServer(server) {
        const workerAssets = new Map([
          ['maplibre-gl-worker.mjs', maplibreWorker],
          ['maplibre-gl-shared.mjs', maplibreShared],
        ])
        server.middlewares.use((request, response, next) => {
          const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
          const name = pathname.split('/').pop() ?? ''
          const file = workerAssets.get(name)
          if (!file || !pathname.includes('/assets/')) return next()
          response.statusCode = 200
          response.setHeader('Content-Type', 'text/javascript')
          createReadStream(file).pipe(response)
        })
      },
      writeBundle(options) {
        const dir = options.dir ?? 'dist'
        // MapLibre v6 resolves the worker from <base>/assets/, so copy it there
        // rather than the dist root.
        copyFileSync(maplibreWorker, resolve(dir, 'assets', 'maplibre-gl-worker.mjs'))
        copyFileSync(maplibreShared, resolve(dir, 'assets', 'maplibre-gl-shared.mjs'))
        copyFileSync(resolve(dir, 'index.html'), resolve(dir, '404.html'))
      },
    },
    ],
  }
})
