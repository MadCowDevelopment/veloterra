# ADR-003: MapLibre and OpenFreeMap Basemap

<details><summary>Documentation Hints</summary>Record context, decision, alternatives, and consequences.</details>

**Status:** Accepted  
**Date:** 2026-09-18

## Context

The application requires interactive vector maps, custom fog layers, route rendering, multiple styles, and no per-user API key.

## Decision

Use MapLibre GL JS for rendering and OpenFreeMap for styles and map assets. Keep OpenStreetMap attribution visible. Isolate style URLs and map-specific components under `src/map`.

## Consequences

- Custom GeoJSON fog and route layers execute on the GPU.
- Multiple styles can share the same tile source and offline cache.
- Online mapping depends on OpenFreeMap availability and compatibility.
- MapLibre worker assets require explicit build and development handling.
- Provider migration remains possible but requires compatible style/tile assets.