# ADR-010: Automatic Development GPS Simulation

<details><summary>Documentation Hints</summary>Record context, decision, alternatives, and consequences.</details>

**Status:** Accepted  
**Date:** 2026-09-18

## Context

Desktop development frequently has no usable GPS, making the complete ride path difficult to exercise. URL parameters are brittle because menu navigation can remove them and could expose confusing production behavior.

## Decision

When `import.meta.env.DEV` is true, `useGeolocation` supplies a valid initial fix and map clicks emit subsequent fixes. Production builds always use browser geolocation. Label simulation in the HUD and suppress finish-triggered cloud sync.

## Consequences

- Normal menu navigation works for local testing without parameters.
- Distance, path, fog, rewards, and summaries use the production processing path.
- Real GPS cannot be tested through the normal Vite development mode.
- Simulated progress currently shares local browser stores and can contaminate later tests.
- Production behavior still requires preview/device acceptance testing.