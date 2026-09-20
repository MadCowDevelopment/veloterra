# ADR-002: Local-First Browser Persistence

<details><summary>Documentation Hints</summary>Record context, decision, alternatives, and consequences.</details>

**Status:** Accepted  
**Date:** 2026-09-18

## Context

Core riding must work without connectivity or an account. Ride and exploration data are structured and can grow beyond practical localStorage use.

## Decision

Use Dexie/IndexedDB for cells, rides, and offline-region metadata. Use persisted Zustand/localStorage for small wallet and preference state. Treat cloud synchronization as optional reconciliation rather than the primary write path.

## Consequences

- Ride processing has no cloud round trip.
- Signed-out users retain full local functionality.
- Browser eviction or profile loss can remove unsynchronized data.
- Multiple local stores require coordinated reset and consistency handling.
- IndexedDB schema and domain-data migrations must remain backward compatible.