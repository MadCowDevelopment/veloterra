# ADR-005: Workbox Tile Caching Instead of PMTiles

<details><summary>Documentation Hints</summary>Record context, decision, alternatives, and consequences.</details>

**Status:** Accepted  
**Date:** 2026-09-18

## Context

Early planning proposed regional PMTiles archives. The implemented application already consumes OpenFreeMap HTTP assets and needs arbitrary user-selected regions plus style switching.

## Decision

Use a Workbox CacheFirst runtime cache for visited OpenFreeMap resources. Implement explicit region download by enumerating and fetching styles, glyphs, sprites, raster, and vector tiles through zoom 14. Store region URL metadata in IndexedDB. Do not use PMTiles in the current architecture.

## Consequences

- No tile server or archive-building pipeline is required.
- Region selection is flexible and all configured styles can work offline.
- Downloads require an active service worker and many HTTP requests.
- Browser cache quotas and eviction are outside application control.
- The application depends on provider URL stability.