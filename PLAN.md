# Bike Fog-of-War Explorer — Project Plan

> A mobile web app (PWA) for exploring the real world by bike. The map starts hidden
> under a "fog of war". As you ride, the area around you is revealed and you earn coins.
> Coins are later spent in a separate builder/RPG mini-game. Everything runs **on the
> phone, offline-first**, with cloud/social features left as a future option.

---

## 1. Goals & Scope

### Core experience (what we build first)
- Open app → **Main Menu** → tap **Start Ride** → immediately see map + start tracking.
- Map is covered by fog; riding **uncovers** the area around your live GPS position.
- **Earn coins** for newly revealed areas.
- Revisiting already-explored areas gives a **reduced** coin reward.
- Works **without internet** while riding (map tiles pre-downloaded on device).
- Keep a **wallet** (coin balance) and basic **ride history** — all stored locally.

### Explicitly later (designed for, not built yet)
- The "spend coins" game (town builder / RPG). Kept as a **separate, pluggable module**.
- Cloud sync, accounts, friends, leaderboards, shared maps.

### Non-goals for now
- No app store publishing.
- No background tracking with the screen off (foreground + screen-on is enough).
- No native code — pure web, installable as a PWA.

---

## 2. Key Decisions (from clarification)

| Topic | Decision |
|---|---|
| Platform | Android, Chrome |
| Distribution | Installable **PWA** (Add to Home Screen). No app store, no Capacitor for now. |
| Offline maps | **Yes, strongly preferred.** Vector tiles stored on-device via **PMTiles**. |
| Tracking | Foreground only; **Wake Lock** keeps the screen on during a ride. |
| Hosting | Build once, deploy to a **free static host** (GitHub Pages) only to install it. After install, the app runs **entirely on the phone** offline. |
| Framework | React + TypeScript + Vite (my recommendation). |

> **Why a PWA still needs a host once:** A PWA has to be loaded from an `https://` URL
> the first time so the browser can install it and cache everything via a service worker.
> After that first load, all code + assets + map data live on the phone and it works with
> the network off. GitHub Pages is free and needs no signup beyond the GitHub account you
> already have (this repo is under `github/Bike`).

---

## 3. Recommended Tech Stack

| Concern | Choice | Why |
|---|---|---|
| Map styles | Multiple MapLibre styles (Dark/Light/etc.), switchable at runtime | Quick in-map toggle; fog + position re-applied on style change. |
| Language | **TypeScript** | Safer refactors as the game grows. |
| UI framework | **React** + **Vite** | Fast dev, huge ecosystem, easy PWA integration. |
| Map rendering | **MapLibre GL JS** | Free/open, WebGL vector maps, no API keys, great offline story. |
| Offline map data | **PMTiles** (Protomaps) | Single-file tile archive readable directly in the browser — ideal for offline. |
| Map style/data source | **Protomaps basemap** extract | Download a region as one `.pmtiles` file. |
| Exploration grid | **H3** (`h3-js`) | Hexagonal grid → clean "cell explored?" logic + coin rewards. |
| Geo math | **Turf.js** (subset) | Distance, along-track calcs for smooth reveals. |
| Local storage | **Dexie** (IndexedDB) | Durable structured storage for rides, cells, wallet. |
| App state | **Zustand** | Tiny, simple global store; no boilerplate. |
| PWA / offline shell | **vite-plugin-pwa** (Workbox) | Service worker, precache, installability, updates. |
| Screen awake | **Wake Lock API** | Keep screen on while riding. |
| Positioning | **Geolocation API** (`watchPosition`) | Continuous GPS while foregrounded. |
| Routing (screens) | **React Router** | Menu / Ride / Wallet / (later) Game screens. |

### Why H3 hexagons for the fog
Instead of tracking thousands of raw GPS points, we snap position to a **hex grid**.
Each hexagon is one "tile of the world". This gives us, for free:
- A natural unit to reveal ("this hex is now explored").
- A natural unit to reward ("new hex = full coins, seen-before hex = reduced").
- Efficient storage (store a set of hex IDs, not a point cloud).
- Easy fog rendering (fill the world dark, punch holes where hexes are explored).

