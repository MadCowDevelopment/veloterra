# ADR-004: Fixed H3 Exploration Grid

<details><summary>Documentation Hints</summary>Record context, decision, alternatives, and consequences.</details>

**Status:** Accepted  
**Date:** 2026-09-18

## Context

Exploration needs a compact, deterministic unit for reveal, reward, persistence, rendering, and synchronization. Raw paths or arbitrary circles do not provide stable identity.

## Decision

Represent territory with H3 resolution-11 identifiers. Reveal the current cell and one neighboring ring per accepted fix. Keep resolution and reveal radius fixed for comparable progression. Normalize finer legacy cells to their resolution-11 parent.

## Consequences

- Membership and merge operations use stable string identifiers.
- A typical fix processes seven cells.
- Fog geometry is generated from H3 polygons.
- Changing resolution requires explicit migration and economy analysis.
- Rendering cost grows with explored cells in the viewport.