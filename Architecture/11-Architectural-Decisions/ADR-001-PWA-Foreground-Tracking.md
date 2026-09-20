# ADR-001: PWA with Foreground-Only Ride Tracking

<details><summary>Documentation Hints</summary>Record context, decision, alternatives, and consequences.</details>

**Status:** Accepted  
**Date:** 2026-09-18

## Context

VeloTerra needs installable mobile behavior with minimal distribution and operating cost. Reliable background GPS is not available to a suspended pure web application.

## Decision

Deliver an installable PWA. Track rides only while the browser keeps the application active. Request Wake Lock during active/paused rides. Do not wrap the application in a native shell at this stage.

## Consequences

- Installation and updates use an HTTPS URL rather than an app store.
- One frontend codebase serves development and production.
- Riders must keep the application foregrounded and screen awake.
- Battery use and interrupted tracking remain product risks.
- Native background tracking remains a future option, not current architecture.