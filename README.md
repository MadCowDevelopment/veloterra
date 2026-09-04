# VeloTerra 🚲🗺️

Ride your bike, uncover the **fog of war**, and earn coins. An offline-first, installable
web app (PWA) — no app store, no native build.

> Full design and roadmap: see [PLAN.md](PLAN.md).

## Status — Milestone 0 (scaffold)

- Installable PWA (Vite + React + TypeScript)
- Branded main menu with **Start Ride**
- Live ride view: dark OSM map (MapLibre) + real GPS position + placeholder fog overlay
- Wallet / Settings placeholders
- Auto-deploy to GitHub Pages on push to `main`

Coins, real H3 fog-of-war, and offline map downloads arrive in later milestones.

## Develop

```bash
npm install
npm run dev
```

Open the printed URL. To test GPS on your phone over WiFi you need HTTPS — the easiest way
is a quick tunnel, e.g. `npx cloudflared tunnel --url http://localhost:5173`, then open the
`https://` link on the phone.

## Build

```bash
npm run build
npm run preview
```

## Deploy

Pushing to `main` triggers the GitHub Actions workflow in
[.github/workflows/deploy.yml](.github/workflows/deploy.yml), which builds and publishes to
GitHub Pages. Enable it once via **Settings → Pages → Source: GitHub Actions**.

## Tech

MapLibre GL JS · OpenStreetMap data · vite-plugin-pwa (Workbox) · Zustand · React Router.

Map data © OpenStreetMap contributors, © CARTO.
