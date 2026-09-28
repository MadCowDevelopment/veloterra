# VeloTerra

Ride your bike, uncover the map, and earn coins. VeloTerra is an installable,
offline-first web app built around a real-world fog-of-war map.

**Live app:** [madcowdevelopment.github.io/veloterra](https://madcowdevelopment.github.io/veloterra/)
**Dev build:** [madcowdevelopment.github.io/velonext](https://madcowdevelopment.github.io/velonext/) (MapLibre GL v6 + worker fix, from the `dev` branch)

## Documentation

- [Software architecture](Architecture/README.md) — current arc42 SAD, diagrams, quality scenarios, risks, and ADRs
- [Project plan](PLAN.md) — future requirements, ideas, experiments, and open questions
- `MANUAL.md` — planned user-facing installation and usage guide

## What works today

- Foreground GPS ride tracking with start, pause, resume, and finish controls
- Persistent H3 fog of war that reveals the map as you ride
- Coins for new exploration and cooldown-based revisit rewards
- Live distance, speed, duration, GPS accuracy, and ride earnings
- Ride history and summaries with route, average speed, and maximum speed
- Multiple live-switchable MapLibre map styles
- Downloadable offline map regions with size estimates and saved-area management
- Local-first storage for explored cells, rides, wallet, and preferences
- Optional Google or Microsoft sign-in to back up and merge progress across devices with Supabase
- Installable PWA with automatic deployment to GitHub Pages

Tracking is intentionally foreground-only. The Wake Lock API keeps the screen awake
during an active ride, but a pure PWA cannot continue collecting GPS positions after the
browser is suspended or the screen is turned off.

## Planned work

- A directional user marker and optional heading-up map rotation
- Rebalancing hex size and reveal width based on real-ride visibility
- Automatic reveal of completed or fully surrounded areas
- A combined map of all users' explored territory, with privacy rules defined first
- Units settings and the separate coin-spending game

See [PLAN.md](PLAN.md) for design details, open questions, and the longer roadmap.

## Develop

```bash
npm install
npm run dev
```

Open the printed URL. To test GPS on your phone over WiFi you need HTTPS — the easiest way
is a production preview or deployed build. The Vite development server automatically uses
simulated GPS; click the map to move the rider through the normal ride-processing path.

The development server does not register the service worker, so offline map downloads
must be tested from a production preview or the installed GitHub Pages app.

## Build

```bash
npm run build
npm run preview
```

`npm run build` is the current compile validation. The standalone `npm run typecheck`
command is known to fail because `--noEmit` conflicts with the referenced composite config.

The production build uses the `/veloterra/` base path expected by GitHub Pages. Local
preview URLs therefore include that path.

## Dev branch build

The `dev` branch is a separate, in-progress build that deploys to
[velonext](https://madcowdevelopment.github.io/velonext/) on its own GitHub Pages
site. GitHub Pages serves one site per repository, so the built artifact is pushed to
the dedicated `velonext` repository's `gh-pages` branch by the
`.github/workflows/deploy-dev.yml` workflow.

The base path is env-driven. The local development server uses `/`, local builds
default to `/veloterra/`, and both deployment workflows explicitly set and verify
their target (`/veloterra/` for `main`, `/velonext/` for `dev`) before publishing.

## Offline behavior

The app shell is precached. OpenFreeMap vector tiles are cached as they are viewed, and
the Offline Maps screen can explicitly download a selected region through zoom level 14.
Each download is capped at 100 MB and can be removed independently later.

Offline downloads rely on the service worker and therefore do not persist while using
`npm run dev`. Download the area before riding somewhere without coverage.

## Data and sync

Progress is stored locally in IndexedDB and does not require an account. Google or Microsoft sign-in
is optional; when enabled, explored cells and rides are merged across devices and wallet
progress is reconciled through Supabase. Individual ride traces and live locations are
not published as a social map.

## Deploy

Pushing to `main` triggers the GitHub Actions workflow in
[.github/workflows/deploy.yml](.github/workflows/deploy.yml), which builds and publishes to
GitHub Pages. Enable it once via **Settings → Pages → Source: GitHub Actions**.

## Tech

React · TypeScript · Vite · MapLibre GL JS · H3 · Dexie · Zustand · React Router ·
vite-plugin-pwa (Workbox) · Supabase.

Map data © OpenStreetMap contributors, served by OpenFreeMap.
