# 3. Architecture Constraints

<details>
<summary>Documentation Hints</summary>

Document technical, organizational, operational, and legal constraints that shape the solution.
</details>

## Technical Constraints

| Constraint | Consequence |
|---|---|
| Browser/PWA platform | No guaranteed background geolocation after browser suspension. |
| Foreground tracking | Wake Lock reduces suspension risk but is not a background execution mechanism. |
| Static hosting | Runtime application logic must execute in the browser; server features use external services. |
| GitHub Pages subpaths | Router, OAuth redirects, PWA scope, service worker, and worker assets must use `BASE_URL`. |
| Browser storage | Persistence and quota behavior vary by browser and may be cleared by the user or platform. |
| Service worker requirement | Explicit offline downloads are unavailable on the Vite development server. |
| Geolocation permission | A ride cannot start in production until a position fix is available. |
| H3 resolution 11 | Existing cell data is normalized to this resolution during local and cloud migration. |
| Metric-only UI | Distance and speed are currently displayed in meters/kilometers and km/h. |

## Technology Constraints

- React 18, TypeScript, and Vite.
- MapLibre GL JS with OpenFreeMap styles and map data.
- H3 for exploration geometry.
- Dexie/IndexedDB for structured local persistence.
- Zustand for application state.
- Workbox through `vite-plugin-pwa` for app-shell and map caching.
- Supabase and Google OAuth for optional cloud identity and storage.

## Operational and Legal Constraints

- Main deployment uses GitHub Pages and GitHub Actions.
- Development deployment uses the separate `velonext` Pages repository and a scoped secret.
- OpenStreetMap attribution must remain visible.
- Supabase publishable credentials are public by design; authorization therefore depends on RLS.
- The project currently has no dedicated backend, observability platform, or paid infrastructure.