Suggested resolution: **H3 res 10** (~65 m edge, ~0.015 km² per hex) as a starting point —
tune later for how "chunky" the reveal feels.

---

## 4. Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                        PWA (installed on phone)               │
│                                                               │
│  React UI                                                     │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐   │
│  │ Main Menu │  │   Ride    │  │  Wallet   │  │  Game     │   │
│  │           │  │  (map)    │  │ (coins)   │  │ (later)   │   │
│  └───────────┘  └─────┬─────┘  └───────────┘  └───────────┘   │
│                       │                                       │
│  ┌────────────────────▼────────────────────────────────┐     │
│  │              Domain / Services layer                 │     │
│  │  RideTracker · Explorer(H3) · CoinEconomy · Wallet   │     │
│  └───────┬───────────────┬───────────────┬──────────────┘     │
│          │               │               │                   │
│   Geolocation      MapLibre + PMTiles   Dexie (IndexedDB)     │
│   + Wake Lock      (offline tiles)      rides/cells/wallet    │
│                                                               │
│  Service Worker (Workbox): app shell + assets cached offline  │
└──────────────────────────────────────────────────────────────┘
```

### Layers
1. **UI (React screens/components)** — dumb-ish, reads from store, dispatches actions.
2. **State (Zustand)** — current ride, live position, wallet balance, fog data in view.
3. **Domain services** — pure-ish logic, testable without UI:
   - `RideTracker` — start/stop, subscribe to GPS, build the ride path, compute distance.
   - `Explorer` — convert GPS → H3 cells, decide which cells are newly revealed.
   - `CoinEconomy` — decide coin reward per cell (new vs revisit rules).
   - `WalletService` — balance, transactions/ledger.
4. **Persistence (Dexie/IndexedDB)** — rides, explored cells, wallet, settings.
5. **Map (MapLibre + PMTiles)** — base tiles + the fog overlay layer.
6. **Service Worker** — makes the whole app installable and offline.

---

## 5. Data Model (local, IndexedDB via Dexie)

```ts
// Explored world — the source of truth for fog + rewards
interface ExploredCell {
  h3: string;          // H3 index (primary key)
  firstVisited: number;// epoch ms — when first revealed
  lastVisited: number; // epoch ms — most recent visit
  visits: number;      // how many rides/sessions touched it
  coinsAwarded: number;// running total earned from this cell
}

// A single ride session
interface Ride {
  id: string;
  startedAt: number;
  endedAt?: number;
  distanceM: number;        // meters
  newCells: number;         // cells first revealed on this ride
  coinsEarned: number;
  // Path stored downsampled to keep storage small
  path: Array<{ t: number; lat: number; lng: number; acc: number }>;
}

// Wallet + ledger
interface Wallet { id: 'wallet'; balance: number; }
interface LedgerEntry {
  id: string; t: number; delta: number;
  reason: 'explore' | 'revisit' | 'spend' | 'bonus';
  rideId?: string;
}

