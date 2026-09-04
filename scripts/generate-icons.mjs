// One-off icon generator: rasterizes public/logo.svg into the PWA icon set.
// Run with: node scripts/generate-icons.mjs
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(resolve(root, 'public/logo.svg'))
const out = (name) => resolve(root, 'public', name)
const BG = '#0a0e14'

const render = (size) => sharp(svg, { density: 384 }).resize(size, size)

await render(192).png().toFile(out('pwa-192x192.png'))
await render(512).png().toFile(out('pwa-512x512.png'))
await render(180).png().toFile(out('apple-touch-icon.png'))

// Maskable: full-bleed background with the logo inset into the safe zone.
const inner = Math.round(512 * 0.72)
const logo = await sharp(svg, { density: 384 }).resize(inner, inner).png().toBuffer()
await sharp({
  create: { width: 512, height: 512, channels: 4, background: BG },
})
  .composite([{ input: logo, gravity: 'center' }])
  .png()
  .toFile(out('maskable-icon-512x512.png'))

// Favicon
await render(48).png().toFile(out('favicon-48x48.png'))

console.log('Icons generated in public/')