interface Settings {
  id: 'settings';
  hexResolution: number;    // default 10
  revealRadiusM: number;    // how far around you gets revealed (e.g. 80 m)
  units: 'metric' | 'imperial';
}
```

---

## 6. Coin Economy (initial rules — easy to tune)

- **New hex revealed:** `+10` coins (base).
- **Revisiting a hex:** diminishing reward, e.g. `max(1, round(base * 0.1))` = `+1`,
  optionally with a **cooldown** (no revisit reward if `lastVisited` was < N hours ago) so
  riding in circles at one spot doesn't farm coins.
- **Reveal radius:** on each GPS update, reveal the current hex **plus neighbors within
  `revealRadiusM`** so a road-speed ride reveals a continuous ribbon, not dotted cells.
- **Anti-cheat / sanity (local):** ignore GPS jumps implying speed > ~120 km/h; ignore
  updates with accuracy worse than a threshold (e.g. > 50 m) for reward purposes.
- **Distance-based bonus (optional):** small per-km bonus to reward long rides.

All constants live in one `economy.ts` config so we can balance later.

---

## 7. Fog of War — rendering approach

**Model:** the set of explored H3 cells (from IndexedDB, plus this ride's live additions).

**Render (recommended):** a single MapLibre **fill layer** that covers the visible area in
a dark, semi-opaque color, with the **explored hexes cut out as holes** (polygon with
holes). As new cells are revealed, update the GeoJSON source. Add a soft blur/feather at
the edges later for a nicer look.

- Pros: crisp, GPU-rendered, integrates with map pan/zoom, cheap to update incrementally.
- Alternative if needed: a `<canvas>` overlay with `globalCompositeOperation` masking
  (draw dark, erase circles at explored spots). Keep as fallback.

Only the fog for the **current viewport** needs to be materialized — query explored cells
by the visible bounding box to keep it fast even after months of riding.

---

## 8. Offline Maps — the important part

**Goal:** see real streets/terrain while riding with the network off.

**Approach:** **Protomaps + PMTiles**.
- A `.pmtiles` file is a single archive containing vector map tiles for a chosen area.
- MapLibre reads it directly in the browser via the `pmtiles` protocol — no tile server.

**How the file gets onto the phone (MVP path):**
1. During development, download a **regional extract** (e.g. your city/region) as one
   `.pmtiles` (from Protomaps builds / a small self-run extract).
2. Ship it so the app can fetch it once, then the **service worker caches it** → available
   offline thereafter. (For a city-sized area this is a modest download.)

**Phase 2 (nicer UX):** an in-app **"Download this area for offline"** flow that lets you
pick a region on the map and stores its `.pmtiles` into **IndexedDB / OPFS**, read via a
custom MapLibre protocol. This avoids bundling a big file with the app and lets you add
regions as you travel.

> Trade-off to accept: truly offline maps require choosing/downloading region(s) up front.
> That's inherent to "no internet while riding" — we just make it a one-tap download.

---

## 9. Screens / Navigation

- **Main Menu**
  - `Start Ride` (primary, big) → goes straight to Ride screen and begins tracking.
  - `Wallet` (coin balance, ride history).
  - `Map` (browse explored world without tracking).
  - `Settings` (units, reveal radius, offline map downloads).
  - `Game` (later) — spend coins.
- **Ride** — fullscreen map, live position marker, fog, live stats (distance, coins this
  ride, speed), a **map-style switcher** (Dark / Light / etc., swappable live without
  losing the fog or your position), and a **Stop** button. Screen kept awake via Wake Lock.
- **Wallet** — balance, ledger, list of past rides.
- **Game** (later) — separate module; only consumes the wallet API.

### Look & feel (design language)
The app should feel **cool and professional**, not like a dev demo. Target vibe:
**dark, sleek, game-like HUD** over a live map.
- **Dark-first theme** with a vivid accent (electric cyan/lime) for coins, active states,
  and the revealed-trail glow. High contrast for daylight readability while riding.
- **HUD-style ride overlay**: large, glanceable stats (coins, distance, speed) in floating
  cards with subtle blur/translucency over the map — readable at a glance mid-ride.
- **Big touch targets**, thumb-reachable primary actions (Start / Stop), minimal chrome.
- **Fog reveal**: soft feathered edges and a gentle glow at the frontier, so uncovering
  feels satisfying rather than blocky.
- **Micro-interactions**: coin +N popups, subtle haptics on reveal, smooth camera follow.
- **Consistent design tokens** (colors, spacing, radius, typography) so the later game
  screens match the ride UI. A crisp custom icon + splash for the installed PWA.
- Tech for polish: a small component set + CSS variables (or Tailwind), tasteful motion
  via a lightweight animation lib. No heavy UI kit that makes it look generic.

---

## 10. Project Structure (proposed)

```
Bike/
├─ PLAN.md
├─ index.html
├─ package.json
├─ vite.config.ts
├─ public/
│  ├─ manifest.webmanifest
│  ├─ icons/                 # PWA icons
│  └─ maps/                  # bundled .pmtiles (MVP) + map style json
├─ src/
│  ├─ main.tsx
│  ├─ app/                   # routing, layout, providers
│  ├─ screens/
│  │  ├─ Menu/
│  │  ├─ Ride/
│  │  ├─ Wallet/
│  │  └─ Game/               # placeholder for later
│  ├─ map/                   # MapLibre setup, pmtiles, fog layer
│  ├─ domain/
│  │  ├─ tracker.ts          # RideTracker (geolocation)
│  │  ├─ explorer.ts         # H3 reveal logic
│  │  ├─ economy.ts          # coin rules/config
│  │  └─ wallet.ts
│  ├─ data/                  # Dexie db + repositories
│  ├─ state/                 # Zustand stores
│  ├─ hooks/                 # useGeolocation, useWakeLock, ...
│  └─ lib/                   # geo utils (turf wrappers), ids, time
└─ tests/                    # domain logic unit tests
```

---

## 11. Roadmap / Milestones

### Milestone 0 — Scaffold
- Vite + React + TS project, PWA plugin, manifest + icons, installable on Android.
- **GitHub Actions → Pages** deploy wired up; first push publishes a live HTTPS URL.
- **Design system foundation**: dark theme, design tokens (colors/space/type), base
  components — so it looks polished from the first screen, not a default template.
- Main Menu (branded) with a big **Start Ride** button + Wallet/Settings entries.
- A first **map view** (dark OSM basemap via MapLibre) with your **live GPS position**
  and a **placeholder fog overlay**, so you can install it and see it move on a real ride.

### Milestone 1 — Live map + position
- MapLibre map rendering (online tiles first to get moving).
- Geolocation `watchPosition`, live position marker, follow-me camera.
- Wake Lock during ride; Start/Stop ride flow.

### Milestone 2 — Fog of war + exploration
- H3 conversion of positions, reveal radius, explored-cell set.
- Fog fill layer with holes; incremental reveal as you move.
- Persist explored cells in IndexedDB.

### Milestone 3 — Coins
- CoinEconomy (new vs revisit + cooldown), wallet + ledger.
- Live "coins this ride" + total balance; Wallet screen with history.

### Milestone 4 — Offline maps
- Switch base map to **PMTiles**; bundle a regional extract.
- Service worker precaches app shell + map file → verify airplane-mode ride works.

### Milestone 5 — Polish
- Ride stats (distance, duration, avg speed), ride summary screen.
- Fog visual polish (feathered edges), settings screen, robustness (GPS loss, resume).

### Milestone 6 — The game (separate effort)
- Design + build the coin-spending mini-game against the wallet API.

### Future — Cloud/social
- Optional account + sync (explored cells, wallet), shared/competitive maps.
- Architecture keeps persistence behind a repository layer so a sync backend can be added
  without rewriting domain logic.

---

## 12. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| GPS drift/jitter reveals wrong cells | Accuracy filter + optional light smoothing; ignore low-accuracy fixes for rewards. |
| Battery drain (GPS + screen + WebGL) | Foreground-only, sensible GPS interval, keep map light; show a battery tip. |
| Offline map file size | Ship a single region for MVP; per-region on-demand download in Phase 2. |
| Storage growth over time | Downsample ride paths; fog stored as compact H3 set; query by viewport. |
| PWA offline first-load confusion | Clear "install & go for a test ride with WiFi first" onboarding step. |
| iOS later | Not targeted now; note Wake Lock/PWA limits if we expand. |

---

## 13. Open Questions (for later, not blocking)

1. **Region:** which city/area should the first offline map cover?
2. **Reveal feel:** how big should the revealed ribbon be (radius in meters)?
3. **Economy balance:** starting coin values and revisit cooldown length.
4. **Game direction:** town builder vs RPG vs idle — affects wallet/spend API shape.
5. **Ride metrics:** do you want speed/elevation/time stats saved per ride?

---

## 14. Next Step

If this looks good, the concrete first action is **Milestone 0**: scaffold the Vite +
React + TS PWA so it installs on your phone from a URL, with a Main Menu and a working
"Start Ride" button that opens a (for now online) map with your live position.
```
